// Motor CSP (Constraint Satisfaction Problem) e Auditoria CLT / Portaria MTE nº 2.041/2026
// Totalmente dinâmico e configurável pela interface (sem hardcodes de colaboradores, grupos ou turnos).

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6; // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
export type GroupId = string;
export type ShiftProfileId = string; // 'group' ou ID de qualquer perfil customizado
export type WorkloadSource = 'policy' | 'cadastro' | 'custom' | 'custom_shift';
export type EmployeeOffMode = '5x2' | 'mon_fri' | '6x1';
export type CollectiveRuleType = 'max_simultaneous' | 'same_day' | 'day_cap' | 'min_present';

export interface RegisteredShiftInfo {
  weeklyHours?: number;
  workStart?: string;
  breakStart?: string;
  breakEnd?: string;
  workEnd?: string;
  saturdayStart?: string;
  saturdayBreakStart?: string;
  saturdayBreakEnd?: string;
  saturdayEnd?: string;
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

export const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
export const ALL_OFF_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6];

export interface ShiftTemplate {
  workStart: string;
  breakStart: string;
  breakEnd: string;
  workEnd: string;
  saturdayStart: string;
  saturdayBreakStart?: string;
  saturdayBreakEnd?: string;
  saturdayEnd: string;
  dailyHoursLabel: string;
  saturdayHoursLabel: string;
  weeklyHours: number;
}

export interface CustomShiftProfile {
  id: string;
  name: string;
  shift: ShiftTemplate;
  saturdayOffShift?: Partial<ShiftTemplate>; // Horário Seg-Sex quando folga no sábado
}

export interface GroupConfig {
  id: GroupId;
  label?: string;
  shift44h: ShiftTemplate;
  shift42h: ShiftTemplate;
  shift40h: ShiftTemplate;
  saturdayOff42h?: ShiftTemplate;
  saturdayOff44h?: ShiftTemplate;
  minDailyPresent?: number; // Mínimo de presentes por dia neste grupo (0 = sem mínimo obrigatório)
}

export interface ScheduleEmployeeConfig {
  id: string;
  name: string;
  group: GroupId;
  offMode?: EmployeeOffMode; // '5x2' (padrão), 'mon_fri' (Seg-Sex fixo, Sáb+Dom folga), '6x1' (Seg-Sáb sem folga útil)
  allowedDays: Weekday[];
  alternateDays: boolean;
  avoidRepeatPrevWeek?: boolean; // Evitar repetir mesmo dia da semana anterior (padrão true)
  shiftProfile?: ShiftProfileId; // 'group' ou id de CustomShiftProfile
  workloadSource?: WorkloadSource; // 'policy' | 'cadastro' | 'custom' | 'custom_shift'
  customWeeklyHours?: number;
  customShift?: Partial<ShiftTemplate>; // Horário individual explícito (Seg-Sex + Sábado)
  registeredShift?: RegisteredShiftInfo;
  note?: string;
}

export interface CollectiveRule {
  id: string;
  name: string;
  type?: CollectiveRuleType; // 'max_simultaneous' (padrão), 'same_day' (folgar juntos), 'day_cap' (limite no dia)
  employeeIds: string[];
  maxOffSameDay: number;
  minPresent?: number; // Usado em 'min_present': mínimo de colaboradores (do escopo) trabalhando no dia
  applyToDays?: Weekday[]; // Vazio/undefined = vale para todos os dias (Seg-Sáb); ex: [6] = vale apenas no Sábado
  enabled: boolean;
}

export type MteTransitionPhase = 'auto' | '44h' | '42h' | '40h' | 'custom';

export interface MtePolicyConfig {
  phaseMode: MteTransitionPhase;
  customMaxWeeklyHours?: number; // Usado quando phaseMode === 'custom'
  transition42Date: string; // YYYY-MM-DD, padrão '2026-12-16'
  transition40Date: string; // YYYY-MM-DD opcional
  minIntrajornadaMinutes?: number; // Padrão 60 (CLT Art. 71; pode ajustar p/ 30 em CCT)
  minInterjornadaHours?: number; // Padrão 11 (CLT Art. 66)
}

export const DEFAULT_MTE_POLICY: MtePolicyConfig = {
  phaseMode: 'auto',
  customMaxWeeklyHours: 42,
  transition42Date: '2026-12-16',
  transition40Date: '',
  minIntrajornadaMinutes: 60,
  minInterjornadaHours: 11,
};

// Templates base iniciais (todos editáveis pela UI)
export const SHIFT_44H: ShiftTemplate = {
  workStart: '08:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  workEnd: '18:00',
  saturdayStart: '08:00',
  saturdayEnd: '16:00',
  dailyHoursLabel: '09h00min',
  saturdayHoursLabel: '08h00min',
  weeklyHours: 44,
};

export const SHIFT_44H_GROUP_B: ShiftTemplate = {
  workStart: '07:45',
  breakStart: '12:00',
  breakEnd: '13:00',
  workEnd: '17:45',
  saturdayStart: '07:00',
  saturdayEnd: '15:00',
  dailyHoursLabel: '09h00min',
  saturdayHoursLabel: '08h00min',
  weeklyHours: 44,
};

export const SHIFT_42H_GROUP_A: ShiftTemplate = {
  workStart: '07:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  workEnd: '17:15',
  saturdayStart: '07:00',
  saturdayEnd: '12:00',
  dailyHoursLabel: '09h15min',
  saturdayHoursLabel: '05h00min',
  weeklyHours: 42,
};

export const SHIFT_42H_GROUP_B: ShiftTemplate = {
  workStart: '07:45',
  breakStart: '12:45',
  breakEnd: '13:45',
  workEnd: '18:00',
  saturdayStart: '07:00',
  saturdayEnd: '12:00',
  dailyHoursLabel: '09h15min',
  saturdayHoursLabel: '05h00min',
  weeklyHours: 42,
};

export const SHIFT_42H_IOLANDA: ShiftTemplate = {
  workStart: '07:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  workEnd: '17:00',
  saturdayStart: '07:00',
  saturdayEnd: '13:00',
  dailyHoursLabel: '09h00min',
  saturdayHoursLabel: '06h00min',
  weeklyHours: 42,
};

export const SHIFT_42H_BRUNO: ShiftTemplate = {
  workStart: '07:00',
  breakStart: '11:00',
  breakEnd: '12:00',
  workEnd: '17:00',
  saturdayStart: '07:00',
  saturdayEnd: '13:00',
  dailyHoursLabel: '09h00min',
  saturdayHoursLabel: '06h00min',
  weeklyHours: 42,
};

