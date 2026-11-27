// Armazenamento e resolução unificada de Regras de Ponto e integração com Escala 5x2 por empresa.
// Permite que alterações feitas pelo usuário nas abas (Escala 5x2, Banco de Horas, Relatórios)
// reflitam automaticamente em todo o site sem necessidade de alterar código.

import { Employee } from '../types';
import { supabase } from '../supabaseClient';
import {
  CollectiveRule,
  CustomShiftProfile,
  DEFAULT_GROUP_CONFIGS,
  DEFAULT_MTE_POLICY,
  DEFAULT_SHIFT_PROFILES,
  DEFAULT_SHIFT_TEMPLATE,
  generateAndAuditSchedule,
  GroupConfig,
  GroupId,
  ManualWeekOverrides,
  MtePolicyConfig,
  resolveShiftForEmployeeInWeek,
  ScheduleEmployeeConfig,
  ShiftTemplate,
  SolverResult,
  Weekday,
} from './scheduleSolver5x2';

export const SCHEDULE_STORAGE_KEY_PREFIX = 'ponto_schedule_5x2_config_v4';
const RULES_STORAGE_KEY_PREFIX = 'ponto_company_rules_v1';

/**
 * Verifica se o funcionário está desativado de forma geral (salvo no JSONB custom_schedule._inactive
 * para funcionar imediatamente no Supabase sem exigir migração SQL).
 */
export function isEmployeeInactive(emp?: Employee | null): boolean {
  if (!emp) return false;
  if ((emp as any).is_active === false) return true;
  const cs = emp.custom_schedule as any;
  return Boolean(cs && cs._inactive === true);
}

export interface EmployeeVacation {
  id: string;
  employeeId: string;
  month: number; // 0..11 (0 = Janeiro)
  year: number;
}

export interface StoredSchedule5x2Config {
  employees: ScheduleEmployeeConfig[];
  rules: CollectiveRule[];
  shift: ShiftTemplate;
  policy?: MtePolicyConfig;
  groups?: GroupId[];
  groupConfigs?: GroupConfig[];
  shiftProfiles?: CustomShiftProfile[];
  manualOverrides?: ManualWeekOverrides;
  vacations?: EmployeeVacation[];
  updatedAt?: string;
}

/**
 * Extrai a configuração da Escala 5x2 salva na nuvem (Supabase) a partir do campo JSONB
 * `custom_schedule._schedule_5x2_config` dos funcionários da empresa selecionada.
 */
export function extractCloudSchedule5x2FromEmployees(
  emps: Employee[],
  companyId: string
): StoredSchedule5x2Config | null {
  const candidates = emps.filter((e) => (!companyId ? true : e.company_id === companyId));
  let best: StoredSchedule5x2Config | null = null;
  let bestTime = '';

  for (const emp of candidates) {
    const cs = emp.custom_schedule as any;
    const cfg = cs?._schedule_5x2_config;
    if (cfg && Array.isArray(cfg.employees) && Array.isArray(cfg.rules)) {
      const t = cfg.updatedAt || '';
      if (!best || t >= bestTime) {
        best = cfg as StoredSchedule5x2Config;
        bestTime = t;
      }
    }
  }
  return best;
}

/**
 * Salva a configuração completa da Escala 5x2 na nuvem (Supabase), armazenando-a no JSONB
 * `custom_schedule._schedule_5x2_config` do primeiro funcionário âncora da empresa.
 */
export async function saveCloudSchedule5x2(
  emps: Employee[],
  companyId: string,
  config: StoredSchedule5x2Config
): Promise<{ ok: boolean; error?: string }> {
  const candidates = emps.filter((e) => (!companyId ? true : e.company_id === companyId));
  const anchor = candidates[0];
  if (!anchor) {
    return { ok: false, error: 'Nenhum funcionário cadastrado nesta empresa para vincular o salvamento na nuvem.' };
  }

  const payloadConfig: StoredSchedule5x2Config = {
    ...config,
    updatedAt: new Date().toISOString(),
  };

  const nextCustomSchedule = {
    ...(anchor.custom_schedule || {}),
    _schedule_5x2_config: payloadConfig,
  };

  const { error } = await supabase
    .from('employees')
    .update({ custom_schedule: nextCustomSchedule })
    .eq('id', anchor.id);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export interface TimeBankAdjustment {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  minutes: number; // positivo = crédito, negativo = débito
  reason: string;
}

export interface CompanyPointRules {
  useSchedule5x2InReportsAndTimeBank: boolean;
  cltDailyToleranceMinutes: number; // 0 = exato, 10 = CLT Art. 58 §1º, ou qualquer valor
  partialAbsenceMode: 'fixed_minutes' | 'half_expected';
  partialAbsenceFixedMinutes: number; // Padrão: 240 (4h)
  ignoreIncompleteTodayInTimeBank: boolean; // Padrão: true
  showAutoAbsencesInReports: boolean; // Padrão: true
  adjustments: TimeBankAdjustment[];
}

export const DEFAULT_COMPANY_RULES: CompanyPointRules = {
  useSchedule5x2InReportsAndTimeBank: true,
  cltDailyToleranceMinutes: 0,
  partialAbsenceMode: 'fixed_minutes',
  partialAbsenceFixedMinutes: 240,
  ignoreIncompleteTodayInTimeBank: true,
  showAutoAbsencesInReports: true,
  adjustments: [],
};

export function getCompanyScheduleStorageKey(companyId?: string | null): string {
  return `${SCHEDULE_STORAGE_KEY_PREFIX}_${companyId || 'all'}`;
}

export function getCompanyRulesStorageKey(companyId?: string | null): string {
  return `${RULES_STORAGE_KEY_PREFIX}_${companyId || 'all'}`;
}

export function loadCompanyRules(companyId?: string | null): CompanyPointRules {
  try {
    const raw =
      localStorage.getItem(getCompanyRulesStorageKey(companyId)) ||
      (companyId ? localStorage.getItem(getCompanyRulesStorageKey('')) : null);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_COMPANY_RULES,
        ...parsed,
        adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
      };
    }
  } catch {
    // fallback para padrão
  }
  return { ...DEFAULT_COMPANY_RULES };
}