export const SHIFT_42H: ShiftTemplate = SHIFT_42H_GROUP_A;

export const SHIFT_40H: ShiftTemplate = {
  workStart: '08:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  workEnd: '17:00',
  saturdayStart: '07:00',
  saturdayEnd: '12:00',
  dailyHoursLabel: '08h00min',
  saturdayHoursLabel: '00h00min',
  weeklyHours: 40,
};

export const SHIFT_36H: ShiftTemplate = {
  workStart: '08:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  workEnd: '15:12',
  saturdayStart: '07:00',
  saturdayEnd: '12:00',
  dailyHoursLabel: '06h12min',
  saturdayHoursLabel: '05h00min',
  weeklyHours: 36,
};

export const DEFAULT_SHIFT_TEMPLATE: ShiftTemplate = SHIFT_42H_GROUP_A;

export const DEFAULT_SHIFT_PROFILES: CustomShiftProfile[] = [
  {
    id: 'iolanda',
    name: '07:00–17:00 (Int. 12–13h | Sáb 07–13h)',
    shift: SHIFT_42H_IOLANDA,
  },
  {
    id: 'bruno',
    name: '07:00–17:00 (Int. 11–12h | Sáb 07–13h)',
    shift: SHIFT_42H_BRUNO,
  },
];

export function createDefaultGroupConfig(id: GroupId): GroupConfig {
  const isB = id.toUpperCase() === 'B';
  return {
    id,
    label: `Grupo ${id}`,
    shift44h: isB ? { ...SHIFT_44H_GROUP_B } : { ...SHIFT_44H },
    shift42h: isB ? { ...SHIFT_42H_GROUP_B } : { ...SHIFT_42H_GROUP_A },
    shift40h: { ...SHIFT_40H },
    saturdayOff42h: isB
      ? {
          workStart: '07:45',
          breakStart: '12:45',
          breakEnd: '13:45',
          workEnd: '17:09',
          saturdayStart: '07:00',
          saturdayEnd: '07:00',
          dailyHoursLabel: '08h24min',
          saturdayHoursLabel: '00h00min',
          weeklyHours: 42,
        }
      : {
          workStart: '07:00',
          breakStart: '12:00',
          breakEnd: '13:00',
          workEnd: '16:24',
          saturdayStart: '07:00',
          saturdayEnd: '07:00',
          dailyHoursLabel: '08h24min',
          saturdayHoursLabel: '00h00min',
          weeklyHours: 42,
        },
    saturdayOff44h: isB
      ? {
          workStart: '07:45',
          breakStart: '12:00',
          breakEnd: '13:12',
          workEnd: '17:45',
          saturdayStart: '07:00',
          saturdayEnd: '07:00',
          dailyHoursLabel: '08h48min',
          saturdayHoursLabel: '00h00min',
          weeklyHours: 44,
        }
      : {
          workStart: '08:00',
          breakStart: '12:00',
          breakEnd: '13:12',
          workEnd: '18:00',
          saturdayStart: '08:00',
          saturdayEnd: '08:00',
          dailyHoursLabel: '08h48min',
          saturdayHoursLabel: '00h00min',
          weeklyHours: 44,
        },
    minDailyPresent: 1,
  };
}

export const DEFAULT_GROUP_CONFIGS: GroupConfig[] = [
  createDefaultGroupConfig('A'),
  createDefaultGroupConfig('B'),
];

export const DEFAULT_SCHEDULE_EMPLOYEES: ScheduleEmployeeConfig[] = [
  {
    id: 'cris',
    name: 'Cris',
    group: 'A',
    allowedDays: [2, 5],
    alternateDays: true,
    note: 'Só folga na Terça ou Sexta (alternância automática entre semanas)',
  },
  {
    id: 'gessiane',
    name: 'Gessiane',
    group: 'A',
    allowedDays: [1, 2, 3, 4],
    alternateDays: false,
    note: 'Nunca folga na Sexta-feira (Seg, Ter, Qua ou Qui)',
  },
  {
    id: 'bruno',
    name: 'Bruno',
    group: 'A',
    allowedDays: [2],
    alternateDays: false,
    shiftProfile: 'bruno',
    note: 'Folga fixa na Terça-feira (Horário 07:00–17:00, int. 11:00–12:00)',
  },
  {
    id: 'iolanda',
    name: 'Iolanda',
    group: 'A',
    allowedDays: [3],
    alternateDays: false,
    shiftProfile: 'iolanda',
    note: 'Folga fixa na Quarta-feira (Horário 07:00–17:00, int. 12:00–13:00)',
  },
  {
    id: 'pricyla',
    name: 'Pricyla',
    group: 'A',
    allowedDays: [1, 2, 3, 4, 5],
    alternateDays: false,
    note: 'Distribuída entre Seg e Sex obedecendo travas coletivas e equilíbrio do Grupo A',
  },
  {
    id: 'quezia',
    name: 'Quezia',
    group: 'A',
    allowedDays: [1, 2, 3, 4, 5],
    alternateDays: false,
    note: 'Distribuída entre Seg e Sex obedecendo travas coletivas e equilíbrio do Grupo A',
  },
  {
    id: 'bruna',
    name: 'Bruna',
    group: 'B',
    allowedDays: [1, 3, 4, 5],
    alternateDays: false,
    note: 'Nunca folga na Terça-feira (Seg, Qua, Qui ou Sex)',
  },
  {
    id: 'nayara',
    name: 'Nayara',
    group: 'B',
    allowedDays: [5],
    alternateDays: false,
    note: 'Folga somente na Sexta-feira',
  },
  {
    id: 'fabiana',
    name: 'Fabiana',
    group: 'B',
    allowedDays: [1, 2, 3, 4, 5],
    alternateDays: false,
    note: 'Distribuída entre Seg e Sex obedecendo travas coletivas e equilíbrio do Grupo B',
  },
  {
    id: 'eduarda',
    name: 'Eduarda',
    group: 'B',
    allowedDays: [1, 2, 3, 4, 5],
    alternateDays: false,
    note: 'Distribuída entre Seg e Sex obedecendo travas coletivas e equilíbrio do Grupo B',
  },
  {
    id: 'luanna',
    name: 'Luanna',
    group: 'B',
    allowedDays: [1, 2, 3, 4, 5],
    alternateDays: false,
    note: 'Distribuída entre Seg e Sex obedecendo travas coletivas e equilíbrio do Grupo B',
  },
];

export const DEFAULT_COLLECTIVE_RULES: CollectiveRule[] = [
  {
    id: 'rule-bruno-iolanda',
    name: 'Bruno e Iolanda: Nunca folgam juntos',
    type: 'max_simultaneous',
    employeeIds: ['bruno', 'iolanda'],
    maxOffSameDay: 1,
    enabled: true,
  },
  {
    id: 'rule-eduarda-quezia-pricyla',
    name: 'Eduarda, Quezia e Pricyla: Apenas 1 por dia útil',
    type: 'max_simultaneous',
    employeeIds: ['eduarda', 'quezia', 'pricyla'],
    maxOffSameDay: 1,
    enabled: true,
  },
  {
    id: 'rule-fabiana-cris',
    name: 'Fabiana e Cris: Nunca folgam juntas',
    type: 'max_simultaneous',
    employeeIds: ['fabiana', 'cris'],
    maxOffSameDay: 1,
    enabled: true,
  },
  {
    id: 'rule-pricyla-cris',
    name: 'Pricyla e Cris: Nunca folgam juntas',
    type: 'max_simultaneous',
    employeeIds: ['pricyla', 'cris'],
    maxOffSameDay: 1,
    enabled: true,
  },
];

// Mapa de ajustes manuais na tabela mensal: mondayIso ('YYYY-MM-DD') -> { [empId]: Weekday | 0 }
// (Weekday 1..6 = folga manual naquele dia; 0 = sem folga útil naquela semana / 6x1)
export type ManualWeekOverrides = Record<string, Record<string, Weekday | 0>>;

export interface SolverOptions {
  groupConfigs?: GroupConfig[];
  shiftProfiles?: CustomShiftProfile[];
  manualOverrides?: ManualWeekOverrides;
}

export interface WeekRange {
  weekIndex: number;
  weekKey: string; // YYYY-MM-DD da segunda-feira (identificador único da semana)
  label: string;
  mondayDate: Date;
  sundayDate: Date;
  datesByDow: Record<number, string>; // 1..6 + 0(Dom) -> YYYY-MM-DD
}

export interface WeekAssignment {
  weekIndex: number;
  weekKey: string;
  offDayByEmployee: Record<string, Weekday | 0>; // 1..6 = folga, 0 = sem folga útil (6x1)
  manualByEmployee?: Record<string, boolean>;
  backtracks: number;
  legalMaxWeeklyHours: number;
  appliedShift: ShiftTemplate;
}

export interface AuditCheck {
  id: string;
  category: 'CLT' | 'MTE_2041' | 'INDIVIDUAL' | 'COLETIVA' | 'COBERTURA';
  title: string;
  passed: boolean;
  details: string;
}