export function saveCompanyRules(companyId: string | null | undefined, rules: CompanyPointRules): void {
  try {
    localStorage.setItem(getCompanyRulesStorageKey(companyId), JSON.stringify(rules));
  } catch {
    // ignora erro de quota
  }
}

export function loadRawStoredSchedule5x2(companyId?: string | null): StoredSchedule5x2Config | null {
  try {
    const key = getCompanyScheduleStorageKey(companyId);
    const raw =
      localStorage.getItem(key) ||
      (!companyId ? localStorage.getItem(SCHEDULE_STORAGE_KEY_PREFIX) : null) ||
      (companyId ? localStorage.getItem( getCompanyScheduleStorageKey('') ) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.employees) && Array.isArray(parsed.rules)) {
      return {
        employees: parsed.employees,
        rules: parsed.rules,
        shift: parsed.shift || DEFAULT_SHIFT_TEMPLATE,
        policy: { ...DEFAULT_MTE_POLICY, ...(parsed.policy || {}) },
        groups: parsed.groups,
        groupConfigs: parsed.groupConfigs || DEFAULT_GROUP_CONFIGS,
        shiftProfiles: parsed.shiftProfiles || DEFAULT_SHIFT_PROFILES,
        manualOverrides: parsed.manualOverrides || {},
        vacations: Array.isArray(parsed.vacations) ? parsed.vacations : [],
      };
    }
  } catch {
    // ignora erro de parse
  }
  return null;
}

// Cache em memória para evitar recalcular o solver repetidas vezes no mesmo mês
const solverCache = new Map<string, SolverResult>();

function getCachedMonthSchedule(
  companyId: string | undefined | null,
  year: number,
  monthIndex0: number,
  cfg: StoredSchedule5x2Config
): SolverResult {
  const vacationIds = new Set(
    (cfg.vacations || [])
      .filter((v) => v.year === year && v.month === monthIndex0)
      .map((v) => v.employeeId)
  );
  const activeEmps = cfg.employees.filter((e) => !vacationIds.has(e.id));
  const activeIds = new Set(activeEmps.map((e) => e.id));
  const activeRules = cfg.rules
    .map((r) => ({
      ...r,
      employeeIds: r.employeeIds.filter((id) => activeIds.has(id)),
    }))
    .filter((r) => r.type === 'day_cap' || r.type === 'min_present' || r.employeeIds.length >= 2);

  const sig = JSON.stringify({
    c: companyId || 'all',
    y: year,
    m: monthIndex0,
    e: activeEmps,
    r: activeRules,
    s: cfg.shift,
    p: cfg.policy,
    gc: cfg.groupConfigs,
    sp: cfg.shiftProfiles,
    mo: cfg.manualOverrides,
  });
  const cached = solverCache.get(sig);
  if (cached) return cached;

  if (solverCache.size > 24) {
    solverCache.clear();
  }

  const res = generateAndAuditSchedule(
    year,
    monthIndex0,
    activeEmps,
    activeRules,
    cfg.shift,
    cfg.policy || DEFAULT_MTE_POLICY,
    {
      groupConfigs: cfg.groupConfigs || DEFAULT_GROUP_CONFIGS,
      shiftProfiles: cfg.shiftProfiles || DEFAULT_SHIFT_PROFILES,
      manualOverrides: cfg.manualOverrides || {},
    }
  );
  solverCache.set(sig, res);
  return res;
}

export interface ResolvedEmployeeDaySchedule {
  foundIn5x2: boolean;
  isWorkDay: boolean;
  offReason?: 'DSR' | 'FOLGA_5X2';
  workStart: string;
  breakStart: string;
  breakEnd: string;
  workEnd: string;
  weeklyHours: number;
}