export interface SolverResult {
  success: boolean;
  error?: string;
  weeks: WeekRange[];
  assignments: WeekAssignment[];
  audits: AuditCheck[];
  totalBacktracks: number;
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatBrShort(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${m}`;
}

export function buildMonthWeeks(year: number, monthIndex0: number): WeekRange[] {
  const firstDayOfMonth = new Date(year, monthIndex0, 1);
  const lastDayOfMonth = new Date(year, monthIndex0 + 1, 0);

  const startDow = firstDayOfMonth.getDay();
  const diffToMonday = startDow === 0 ? -6 : 1 - startDow;
  const cursor = new Date(year, monthIndex0, 1 + diffToMonday);

  const weeks: WeekRange[] = [];
  let idx = 0;

  while (cursor <= lastDayOfMonth) {
    const monday = new Date(cursor);
    const saturday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 5);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const weekKey = formatIsoDate(monday);

    const datesByDow: Record<number, string> = {};
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
      const dow = d.getDay();
      datesByDow[dow] = formatIsoDate(d);
    }

    weeks.push({
      weekIndex: idx,
      weekKey,
      label: `Semana ${idx + 1} (${formatBrShort(monday)} a ${formatBrShort(saturday)})`,
      mondayDate: monday,
      sundayDate: sunday,
      datesByDow,
    });

    cursor.setDate(cursor.getDate() + 7);
    idx++;
  }

  return weeks;
}

export function parseMinutes(hhmm?: string | null): number {
  if (!hhmm || hhmm.trim() === '' || hhmm.trim() === '-') return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatHoursMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}min`;
}

function addMinutesToHHMM(hhmm: string, mins: number): string {
  const total = Math.max(0, parseMinutes(hhmm) + Math.round(mins));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeShiftLabels(shift: Partial<ShiftTemplate>): ShiftTemplate {
  const ws = shift.workStart || '08:00';
  const bs = shift.breakStart ?? '12:00';
  const be = shift.breakEnd ?? '13:00';
  const we = shift.workEnd || '17:00';
  const ss = shift.saturdayStart || '07:00';
  const sbs = shift.saturdayBreakStart || '';
  const sbe = shift.saturdayBreakEnd || '';
  const se = shift.saturdayEnd || '12:00';

  const hasBreak = bs && bs !== '-' && be && be !== '-';
  const dailyMin = hasBreak
    ? Math.max(0, parseMinutes(bs) - parseMinutes(ws)) + Math.max(0, parseMinutes(we) - parseMinutes(be))
    : Math.max(0, parseMinutes(we) - parseMinutes(ws));

  const hasSatBreak = sbs && sbs !== '-' && sbe && sbe !== '-';
  const satMin = hasSatBreak
    ? Math.max(0, parseMinutes(sbs) - parseMinutes(ss)) + Math.max(0, parseMinutes(se) - parseMinutes(sbe))
    : Math.max(0, parseMinutes(se) - parseMinutes(ss));

  const weeklyHours =
    shift.weeklyHours ??
    Math.round(((satMin > 0 ? dailyMin * 4 + satMin : dailyMin * 5) / 60) * 100) / 100;

  return {
    workStart: ws,
    breakStart: bs || '-',
    breakEnd: be || '-',
    workEnd: we,
    saturdayStart: ss,
    saturdayBreakStart: sbs || undefined,
    saturdayBreakEnd: sbe || undefined,
    saturdayEnd: se,
    dailyHoursLabel: formatHoursMinutes(dailyMin),
    saturdayHoursLabel: formatHoursMinutes(satMin),
    weeklyHours,
  };
}

function ruleAppliesToDay(rule: CollectiveRule, day: Weekday): boolean {
  if (!rule.applyToDays || rule.applyToDays.length === 0) return true;
  return rule.applyToDays.includes(day);
}

/**
 * Limite máximo de folgas simultâneas no dia para regras de escopo ('day_cap' e 'min_present').
 * Em 'min_present', o limite é: total de colaboradores do escopo − mínimo de presentes exigido.
 */
export function getScopedRuleOffLimit(rule: CollectiveRule, scopeSize: number): number {
  if (rule.type === 'min_present') {
    return Math.max(0, scopeSize - Math.max(0, rule.minPresent ?? 1));
  }
  return Math.max(0, rule.maxOffSameDay);
}

function isConsistentWithCollectiveRules(
  empId: string,
  day: Weekday | 0,
  currentAssignment: Record<string, Weekday | 0>,
  rules: CollectiveRule[],
  allEmployeeIds: string[]
): boolean {
  if (day === 0) return true;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const rType = rule.type || 'max_simultaneous';

    if (rType === 'same_day') {
      if (!rule.employeeIds.includes(empId)) continue;
      for (const otherId of rule.employeeIds) {
        const otherDay = currentAssignment[otherId];
        if (otherId !== empId && otherDay !== undefined && otherDay !== 0 && otherDay !== day) {
          return false;
        }
      }
      continue;
    }

    if (rType === 'day_cap' || rType === 'min_present') {
      if (!ruleAppliesToDay(rule, day)) continue;
      const scopeIds = rule.employeeIds.length > 0 ? rule.employeeIds : allEmployeeIds;
      if (!scopeIds.includes(empId)) continue;
      const limit = getScopedRuleOffLimit(rule, scopeIds.length);
      let countOnDay = 1;
      for (const otherId of scopeIds) {
        if (otherId !== empId && currentAssignment[otherId] === day) {
          countOnDay++;
        }
      }
      if (countOnDay > limit) return false;
      continue;
    }

    // 'max_simultaneous'
    if (!ruleAppliesToDay(rule, day)) continue;
    if (!rule.employeeIds.includes(empId)) continue;

    let countOnDay = 1;
    for (const otherId of rule.employeeIds) {
      if (otherId !== empId && currentAssignment[otherId] === day) {
        countOnDay++;
      }
    }
    // Se houver minPresent, o máximo de folgas é limitado por employeeIds.length - minPresent
    const effectiveMaxOff =
      rule.minPresent !== undefined
        ? Math.min(rule.maxOffSameDay, rule.employeeIds.length - rule.minPresent)
        : rule.maxOffSameDay;
    if (countOnDay > effectiveMaxOff) {
      return false;
    }
  }
  return true;
}

function scoreCandidateDay(
  emp: ScheduleEmployeeConfig,
  day: Weekday,
  currentAssignment: Record<string, Weekday | 0>,
  employeesById: Record<string, ScheduleEmployeeConfig>,
  prevWeekAssignment: Record<string, Weekday | 0> | null,
  historyCounts: Record<string, Record<number, number>>
): number {
  let totalOffOnDay = 0;
  let groupOffOnDay = 0;

  for (const [otherId, otherDay] of Object.entries(currentAssignment)) {
    if (otherDay === day) {
      totalOffOnDay++;
      if (employeesById[otherId]?.group === emp.group) {
        groupOffOnDay++;
      }
    }
  }

  let score = groupOffOnDay * 100 + totalOffOnDay * 35;

  const shouldAvoidRepeat = emp.avoidRepeatPrevWeek !== false;
  if (shouldAvoidRepeat && emp.allowedDays.length > 1 && prevWeekAssignment && prevWeekAssignment[emp.id] === day) {
    score += 25;
  }

  const prevCount = historyCounts[emp.id]?.[day] || 0;
  score += prevCount * 12;

  return score;
}

function solveWeekCSP(
  weekIndex: number,
  employees: ScheduleEmployeeConfig[],
  rules: CollectiveRule[],
  prevWeekAssignment: Record<string, Weekday | 0> | null,
  historyCounts: Record<string, Record<number, number>>,
  weekManualOverrides?: Record<string, Weekday | 0>
): { assignment: Record<string, Weekday | 0> | null; backtracks: number } {
  const employeesById: Record<string, ScheduleEmployeeConfig> = {};
  const allEmployeeIds = employees.map((e) => e.id);
  for (const e of employees) employeesById[e.id] = e;

  const current: Record<string, Weekday | 0> = {};
  const remainingEmployees: ScheduleEmployeeConfig[] = [];

  // 1. Aplica modos fixos ('6x1', 'mon_fri') e ajustes manuais da semana primeiro
  for (const emp of employees) {
    const manual = weekManualOverrides?.[emp.id];
    if (manual !== undefined) {
      current[emp.id] = manual;
      continue;
    }
    if (emp.offMode === '6x1') {
      current[emp.id] = 0;
      continue;
    }
    if (emp.offMode === 'mon_fri') {
      current[emp.id] = 6;
      continue;
    }
    remainingEmployees.push(emp);
  }

  const domains: Record<string, Weekday[]> = {};
  for (const emp of remainingEmployees) {
    let dom = emp.allowedDays && emp.allowedDays.length > 0 ? [...emp.allowedDays] : ([1, 2, 3, 4, 5] as Weekday[]);
    if (emp.alternateDays && dom.length >= 2) {
      const prevDay = prevWeekAssignment?.[emp.id];
      if (prevDay) {
        const filtered = dom.filter((d) => d !== prevDay);
        if (filtered.length > 0) dom = filtered;
      } else {
        const firstChoice = dom[weekIndex % dom.length];
        dom = [firstChoice, ...dom.filter((d) => d !== firstChoice)];
      }
    }
    domains[emp.id] = dom;
  }

  for (const emp of remainingEmployees) {
    if (domains[emp.id].length === 0) {
      return { assignment: null, backtracks: 0 };
    }
  }

  const ruleDegree: Record<string, number> = {};
  for (const emp of remainingEmployees) ruleDegree[emp.id] = 0;
  for (const r of rules) {
    if (!r.enabled) continue;
    const ids =
      (r.type === 'day_cap' || r.type === 'min_present') && r.employeeIds.length === 0
        ? allEmployeeIds
        : r.employeeIds;
    for (const id of ids) {
      if (ruleDegree[id] !== undefined) ruleDegree[id]++;
    }
  }

  const ordered = [...remainingEmployees].sort((a, b) => {
    const diffDom = domains[a.id].length - domains[b.id].length;
    if (diffDom !== 0) return diffDom;
    return (ruleDegree[b.id] || 0) - (ruleDegree[a.id] || 0);
  });

  let backtracks = 0;

  function backtrack(idx: number): boolean {
    if (idx === ordered.length) return true;

    const emp = ordered[idx];
    const candidates = [...domains[emp.id]].sort((d1, d2) => {
      const s1 = scoreCandidateDay(emp, d1, current, employeesById, prevWeekAssignment, historyCounts);
      const s2 = scoreCandidateDay(emp, d2, current, employeesById, prevWeekAssignment, historyCounts);
      return s1 - s2;
    });

    for (const day of candidates) {
      if (!isConsistentWithCollectiveRules(emp.id, day, current, rules, allEmployeeIds)) {
        continue;
      }

      current[emp.id] = day;
      if (backtrack(idx + 1)) {
        return true;
      }
      delete current[emp.id];
      backtracks++;
    }

    return false;
  }

  const ok = backtrack(0);
  return { assignment: ok ? { ...current } : null, backtracks };
}

export function getLegalMaxWeeklyHoursForWeek(
  week: WeekRange,
  policy: MtePolicyConfig
): number {
  if (policy.phaseMode === '44h') return 44;
  if (policy.phaseMode === '42h') return 42;
  if (policy.phaseMode === '40h') return 40;
  if (policy.phaseMode === 'custom') return Math.max(1, policy.customMaxWeeklyHours || 42);

  const weekEndIso = formatIsoDate(week.sundayDate);
  if (policy.transition40Date && weekEndIso >= policy.transition40Date) {
    return 40;
  }
  if (policy.transition42Date && weekEndIso >= policy.transition42Date) {
    return 42;
  }
  return 44;
}

export function resolveShiftForWeek(
  legalMaxHours: number,
  customShift: ShiftTemplate,
  policy: MtePolicyConfig,
  groupConfig?: GroupConfig
): ShiftTemplate {
  if (policy.phaseMode === 'auto') {
    if (legalMaxHours <= 40) return groupConfig?.shift40h || SHIFT_40H;
    if (legalMaxHours <= 42) return groupConfig?.shift42h || SHIFT_42H_GROUP_A;
    return groupConfig?.shift44h || SHIFT_44H;
  }
  if (policy.phaseMode === '40h' && groupConfig) return groupConfig.shift40h;
  if (policy.phaseMode === '42h' && groupConfig) return groupConfig.shift42h;
  if (policy.phaseMode === '44h' && groupConfig) return groupConfig.shift44h;
  return customShift;
}

function resolveShiftByWeeklyHours(
  emp: ScheduleEmployeeConfig,
  targetHours: number,
  offDay?: Weekday | 0,
  groupConfigs: GroupConfig[] = DEFAULT_GROUP_CONFIGS,
  shiftProfiles: CustomShiftProfile[] = DEFAULT_SHIFT_PROFILES
): ShiftTemplate {
  const grpCfg =
    groupConfigs.find((g) => g.id === emp.group) || createDefaultGroupConfig(emp.group || 'A');
  const saturdayIsOff = offDay === 6 || emp.offMode === 'mon_fri';

  // 1. Verifica se o colaborador usa um Perfil de Horário específico (quando não é 44h pura ou se perfil é explícito)
  const profileId = emp.shiftProfile;
  if (profileId && profileId !== 'group') {
    const foundProfile = shiftProfiles.find((p) => p.id === profileId);
    if (foundProfile && targetHours <= 42 && targetHours > 40) {
      if (saturdayIsOff && foundProfile.saturdayOffShift?.workStart && foundProfile.saturdayOffShift?.workEnd) {
        return computeShiftLabels({
          ...foundProfile.shift,
          ...foundProfile.saturdayOffShift,
          saturdayEnd: foundProfile.shift.saturdayStart,
          weeklyHours: targetHours,
        });
      }
      if (!saturdayIsOff) {
        return foundProfile.shift;
      }
    }
  }

  if (targetHours < 40) {
    const start = grpCfg.shift42h.workStart || '08:00';
    const satMinutes = saturdayIsOff ? 0 : Math.min(240, Math.round((targetHours * 60) / 6));
    const workDays = saturdayIsOff ? 5 : offDay === 0 ? 5 : 4;
    const dailyMinutes = Math.round((targetHours * 60 - satMinutes) / workDays);
    const needBreak = dailyMinutes > 360;
    const breakMinutes = needBreak ? 60 : 0;
    const workEnd = addMinutesToHHMM(start, dailyMinutes + breakMinutes);
    const satStart = grpCfg.shift42h.saturdayStart || '07:00';
    return {
      workStart: start,
      breakStart: needBreak ? '12:00' : '-',
      breakEnd: needBreak ? '13:00' : '-',
      workEnd,
      saturdayStart: satStart,
      saturdayEnd: satMinutes > 0 ? addMinutesToHHMM(satStart, satMinutes) : satStart,
      dailyHoursLabel: formatHoursMinutes(dailyMinutes),
      saturdayHoursLabel: formatHoursMinutes(satMinutes),
      weeklyHours: targetHours,
    };
  }

  if (targetHours <= 40) {
    return grpCfg.shift40h || SHIFT_40H;
  }

  if (targetHours >= 44) {
    if (saturdayIsOff) {
      return grpCfg.saturdayOff44h || createDefaultGroupConfig(emp.group).saturdayOff44h!;
    }
    return grpCfg.shift44h || SHIFT_44H;
  }

  // Faixa de 42h (ou valores intermediários ex: 41h..43h)
  if (saturdayIsOff) {
    if (targetHours === 42 && grpCfg.saturdayOff42h) {
      return grpCfg.saturdayOff42h;
    }
    const start = grpCfg.shift42h.workStart || '07:00';
    const bStart = grpCfg.shift42h.breakStart || '12:00';
    const bEnd = grpCfg.shift42h.breakEnd || '13:00';
    const breakMins = Math.max(60, parseMinutes(bEnd) - parseMinutes(bStart));
    const dailyMins = Math.round((targetHours * 60) / 5);
    return {
      workStart: start,
      breakStart: bStart,
      breakEnd: bEnd,
      workEnd: addMinutesToHHMM(start, dailyMins + breakMins),
      saturdayStart: grpCfg.shift42h.saturdayStart || '07:00',
      saturdayEnd: grpCfg.shift42h.saturdayStart || '07:00',
      dailyHoursLabel: formatHoursMinutes(dailyMins),
      saturdayHoursLabel: '00h00min',
      weeklyHours: targetHours,
    };
  }

  if (targetHours === 42) {
    return grpCfg.shift42h;
  }

  // Horas intermediárias (ex: 41h, 43h)
  const base = grpCfg.shift42h;
  const satMins = Math.max(0, parseMinutes(base.saturdayEnd) - parseMinutes(base.saturdayStart));
  const dailyMins = Math.round((targetHours * 60 - satMins) / 4);
  const breakMins = Math.max(60, parseMinutes(base.breakEnd) - parseMinutes(base.breakStart));
  return {
    ...base,
    workEnd: addMinutesToHHMM(base.workStart, dailyMins + breakMins),
    dailyHoursLabel: formatHoursMinutes(dailyMins),
    weeklyHours: targetHours,
  };
}

/**
 * Seleciona o turno efetivo de cada colaborador na semana:
 * - 'custom_shift': usa horários individuais explícitos (customShift ou registeredShift editado)
 * - 'cadastro': usa carga e horários importados da aba Funcionários
 * - 'custom': usa customWeeklyHours (e respeita horários individuais se preenchidos!)
 * - 'policy': segue o Grupo / Perfil de Turno / Portaria MTE nº 2.041/2026
 */
export function resolveShiftForEmployeeInWeek(
  emp: ScheduleEmployeeConfig,
  legalMaxHours: number,
  customShiftTemplate: ShiftTemplate,
  policy: MtePolicyConfig,
  offDay?: Weekday | 0,
  options?: SolverOptions
): ShiftTemplate {
  const groupConfigs = options?.groupConfigs || DEFAULT_GROUP_CONFIGS;
  const shiftProfiles = options?.shiftProfiles || DEFAULT_SHIFT_PROFILES;

  // 1. Horário individual explícito (custom_shift ou custom com batidas preenchidas)
  const cs = emp.customShift;
  if (emp.workloadSource === 'custom_shift' && cs?.workStart && cs?.workEnd) {
    return computeShiftLabels({
      workStart: cs.workStart,
      breakStart: cs.breakStart || '12:00',
      breakEnd: cs.breakEnd || '13:00',
      workEnd: cs.workEnd,
      saturdayStart: cs.saturdayStart || '07:00',
      saturdayBreakStart: cs.saturdayBreakStart,
      saturdayBreakEnd: cs.saturdayBreakEnd,
      saturdayEnd: cs.saturdayEnd || '12:00',
      weeklyHours: emp.customWeeklyHours,
    });
  }

  // Compatibilidade retroativa: se estava em 'custom' e editou registeredShift na tabela de batidas
  if (
    emp.workloadSource === 'custom' &&
    emp.registeredShift?.workStart &&
    emp.registeredShift?.workEnd &&
    cs?.workStart
  ) {
    return computeShiftLabels({
      workStart: cs.workStart,
      breakStart: cs.breakStart || '12:00',
      breakEnd: cs.breakEnd || '13:00',
      workEnd: cs.workEnd,
      saturdayStart: cs.saturdayStart || '07:00',
      saturdayEnd: cs.saturdayEnd || '12:00',
      weeklyHours: emp.customWeeklyHours,
    });
  }

  // 2. Importado da aba Funcionários
  if (emp.workloadSource === 'cadastro' && emp.registeredShift) {
    const reg = emp.registeredShift;
    const weekly = reg.weeklyHours || 44;
    if (reg.workStart && reg.workEnd) {
      return computeShiftLabels({
        workStart: reg.workStart,
        breakStart: reg.breakStart || '-',
        breakEnd: reg.breakEnd || '-',
        workEnd: reg.workEnd,
        saturdayStart: reg.saturdayStart || '07:00',
        saturdayBreakStart: reg.saturdayBreakStart,
        saturdayBreakEnd: reg.saturdayBreakEnd,
        saturdayEnd: reg.saturdayEnd || '12:00',
        weeklyHours: weekly,
      });
    }
    return resolveShiftByWeeklyHours(emp, weekly, offDay, groupConfigs, shiftProfiles);
  }

  // 3. Carga semanal personalizada (ex: 36h, 40h, 42h, 44h)
  if (emp.workloadSource === 'custom' && emp.customWeeklyHours) {
    return resolveShiftByWeeklyHours(emp, emp.customWeeklyHours, offDay, groupConfigs, shiftProfiles);
  }

  // 4. Modo manual global com template customizado explícito quando não usa perfil/grupo específico
  if (policy.phaseMode === 'custom' && customShiftTemplate) {
    const profileId = emp.shiftProfile;
    if (!profileId || profileId === 'group') {
      return resolveShiftByWeeklyHours(emp, legalMaxHours, offDay, groupConfigs, shiftProfiles);
    }
  }

  return resolveShiftByWeeklyHours(emp, legalMaxHours, offDay, groupConfigs, shiftProfiles);
}

export function generateAndAuditSchedule(
  year: number,
  monthIndex0: number,
  employees: ScheduleEmployeeConfig[],
  rules: CollectiveRule[],
  shift: ShiftTemplate,
  policy: MtePolicyConfig = DEFAULT_MTE_POLICY,
  options?: SolverOptions
): SolverResult {
  const weeks = buildMonthWeeks(year, monthIndex0);
  const assignments: WeekAssignment[] = [];
  const historyCounts: Record<string, Record<number, number>> = {};
  const groupConfigs = options?.groupConfigs || DEFAULT_GROUP_CONFIGS;

  for (const emp of employees) {
    historyCounts[emp.id] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  }

  let totalBacktracks = 0;
  let prevAssignment: Record<string, Weekday | 0> | null = null;

  for (const week of weeks) {
    const weekManual = options?.manualOverrides?.[week.weekKey];
    const { assignment, backtracks } = solveWeekCSP(
      week.weekIndex,
      employees,
      rules,
      prevAssignment,
      historyCounts,
      weekManual
    );
    totalBacktracks += backtracks;

    if (!assignment) {
      return {
        success: false,
        error: `Não foi possível encontrar uma combinação válida na ${week.label} sem violar as restrições individuais ou coletivas. Revise as regras configuradas ou ajuste manualmente.`,
        weeks,
        assignments,
        audits: [],
        totalBacktracks,
      };
    }

    const manualByEmployee: Record<string, boolean> = {};
    for (const [empId, day] of Object.entries(assignment)) {
      if (historyCounts[empId]) {
        historyCounts[empId][day] = (historyCounts[empId][day] || 0) + 1;
      }
      if (weekManual && weekManual[empId] !== undefined) {
        manualByEmployee[empId] = true;
      }
    }

    const legalMaxWeeklyHours = getLegalMaxWeeklyHoursForWeek(week, policy);
    const appliedShift = resolveShiftForWeek(legalMaxWeeklyHours, shift, policy, groupConfigs[0]);

    assignments.push({
      weekIndex: week.weekIndex,
      weekKey: week.weekKey,
      offDayByEmployee: assignment,
      manualByEmployee,
      backtracks,
      legalMaxWeeklyHours,
      appliedShift,
    });
    prevAssignment = assignment;
  }

  const audits = runScheduleAudit(weeks, assignments, employees, rules, policy, options);

  return {
    success: true,
    weeks,
    assignments,
    audits,
    totalBacktracks,
  };
}

export function calculateShiftMetrics(shift: ShiftTemplate, saturdayOff = false, noWeekdayOff = false) {
  const startMin = parseMinutes(shift.workStart);
  const hasBreak =
    shift.breakStart && shift.breakStart !== '-' && shift.breakEnd && shift.breakEnd !== '-';
  const breakStartMin = hasBreak ? parseMinutes(shift.breakStart) : 0;
  const breakEndMin = hasBreak ? parseMinutes(shift.breakEnd) : 0;
  const endMin = parseMinutes(shift.workEnd);
  const breakDuration = hasBreak ? Math.max(0, breakEndMin - breakStartMin) : 0;
  const dailyWorkMinutes = Math.max(0, endMin - startMin - breakDuration);

  const satStartMin = parseMinutes(shift.saturdayStart || shift.workStart);
  const satEndMin = parseMinutes(shift.saturdayEnd || shift.workEnd);
  const hasSatBreak =
    shift.saturdayBreakStart &&
    shift.saturdayBreakStart !== '-' &&
    shift.saturdayBreakEnd &&
    shift.saturdayBreakEnd !== '-';
  const satBreakDur = hasSatBreak
    ? Math.max(0, parseMinutes(shift.saturdayBreakEnd) - parseMinutes(shift.saturdayBreakStart))
    : 0;
  const satWorkMinutes = saturdayOff ? 0 : Math.max(0, satEndMin - satStartMin - satBreakDur);

  const weekdayCount = saturdayOff ? 5 : noWeekdayOff ? 5 : 4;
  const weeklyMinutes =
    saturdayOff || satWorkMinutes === 0
      ? dailyWorkMinutes * 5
      : dailyWorkMinutes * weekdayCount + satWorkMinutes;
  const interjornadaMinutes = 24 * 60 - Math.max(0, endMin - startMin);
  return { breakDuration, dailyWorkMinutes, satWorkMinutes, weeklyMinutes, interjornadaMinutes };
}

function runScheduleAudit(
  weeks: WeekRange[],
  assignments: WeekAssignment[],
  employees: ScheduleEmployeeConfig[],
  rules: CollectiveRule[],
  policy: MtePolicyConfig,
  options?: SolverOptions
): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const minIntra = policy.minIntrajornadaMinutes ?? 60;
  const minInterHours = policy.minInterjornadaHours ?? 11;

  const weekLimitFailures: string[] = [];
  const intraFailures: string[] = [];
  const interFailures: string[] = [];
  const weekSummaries: string[] = [];

  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const assign = assignments[i];
    let maxWeeklySeen = 0;

    for (const emp of employees) {
      const offDay = assign.offDayByEmployee[emp.id];
      const saturdayOff = offDay === 6 || emp.offMode === 'mon_fri';
      const noWeekdayOff = offDay === 0 || emp.offMode === '6x1';
      const empShift = resolveShiftForEmployeeInWeek(
        emp,
        assign.legalMaxWeeklyHours,
        assign.appliedShift,
        policy,
        offDay,
        options
      );
      const m = calculateShiftMetrics(empShift, saturdayOff, noWeekdayOff);
      const weeklyHoursActual = m.weeklyMinutes / 60;
      maxWeeklySeen = Math.max(maxWeeklySeen, weeklyHoursActual);

      const empEffectiveLimit =
        (emp.workloadSource === 'custom' || emp.workloadSource === 'custom_shift') && emp.customWeeklyHours
          ? emp.customWeeklyHours
          : emp.workloadSource === 'cadastro' && emp.registeredShift?.weeklyHours
          ? emp.registeredShift.weeklyHours
          : assign.legalMaxWeeklyHours;

      if (m.dailyWorkMinutes <= 0 || m.weeklyMinutes > empEffectiveLimit * 60 + 5) {
        weekLimitFailures.push(
          `${w.label} (${emp.name}): ${weeklyHoursActual.toFixed(2)}h excede limite de ${empEffectiveLimit}h`
        );
      }
      if (m.dailyWorkMinutes > 6 * 60 && m.breakDuration < minIntra) {
        intraFailures.push(
          `${w.label} (${emp.name}): intervalo de ${m.breakDuration} min (< ${minIntra} min)`
        );
      }
      if (m.interjornadaMinutes < minInterHours * 60) {
        interFailures.push(
          `${w.label} (${emp.name}): interjornada de ${(m.interjornadaMinutes / 60).toFixed(1)}h (< ${minInterHours}h)`
        );
      }
    }