function normalizeName(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Consulta se o colaborador possui jornada/folga resolvida na Escala 5x2 na data `dateStr` (YYYY-MM-DD).
 * Retorna `null` se a integração estiver desativada ou o colaborador não estiver na Escala 5x2 salva.
 */
export function resolveEmployeeDayFrom5x2(
  emp: Employee,
  dateStr: string,
  forceUse5x2?: boolean
): ResolvedEmployeeDaySchedule | null {
  const companyId = emp.company_id || '';
  const rules = loadCompanyRules(companyId);
  const shouldUse = forceUse5x2 !== undefined ? forceUse5x2 : rules.useSchedule5x2InReportsAndTimeBank;
  if (!shouldUse) return null;

  const cfg = loadRawStoredSchedule5x2(companyId);
  if (!cfg || cfg.employees.length === 0) return null;

  const empNorm = normalizeName(emp.name);
  const firstToken = empNorm.split(/\s+/)[0];

  const schedEmp = cfg.employees.find((se) => {
    if (se.id === emp.id) return true;
    const seNorm = normalizeName(se.name);
    if (seNorm === empNorm) return true;
    // Compatibilidade caso na escala esteja primeiro nome único (ex: "Cris" vs "Cris Silva")
    if (seNorm === firstToken && cfg.employees.filter((x) => normalizeName(x.name) === firstToken).length === 1) {
      return true;
    }
    return false;
  });

  if (!schedEmp) return null;

  const [yStr, mStr, dStr] = dateStr.split('-');
  const year = Number(yStr);
  const month0 = Number(mStr) - 1;
  const day = Number(dStr);
  if (!year || isNaN(month0) || !day) return null;

  const dt = new Date(year, month0, day);
  const dow = dt.getDay(); // 0=Dom, 1=Seg..6=Sab

  // Se o colaborador está de férias neste mês/ano, não é dia de trabalho
  const isOnVacation = (cfg.vacations || []).some(
    (v) => v.employeeId === schedEmp.id && v.year === year && v.month === month0
  );
  if (isOnVacation) {
    return {
      foundIn5x2: true,
      isWorkDay: false,
      offReason: 'FOLGA_5X2',
      workStart: '',
      breakStart: '',
      breakEnd: '',
      workEnd: '',
      weeklyHours: 0,
    };
  }

  const solverRes = getCachedMonthSchedule(companyId, year, month0, cfg);
  if (!solverRes.success) return null;

  const weekIdx = solverRes.weeks.findIndex((w) => Object.values(w.datesByDow).includes(dateStr));
  if (weekIdx < 0) return null;

  const assign = solverRes.assignments[weekIdx];
  const offDay = assign.offDayByEmployee[schedEmp.id] as Weekday | 0 | undefined;

  if (dow === 0) {
    return {
      foundIn5x2: true,
      isWorkDay: false,
      offReason: 'DSR',
      workStart: '',
      breakStart: '',
      breakEnd: '',
      workEnd: '',
      weeklyHours: assign.legalMaxWeeklyHours,
    };
  }

  if (offDay === dow || (dow === 6 && schedEmp.offMode === 'mon_fri')) {
    return {
      foundIn5x2: true,
      isWorkDay: false,
      offReason: 'FOLGA_5X2',
      workStart: '',
      breakStart: '',
      breakEnd: '',
      workEnd: '',
      weeklyHours: assign.legalMaxWeeklyHours,
    };
  }

  const shift = resolveShiftForEmployeeInWeek(
    schedEmp,
    assign.legalMaxWeeklyHours,
    assign.appliedShift,
    cfg.policy || DEFAULT_MTE_POLICY,
    offDay,
    {
      groupConfigs: cfg.groupConfigs || DEFAULT_GROUP_CONFIGS,
      shiftProfiles: cfg.shiftProfiles || DEFAULT_SHIFT_PROFILES,
      manualOverrides: cfg.manualOverrides || {},
    }
  );

  if (dow === 6) {
    const satStart = shift.saturdayStart || '07:00';
    const satEnd = shift.saturdayEnd || '12:00';
    if (satStart === satEnd) {
      return {
        foundIn5x2: true,
        isWorkDay: false,
        offReason: 'FOLGA_5X2',
        workStart: '',
        breakStart: '',
        breakEnd: '',
        workEnd: '',
        weeklyHours: shift.weeklyHours,
      };
    }
    return {
      foundIn5x2: true,
      isWorkDay: true,
      workStart: satStart,
      breakStart: shift.saturdayBreakStart && shift.saturdayBreakStart !== '-' ? shift.saturdayBreakStart : '',
      breakEnd: shift.saturdayBreakEnd && shift.saturdayBreakEnd !== '-' ? shift.saturdayBreakEnd : '',
      workEnd: satEnd,
      weeklyHours: shift.weeklyHours,
    };
  }

  return {
    foundIn5x2: true,
    isWorkDay: true,
    workStart: shift.workStart,
    breakStart: shift.breakStart && shift.breakStart !== '-' ? shift.breakStart : '',
    breakEnd: shift.breakEnd && shift.breakEnd !== '-' ? shift.breakEnd : '',
    workEnd: shift.workEnd,
    weeklyHours: shift.weeklyHours,
  };
}