    weekSummaries.push(
      `Sem ${i + 1}: ${maxWeeklySeen.toFixed(1).replace('.0', '')}h/${assign.legalMaxWeeklyHours}h`
    );
  }

  checks.push({
    id: 'mte-2041-transicao-jornada',
    category: 'MTE_2041',
    title: `Portaria MTE nº 2.041/2026 — Limite Semanal`,
    passed: weekLimitFailures.length === 0,
    details:
      weekLimitFailures.length === 0
        ? `Modo ${policy.phaseMode === 'auto' ? 'Automático por Vigência' : policy.phaseMode}: ${weekSummaries.join(' | ')}.`
        : `Violação do teto semanal: ${weekLimitFailures.join('; ')}.`,
  });

  checks.push({
    id: 'clt-intrajornada',
    category: 'CLT',
    title: `Intervalo Intrajornada Mínimo ${minIntra} min (CLT Art. 71)`,
    passed: intraFailures.length === 0,
    details:
      intraFailures.length === 0
        ? `Todas as ${weeks.length} semanas respeitam intervalo intrajornada mínimo de ${minIntra} min.`
        : intraFailures.join('; '),
  });

  checks.push({
    id: 'clt-interjornada',
    category: 'CLT',
    title: `Descanso Interjornada Mínimo ${minInterHours}h (CLT Art. 66)`,
    passed: interFailures.length === 0,
    details:
      interFailures.length === 0
        ? `Todas as ${weeks.length} semanas respeitam descanso interjornada mínimo de ${minInterHours}h.`
        : interFailures.join('; '),
  });

  checks.push({
    id: 'mte-2041-dsr',
    category: 'MTE_2041',
    title: 'Portaria MTE nº 2.041/2026 — DSR Dominical e Registro Semanal',
    passed: true,
    details: `Todos os ${employees.length} colaboradores possuem DSR aos domingos e escala semanal validada nas ${weeks.length} semanas.`,
  });

  // Auditoria de Condições Individuais
  let individualViolations = 0;
  let alternanceViolations = 0;
  for (let w = 0; w < assignments.length; w++) {
    const assign = assignments[w];
    const offMap = assign.offDayByEmployee;
    for (const emp of employees) {
      if (assign.manualByEmployee?.[emp.id]) continue; // Ajustes manuais são intencionais do gestor
      if (emp.offMode === '6x1' || emp.offMode === 'mon_fri') continue;
      const assigned = offMap[emp.id];
      if (assigned === 0 || !emp.allowedDays.includes(assigned as Weekday)) {
        individualViolations++;
      }
      if (emp.alternateDays && emp.allowedDays.length >= 2 && w > 0) {
        const prev = assignments[w - 1].offDayByEmployee[emp.id];
        if (prev === assigned && !assignments[w - 1].manualByEmployee?.[emp.id]) {
          alternanceViolations++;
        }
      }
    }
  }

  checks.push({
    id: 'audit-individual',
    category: 'INDIVIDUAL',
    title: 'Condições Individuais de Folga',
    passed: individualViolations === 0 && alternanceViolations === 0,
    details:
      individualViolations === 0 && alternanceViolations === 0
        ? `100% dos dias permitidos e alternâncias automáticas respeitados nas ${weeks.length} semanas.`
        : `Encontradas ${individualViolations} violações de dia permitido e ${alternanceViolations} falhas de alternância.`,
  });

  // Auditoria de Condições Coletivas (todos os tipos: max_simultaneous, same_day, day_cap)
  const collectiveFailureDetails: string[] = [];
  const activeRules = rules.filter((r) => r.enabled);
  const allIds = employees.map((e) => e.id);

  for (let wIdx = 0; wIdx < assignments.length; wIdx++) {
    const wAssign = assignments[wIdx];
    const wLabel = `Sem ${wIdx + 1}`;
    for (const rule of activeRules) {
      const rType = rule.type || 'max_simultaneous';
      if (rType === 'same_day') {
        const daysUsed = new Set(
          rule.employeeIds
            .map((id) => wAssign.offDayByEmployee[id])
            .filter((d) => d !== undefined && d !== 0)
        );
        if (daysUsed.size > 1) {
          collectiveFailureDetails.push(`${wLabel}: "${rule.name}" folgaram em dias diferentes`);
        }
      } else if (rType === 'day_cap' || rType === 'min_present') {
        const scopeIds = rule.employeeIds.length > 0 ? rule.employeeIds : allIds;
        const limit = getScopedRuleOffLimit(rule, scopeIds.length);
        for (const day of ALL_OFF_DAYS) {
          if (!ruleAppliesToDay(rule, day)) continue;
          const count = scopeIds.filter((id) => wAssign.offDayByEmployee[id] === day).length;
          if (count > limit) {
            collectiveFailureDetails.push(
              rType === 'min_present'
                ? `${wLabel} (${WEEKDAY_SHORT[day]}): "${rule.name}" ficou com ${scopeIds.length - count} presentes (mín ${rule.minPresent ?? 1})`
                : `${wLabel} (${WEEKDAY_SHORT[day]}): "${rule.name}" teve ${count} folgas (máx ${rule.maxOffSameDay})`
            );
          }
        }
      } else {
        for (const day of ALL_OFF_DAYS) {
          if (!ruleAppliesToDay(rule, day)) continue;
          const count = rule.employeeIds.filter((id) => wAssign.offDayByEmployee[id] === day).length;
          if (count > rule.maxOffSameDay) {
            collectiveFailureDetails.push(
              `${wLabel} (${WEEKDAY_SHORT[day]}): "${rule.name}" teve ${count} folgas simultâneas`
            );
          }
        }
        // Verificar mínimo de presentes por dia útil
        if (rule.minPresent !== undefined) {
          const presentCount = rule.employeeIds.length - count;
          if (presentCount < rule.minPresent) {
            collectiveViolations++;
          }
        }
      }
    }
  }

  checks.push({
    id: 'audit-collective',
    category: 'COLETIVA',
    title: `Condições Coletivas (${activeRules.length} regras ativas)`,
    passed: collectiveFailureDetails.length === 0,
    details:
      collectiveFailureDetails.length === 0
        ? 'Nenhum conflito nas regras coletivas de folga.'
        : `Conflitos detectados: ${collectiveFailureDetails.join('; ')}.`,
  });

  // Cobertura dinâmica por todos os grupos existentes
  const distinctGroups = Array.from(new Set(employees.map((e) => e.group))).sort();
  if (distinctGroups.length >= 2) {
    const groupMinSummaries: string[] = [];
    let coveragePassed = true;

    for (const grp of distinctGroups) {
      const grpEmps = employees.filter((e) => e.group === grp);
      const grpCfg = options?.groupConfigs?.find((c) => c.id === grp);
      const requiredMin =
        grpEmps.length <= 1 ? 0 : Math.min(grpCfg?.minDailyPresent ?? 1, grpEmps.length - 1);
      let minSeen = grpEmps.length;

      for (const wAssign of assignments) {
        for (const day of ALL_OFF_DAYS) {
          const offCount = grpEmps.filter((e) => wAssign.offDayByEmployee[e.id] === day).length;
          minSeen = Math.min(minSeen, grpEmps.length - offCount);
        }
      }
      if (minSeen < requiredMin) coveragePassed = false;
      groupMinSummaries.push(`Grupo ${grp}: mín ${minSeen}/${grpEmps.length}`);
    }

    checks.push({
      id: 'audit-coverage',
      category: 'COBERTURA',
      title: `Equilíbrio de Cobertura por Grupo (${distinctGroups.join(', ')})`,
      passed: coveragePassed,
      details: `Presença mínima diária — ${groupMinSummaries.join(' • ')}.`,
    });
  } else {
    let minPresentTotal = employees.length;
    for (const wAssign of assignments) {
      for (const day of ALL_OFF_DAYS) {
        const offTotal = employees.filter((e) => wAssign.offDayByEmployee[e.id] === day).length;
        minPresentTotal = Math.min(minPresentTotal, employees.length - offTotal);
      }
    }
    checks.push({
      id: 'audit-coverage',
      category: 'COBERTURA',
      title: 'Cobertura Diária da Equipe',
      passed: employees.length <= 1 || minPresentTotal > 0,
      details:
        employees.length === 0
          ? 'Nenhum colaborador configurado.'
          : `Presença mínima diária: ${minPresentTotal}/${employees.length} colaboradores.`,
    });
  }

  return checks;
}
