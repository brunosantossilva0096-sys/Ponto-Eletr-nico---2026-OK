import React, { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import { supabase } from '../supabaseClient';
import { AdminUser, Company, Employee } from '../types';
import {
  Calendar,
  Lock,
  ShieldCheck,
  RefreshCw,
  Download,
  Upload,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Clock,
  Sparkles,
  Building2,
  Edit2,
  Save,
  Sliders,
  Unlock,
  Printer,
} from 'lucide-react';
import {
  ALL_OFF_DAYS,
  ALL_WEEKDAYS,
  CollectiveRule,
  CollectiveRuleType,
  computeShiftLabels,
  createDefaultGroupConfig,
  CustomShiftProfile,
  DEFAULT_COLLECTIVE_RULES,
  DEFAULT_GROUP_CONFIGS,
  DEFAULT_MTE_POLICY,
  DEFAULT_SCHEDULE_EMPLOYEES,
  DEFAULT_SHIFT_PROFILES,
  DEFAULT_SHIFT_TEMPLATE,
  EmployeeOffMode,
  generateAndAuditSchedule,
  getDayCoverageTag,
  GroupConfig,
  GroupId,
  ManualWeekOverrides,
  MtePolicyConfig,
  MteTransitionPhase,
  resolveShiftForEmployeeInWeek,
  ScheduleEmployeeConfig,
  SHIFT_40H,
  SHIFT_42H,
  SHIFT_44H,
  ShiftProfileId,
  ShiftTemplate,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  Weekday,
  WorkloadSource,
} from '../utils/scheduleSolver5x2';
import {
  EmployeeVacation,
  extractCloudSchedule5x2FromEmployees,
  getCompanyScheduleStorageKey,
  isEmployeeInactive,
  loadCompanyRules,
  saveCloudSchedule5x2,
  saveCompanyRules,
  SCHEDULE_STORAGE_KEY_PREFIX,
  StoredSchedule5x2Config,
} from '../utils/companyRules';
import { toLocalDateStr } from '../utils/dateUtils';
import { exportControleJornadaPDF } from '../utils/pdfControleJornada';
import { printScheduleWeekHtml } from '../utils/printScheduleWeek';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function extractRegisteredShift(dbEmp: Employee) {
  const customMon = dbEmp.custom_schedule?.[1];
  const customSat = dbEmp.custom_schedule?.[6];
  return {
    weeklyHours: dbEmp.weekly_hours || 44,
    workStart: (dbEmp.schedule_type === 'custom' ? customMon?.work_start : dbEmp.work_start) || undefined,
    breakStart: (dbEmp.schedule_type === 'custom' ? customMon?.break_start : dbEmp.break_start) || undefined,
    breakEnd: (dbEmp.schedule_type === 'custom' ? customMon?.break_end : dbEmp.break_end) || undefined,
    workEnd: (dbEmp.schedule_type === 'custom' ? customMon?.work_end : dbEmp.work_end) || undefined,
    saturdayStart: customSat?.active ? customSat.work_start : undefined,
    saturdayBreakStart: customSat?.active ? customSat.break_start : undefined,
    saturdayBreakEnd: customSat?.active ? customSat.break_end : undefined,
    saturdayEnd: customSat?.active ? customSat.work_end : undefined,
  };
}

function buildConfigFromDbEmployees(dbEmps: Employee[]): StoredSchedule5x2Config {
  if (dbEmps.length === 0) {
    return {
      employees: [],
      rules: [],
      shift: DEFAULT_SHIFT_TEMPLATE,
      policy: DEFAULT_MTE_POLICY,
      groups: ['A', 'B'],
      groupConfigs: DEFAULT_GROUP_CONFIGS,
      shiftProfiles: DEFAULT_SHIFT_PROFILES,
      manualOverrides: {},
    };
  }

  const mapped: ScheduleEmployeeConfig[] = dbEmps.map((dbEmp) => ({
    id: dbEmp.id,
    name: dbEmp.name,
    group: 'A' as GroupId,
    offMode: '5x2',
    allowedDays: [1, 2, 3, 4, 5] as Weekday[],
    alternateDays: false,
    avoidRepeatPrevWeek: true,
    shiftProfile: 'group' as ShiftProfileId,
    workloadSource: 'policy' as WorkloadSource,
    registeredShift: extractRegisteredShift(dbEmp),
    note: dbEmp.role || '',
  }));

  return {
    employees: mapped,
    rules: [],
    shift: DEFAULT_SHIFT_TEMPLATE,
    policy: DEFAULT_MTE_POLICY,
    groups: ['A', 'B'],
    groupConfigs: DEFAULT_GROUP_CONFIGS,
    shiftProfiles: DEFAULT_SHIFT_PROFILES,
    manualOverrides: {},
  };
}

function ensureGroupsSynchronized(
  savedGroups: GroupId[] | undefined,
  savedGroupConfigs: GroupConfig[] | undefined,
  emps: ScheduleEmployeeConfig[]
): { groups: GroupId[]; groupConfigs: GroupConfig[] } {
  const set = new Set<GroupId>(savedGroups && savedGroups.length > 0 ? savedGroups : ['A', 'B']);
  emps.forEach((e) => {
    if (e.group) set.add(e.group);
  });
  const groups = Array.from(set);
  const existingMap = new Map<GroupId, GroupConfig>();
  (savedGroupConfigs || DEFAULT_GROUP_CONFIGS).forEach((gc) => existingMap.set(gc.id, gc));
  const groupConfigs = groups.map((g) => existingMap.get(g) || createDefaultGroupConfig(g));
  return { groups, groupConfigs };
}

function loadStoredConfig(companyId: string, dbEmpsForCompany?: Employee[]): StoredSchedule5x2Config {
  const key = getCompanyScheduleStorageKey(companyId);
  try {
    const raw =
      localStorage.getItem(key) ||
      (!companyId ? localStorage.getItem(SCHEDULE_STORAGE_KEY_PREFIX) : null);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.employees) && Array.isArray(parsed.rules)) {
        const { groups, groupConfigs } = ensureGroupsSynchronized(
          parsed.groups,
          parsed.groupConfigs,
          parsed.employees
        );
        return {
          employees: parsed.employees,
          rules: parsed.rules,
          shift: parsed.shift || DEFAULT_SHIFT_TEMPLATE,
          policy: { ...DEFAULT_MTE_POLICY, ...(parsed.policy || {}) },
          groups,
          groupConfigs,
          shiftProfiles:
            Array.isArray(parsed.shiftProfiles) && parsed.shiftProfiles.length > 0
              ? parsed.shiftProfiles
              : DEFAULT_SHIFT_PROFILES,
          manualOverrides: parsed.manualOverrides || {},
          vacations: Array.isArray(parsed.vacations) ? parsed.vacations : [],
        };
      }
    }
  } catch {
    // Ignora erro de parse e usa padrões
  }

  if (dbEmpsForCompany && dbEmpsForCompany.length > 0) {
    return buildConfigFromDbEmployees(dbEmpsForCompany);
  }

  return {
    employees: DEFAULT_SCHEDULE_EMPLOYEES,
    rules: DEFAULT_COLLECTIVE_RULES,
    shift: DEFAULT_SHIFT_TEMPLATE,
    policy: DEFAULT_MTE_POLICY,
    groups: ['A', 'B'],
    groupConfigs: DEFAULT_GROUP_CONFIGS,
    shiftProfiles: DEFAULT_SHIFT_PROFILES,
    manualOverrides: {},
  };
}

export const AdminSchedule5x2: React.FC<{ loggedAdmin: AdminUser }> = ({ loggedAdmin }) => {
  const now = new Date();
  const fileImportRef = useRef<HTMLInputElement>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [dbEmployees, setDbEmployees] = useState<Employee[]>([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(loggedAdmin.company_id || '');

  const effectiveCompanyId = loggedAdmin.company_id || selectedCompanyId;
  const initial = useMemo(() => loadStoredConfig(effectiveCompanyId), [effectiveCompanyId]);

  useEffect(() => {
    const fetchCompanyData = async () => {
      let compQuery = supabase.from('companies').select('*').order('name');
      let empQuery = supabase.from('employees').select('*, companies(*)').order('name');
      if (loggedAdmin.company_id) {
        compQuery = compQuery.eq('id', loggedAdmin.company_id);
        empQuery = empQuery.eq('company_id', loggedAdmin.company_id);
      }
      const [{ data: compData }, { data: empData }] = await Promise.all([compQuery, empQuery]);
      if (compData) setCompanies(compData);
      if (empData) {
        setDbEmployees(empData.filter((e: Employee) => e.role !== 'Admin' && !isEmployeeInactive(e)));
      }
      setDbLoaded(true);
    };
    fetchCompanyData();
  }, [loggedAdmin.company_id]);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === effectiveCompanyId) || null,
    [companies, effectiveCompanyId]
  );

  const companyDbEmployees = useMemo(() => {
    if (!effectiveCompanyId) return dbEmployees;
    return dbEmployees.filter((e) => e.company_id === effectiveCompanyId);
  }, [dbEmployees, effectiveCompanyId]);

  const [subTab, setSubTab] = useState<'schedule' | 'conditions' | 'shifts' | 'audit'>('schedule');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [startFromDate, setStartFromDate] = useState<string>('');
  const [showCalendar, setShowCalendar] = useState<boolean>(true);
  const [isPushingToDb, setIsPushingToDb] = useState<boolean>(false);

  const [employees, setEmployees] = useState<ScheduleEmployeeConfig[]>(initial.employees);
  const [rules, setRules] = useState<CollectiveRule[]>(initial.rules);
  const [shift, setShift] = useState<ShiftTemplate>(initial.shift);
  const [policy, setPolicy] = useState<MtePolicyConfig>(initial.policy || DEFAULT_MTE_POLICY);
  const [groups, setGroups] = useState<GroupId[]>(initial.groups || ['A', 'B']);
  const [groupConfigs, setGroupConfigs] = useState<GroupConfig[]>(initial.groupConfigs || DEFAULT_GROUP_CONFIGS);
  const [shiftProfiles, setShiftProfiles] = useState<CustomShiftProfile[]>(
    initial.shiftProfiles || DEFAULT_SHIFT_PROFILES
  );
  const [manualOverrides, setManualOverrides] = useState<ManualWeekOverrides>(
    initial.manualOverrides || {}
  );
  const [vacations, setVacations] = useState<EmployeeVacation[]>(initial.vacations || []);
  const [vacEmpId, setVacEmpId] = useState<string>(initial.employees[0]?.id || '');
  const [vacMonth, setVacMonth] = useState<number>(now.getMonth());
  const [vacYear, setVacYear] = useState<number>(now.getFullYear());
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cloudReadyToSave, setCloudReadyToSave] = useState<boolean>(false);

  // Integração global da Escala 5x2 com as demais abas
  const [useInOtherTabs, setUseInOtherTabs] = useState<boolean>(
    () => loadCompanyRules(effectiveCompanyId).useSchedule5x2InReportsAndTimeBank
  );

  // Gerenciamento de grupos
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [editingGroup, setEditingGroup] = useState<GroupId | null>(null);
  const [editGroupName, setEditGroupName] = useState<string>('');
  const [selectedGroupForHours, setSelectedGroupForHours] = useState<GroupId>(initial.groups?.[0] || 'A');

  // Novo perfil de turno
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profName, setProfName] = useState('');
  const [profWs, setProfWs] = useState('07:00');
  const [profBs, setProfBs] = useState('12:00');
  const [profBe, setProfBe] = useState('13:00');
  const [profWe, setProfWe] = useState('17:00');
  const [profSatStart, setProfSatStart] = useState('07:00');
  const [profSatEnd, setProfSatEnd] = useState('13:00');

  // Novo colaborador e filtros
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpDbId, setNewEmpDbId] = useState('');
  const [newEmpGroup, setNewEmpGroup] = useState<GroupId>('A');
  const [empSearch, setEmpSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | GroupId>('ALL');

  // Regra individual rápida
  const [indRuleEmpId, setIndRuleEmpId] = useState<string>(initial.employees[0]?.id || '');
  const [indRuleGroup, setIndRuleGroup] = useState<GroupId>(initial.employees[0]?.group || 'A');
  const [indRuleOffMode, setIndRuleOffMode] = useState<EmployeeOffMode>(initial.employees[0]?.offMode || '5x2');
  const [indRuleProfile, setIndRuleProfile] = useState<ShiftProfileId>(
    initial.employees[0]?.shiftProfile || 'group'
  );
  const [indRuleDays, setIndRuleDays] = useState<Weekday[]>(
    initial.employees[0]?.allowedDays || [1, 2, 3, 4, 5]
  );
  const [indRuleAlternate, setIndRuleAlternate] = useState<boolean>(
    initial.employees[0]?.alternateDays || false
  );
  const [indRuleNote, setIndRuleNote] = useState<string>('');

  // Nova / Editar Regra Coletiva
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newRuleType, setNewRuleType] = useState<CollectiveRuleType>('max_simultaneous');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleEmpIds, setNewRuleEmpIds] = useState<string[]>([]);
  const [newRuleMaxOff, setNewRuleMaxOff] = useState<number>(1);
  const [newRuleDays, setNewRuleDays] = useState<Weekday[]>([]); // vazio = todos Seg-Sáb
  const [newRuleMinPresent, setNewRuleMinPresent] = useState<number>(1);

  useEffect(() => {
    if (!dbLoaded && effectiveCompanyId) return;
    setCloudReadyToSave(false);

    // 1. Prioriza configuração salva na nuvem (Supabase) para sincronizar entre computadores
    const cloudCfg = extractCloudSchedule5x2FromEmployees(companyDbEmployees, effectiveCompanyId);
    let cfg: StoredSchedule5x2Config;
    if (cloudCfg) {
      const { groups: gList, groupConfigs: gcList } = ensureGroupsSynchronized(
        cloudCfg.groups,
        cloudCfg.groupConfigs,
        cloudCfg.employees
      );
      cfg = {
        ...cloudCfg,
        policy: { ...DEFAULT_MTE_POLICY, ...(cloudCfg.policy || {}) },
        groups: gList,
        groupConfigs: gcList,
        shiftProfiles:
          Array.isArray(cloudCfg.shiftProfiles) && cloudCfg.shiftProfiles.length > 0
            ? cloudCfg.shiftProfiles
            : DEFAULT_SHIFT_PROFILES,
        manualOverrides: cloudCfg.manualOverrides || {},
        vacations: Array.isArray(cloudCfg.vacations) ? cloudCfg.vacations : [],
      };
      setCloudSyncStatus('saved');
    } else {
      cfg = loadStoredConfig(effectiveCompanyId, companyDbEmployees);
      setCloudSyncStatus('idle');
    }

    setEmployees(cfg.employees);
    setRules(cfg.rules);
    setShift(cfg.shift);
    setPolicy(cfg.policy || DEFAULT_MTE_POLICY);
    setGroups(cfg.groups || ['A', 'B']);
    setGroupConfigs(cfg.groupConfigs || DEFAULT_GROUP_CONFIGS);
    setShiftProfiles(cfg.shiftProfiles || DEFAULT_SHIFT_PROFILES);
    setManualOverrides(cfg.manualOverrides || {});
    setVacations(cfg.vacations || []);
    setVacEmpId(cfg.employees[0]?.id || '');
    setIndRuleEmpId(cfg.employees[0]?.id || '');
    setSelectedGroupForHours((cfg.groups && cfg.groups[0]) || 'A');
    setNewRuleEmpIds([]);
    setEditingRuleId(null);
    setUseInOtherTabs(loadCompanyRules(effectiveCompanyId).useSchedule5x2InReportsAndTimeBank);

    // Libera o salvamento automático na nuvem após carregar o estado inicial da empresa
    const t = setTimeout(() => setCloudReadyToSave(true), 250);
    return () => clearTimeout(t);
  }, [effectiveCompanyId, dbLoaded]);

  useEffect(() => {
    const toStore: StoredSchedule5x2Config = {
      employees,
      rules,
      shift,
      policy,
      groups,
      groupConfigs,
      shiftProfiles,
      manualOverrides,
      vacations,
    };
    try {
      localStorage.setItem(getCompanyScheduleStorageKey(effectiveCompanyId), JSON.stringify(toStore));
    } catch {
      // Ignora erro de quota
    }

    if (!dbLoaded || !cloudReadyToSave || companyDbEmployees.length === 0) return;

    setCloudSyncStatus('saving');
    const timer = setTimeout(async () => {
      const res = await saveCloudSchedule5x2(companyDbEmployees, effectiveCompanyId, toStore);
      setCloudSyncStatus(res.ok ? 'saved' : 'error');
    }, 800);

    return () => clearTimeout(timer);
  }, [effectiveCompanyId, employees, rules, shift, policy, groups, groupConfigs, shiftProfiles, manualOverrides, vacations, dbLoaded, cloudReadyToSave]);

  const handleToggleUseInOtherTabs = (checked: boolean) => {
    setUseInOtherTabs(checked);
    const current = loadCompanyRules(effectiveCompanyId);
    saveCompanyRules(effectiveCompanyId, {
      ...current,
      useSchedule5x2InReportsAndTimeBank: checked,
    });
  };

  // Exclui colaboradores de férias no mês/ano selecionado de todo o cálculo da escala
  const vacationEmployeeIdsForMonth = useMemo(() => {
    return new Set(
      vacations
        .filter((v) => v.year === selectedYear && v.month === selectedMonth)
        .map((v) => v.employeeId)
    );
  }, [vacations, selectedYear, selectedMonth]);

  const activeEmployeesForMonth = useMemo(
    () => employees.filter((e) => !vacationEmployeeIdsForMonth.has(e.id)),
    [employees, vacationEmployeeIdsForMonth]
  );

  const vacationEmployeesForMonth = useMemo(
    () => employees.filter((e) => vacationEmployeeIdsForMonth.has(e.id)),
    [employees, vacationEmployeeIdsForMonth]
  );

  const activeRulesForMonth = useMemo(() => {
    const activeIds = new Set(activeEmployeesForMonth.map((e) => e.id));
    return rules
      .map((r) => ({
        ...r,
        employeeIds: r.employeeIds.filter((id) => activeIds.has(id)),
      }))
      .filter((r) => r.type === 'day_cap' || r.type === 'min_present' || r.employeeIds.length >= 2);
  }, [rules, activeEmployeesForMonth]);

  // Lista dinâmica de grupos em uso (corrige bug onde apenas A e B eram detectados)
  const activeDistinctGroups = useMemo(
    () => Array.from(new Set(activeEmployeesForMonth.map((e) => e.group))).sort(),
    [activeEmployeesForMonth]
  );
  const hasGroupDistinction = activeDistinctGroups.length >= 2;

  const solverOptions = useMemo(
    () => ({ groupConfigs, shiftProfiles, manualOverrides }),
    [groupConfigs, shiftProfiles, manualOverrides]
  );

  const solverResult = useMemo(() => {
    return generateAndAuditSchedule(
      selectedYear,
      selectedMonth,
      activeEmployeesForMonth,
      activeRulesForMonth,
      shift,
      policy,
      solverOptions
    );
  }, [selectedYear, selectedMonth, activeEmployeesForMonth, activeRulesForMonth, shift, policy, solverOptions]);

  const allAuditsPassed =
    solverResult.success && solverResult.audits.every((a) => a.passed);

  const hasManualOverridesInMonth = useMemo(() => {
    return solverResult.weeks.some((w) => {
      const wm = manualOverrides[w.weekKey];
      return wm && Object.keys(wm).length > 0;
    });
  }, [solverResult.weeks, manualOverrides]);

  const handleToggleCellManualOff = (weekKey: string, empId: string, clickedDay: Weekday) => {
    setManualOverrides((prev) => {
      const next = { ...prev };
      const weekMap = { ...(next[weekKey] || {}) };
      if (weekMap[empId] === clickedDay) {
        delete weekMap[empId];
      } else {
        weekMap[empId] = clickedDay;
      }
      if (Object.keys(weekMap).length === 0) {
        delete next[weekKey];
      } else {
        next[weekKey] = weekMap;
      }
      return next;
    });
  };

  const handleClearMonthManualOverrides = () => {
    setManualOverrides((prev) => {
      const next = { ...prev };
      solverResult.weeks.forEach((w) => {
        delete next[w.weekKey];
      });
      return next;
    });
  };

  const updateEmployeeWorkload = (empId: string, val: string) => {
    setEmployees((prev) =>
      prev.map((item) => {
        if (item.id !== empId) return item;
        if (val === 'policy') {
          return { ...item, workloadSource: 'policy', customWeeklyHours: undefined };
        }
        if (val === 'cadastro') {
          const dbMatch = dbEmployees.find(
            (d) =>
              d.id === item.id ||
              d.name.trim().toLowerCase() === item.name.trim().toLowerCase()
          );
          return {
            ...item,
            workloadSource: 'cadastro',
            registeredShift: dbMatch ? extractRegisteredShift(dbMatch) : item.registeredShift,
          };
        }
        if (val === 'custom_shift') {
          const fallbackShift = resolveShiftForEmployeeInWeek(
            item,
            42,
            shift,
            policy,
            undefined,
            solverOptions
          );
          return {
            ...item,
            workloadSource: 'custom_shift',
            customShift: {
              workStart: item.customShift?.workStart || item.registeredShift?.workStart || fallbackShift.workStart,
              breakStart: item.customShift?.breakStart || item.registeredShift?.breakStart || fallbackShift.breakStart,
              breakEnd: item.customShift?.breakEnd || item.registeredShift?.breakEnd || fallbackShift.breakEnd,
              workEnd: item.customShift?.workEnd || item.registeredShift?.workEnd || fallbackShift.workEnd,
              saturdayStart: item.customShift?.saturdayStart || item.registeredShift?.saturdayStart || fallbackShift.saturdayStart,
              saturdayEnd: item.customShift?.saturdayEnd || item.registeredShift?.saturdayEnd || fallbackShift.saturdayEnd,
            },
          };
        }
        const hrs = Math.max(1, Math.min(48, Number(val.replace('custom:', '')) || 44));
        return {
          ...item,
          workloadSource: 'custom',
          customWeeklyHours: hrs,
        };
      })
    );
  };

  const updateEmployeeCustomShiftField = (
    empId: string,
    field: 'workStart' | 'breakStart' | 'breakEnd' | 'workEnd' | 'saturdayStart' | 'saturdayEnd',
    value: string
  ) => {
    setEmployees((prev) =>
      prev.map((item) => {
        if (item.id !== empId) return item;
        const currentResolved = resolveShiftForEmployeeInWeek(
          item,
          42,
          shift,
          policy,
          undefined,
          solverOptions
        );
        const baseCustom = {
          workStart: item.customShift?.workStart || currentResolved.workStart,
          breakStart:
            item.customShift?.breakStart ||
            (currentResolved.breakStart !== '-' ? currentResolved.breakStart : '12:00'),
          breakEnd:
            item.customShift?.breakEnd ||
            (currentResolved.breakEnd !== '-' ? currentResolved.breakEnd : '13:00'),
          workEnd: item.customShift?.workEnd || currentResolved.workEnd,
          saturdayStart: item.customShift?.saturdayStart || currentResolved.saturdayStart,
          saturdayBreakStart: item.customShift?.saturdayBreakStart,
          saturdayBreakEnd: item.customShift?.saturdayBreakEnd,
          saturdayEnd: item.customShift?.saturdayEnd || currentResolved.saturdayEnd,
          saturdayOffBreakStart: item.customShift?.saturdayOffBreakStart,
          saturdayOffBreakEnd: item.customShift?.saturdayOffBreakEnd,
          [field]: value,
        };
        const computed = computeShiftLabels(baseCustom);
        return {
          ...item,
          workloadSource: 'custom_shift',
          customWeeklyHours: computed.weeklyHours,
          customShift: baseCustom,
        };
      })
    );
  };

  const handleSelectStartDate = (isoDate: string) => {
    setStartFromDate(isoDate);
    if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      const [y, m] = isoDate.split('-').map(Number);
      if (y && m) {
        setSelectedYear(y);
        setSelectedMonth(m - 1);
      }
    }
  };

  const dayOffCountMap = useMemo(() => {
    const map: Record<string, { offCount: number; isSunday: boolean }> = {};
    if (!solverResult.success) return map;
    solverResult.weeks.forEach((week, wIdx) => {
      const assign = solverResult.assignments[wIdx];
      for (const d of ALL_OFF_DAYS) {
        const iso = week.datesByDow[d];
        if (!iso) continue;
        const offCount = activeEmployeesForMonth.filter(
          (e) => assign.offDayByEmployee[e.id] === d || (d === 6 && e.offMode === 'mon_fri')
        ).length;
        map[iso] = { offCount, isSunday: false };
      }
      if (week.datesByDow[0]) {
        map[week.datesByDow[0]] = { offCount: activeEmployeesForMonth.length, isSunday: true };
      }
    });
    return map;
  }, [solverResult, activeEmployeesForMonth]);

  const calendarCells = useMemo(() => {
    const first = new Date(selectedYear, selectedMonth, 1);
    const last = new Date(selectedYear, selectedMonth + 1, 0);
    const startDow = first.getDay();
    const leadingEmpty = startDow; // Domingo = 0
    const cells: Array<{ day: number | null; iso: string | null; dow: number }> = [];
    for (let i = 0; i < leadingEmpty; i++) {
      cells.push({ day: null, iso: null, dow: i });
    }
    for (let day = 1; day <= last.getDate(); day++) {
      const d = new Date(selectedYear, selectedMonth, day);
      const iso = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, iso, dow: d.getDay() });
    }
    return cells;
  }, [selectedYear, selectedMonth]);

  const todayIso = useMemo(() => toLocalDateStr(), []);

  const toggleAllowedDay = (empId: string, day: Weekday) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const exists = emp.allowedDays.includes(day);
        if (exists && emp.allowedDays.length === 1) {
          alert('No modo 5x2, cada colaborador precisa ter pelo menos 1 dia permitido para folga (ou mude o modo para 6x1 / Seg–Sex).');
          return emp;
        }
        const nextDays = exists
          ? emp.allowedDays.filter((d) => d !== day)
          : ([...emp.allowedDays, day].sort((a, b) => a - b) as Weekday[]);
        return { ...emp, allowedDays: nextDays };
      })
    );
  };

  const toggleAlternateDays = (empId: string) => {
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === empId ? { ...emp, alternateDays: !emp.alternateDays } : emp
      )
    );
  };

  const changeEmployeeGroup = (empId: string, group: GroupId) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === empId ? { ...emp, group } : emp))
    );
  };

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmpDbId) {
      const dbEmp = companyDbEmployees.find((d) => d.id === newEmpDbId);
      if (!dbEmp) return;
      if (employees.some((emp) => emp.id === dbEmp.id)) {
        alert('Este colaborador já está na escala.');
        return;
      }
      setEmployees((prev) => [
        ...prev,
        {
          id: dbEmp.id,
          name: dbEmp.name,
          group: newEmpGroup,
          offMode: '5x2',
          allowedDays: [1, 2, 3, 4, 5],
          alternateDays: false,
          avoidRepeatPrevWeek: true,
          shiftProfile: 'group',
          workloadSource: 'policy',
          registeredShift: extractRegisteredShift(dbEmp),
          note: dbEmp.role || '',
        },
      ]);
      setNewEmpDbId('');
      return;
    }

    const trimmed = newEmpName.trim();
    if (!trimmed) return;
    const id = `${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '') || 'emp'}-${Date.now().toString().slice(-4)}`;
    setEmployees((prev) => [
      ...prev,
      {
        id,
        name: trimmed,
        group: newEmpGroup,
        offMode: '5x2',
        allowedDays: [1, 2, 3, 4, 5],
        alternateDays: false,
        avoidRepeatPrevWeek: true,
        note: 'Adicionado manualmente',
      },
    ]);
    setNewEmpName('');
  };

  const handleRemoveEmployee = (empId: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== empId));
    setRules((prev) =>
      prev
        .map((r) => ({ ...r, employeeIds: r.employeeIds.filter((id) => id !== empId) }))
        .filter(
          (r) => r.type === 'day_cap' || r.type === 'min_present' || r.employeeIds.length >= 2
        )
    );
  };

  const toggleRuleEnabled = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    if (editingRuleId === ruleId) {
      resetRuleForm();
    }
  };

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setNewRuleType('max_simultaneous');
    setNewRuleName('');
    setNewRuleEmpIds([]);
    setNewRuleMaxOff(1);
    setNewRuleDays([]);
    setNewRuleMinPresent(1);
  };

  const handleStartEditRule = (rule: CollectiveRule) => {
    setEditingRuleId(rule.id);
    setNewRuleType(rule.type || 'max_simultaneous');
    setNewRuleName(rule.name);
    setNewRuleEmpIds([...rule.employeeIds]);
    setNewRuleMaxOff(rule.maxOffSameDay);
    setNewRuleDays(rule.applyToDays ? [...rule.applyToDays] : []);
    setNewRuleMinPresent(rule.minPresent ?? 1);
  };

  const toggleNewRuleEmployee = (empId: string) => {
    setNewRuleEmpIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const toggleNewRuleDay = (day: Weekday) => {
    setNewRuleDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : ([...prev, day].sort((a, b) => a - b) as Weekday[])
    );
  };

  const handleSaveCollectiveRule = (e: React.FormEvent) => {
    e.preventDefault();
    const isScopedRule = newRuleType === 'day_cap' || newRuleType === 'min_present';
    if (!isScopedRule && newRuleEmpIds.length < 2) {
      alert('Selecione pelo menos 2 colaboradores para esta regra coletiva.');
      return;
    }
    if (newRuleType === 'min_present') {
      const scopeSize = newRuleEmpIds.length > 0 ? newRuleEmpIds.length : employees.length;
      if (newRuleMinPresent < 1) {
        alert('O mínimo de funcionários presentes deve ser pelo menos 1.');
        return;
      }
      if (newRuleMinPresent > scopeSize) {
        alert(
          `O mínimo de presentes (${newRuleMinPresent}) não pode ser maior que a quantidade de colaboradores abrangidos (${scopeSize}).`
        );
        return;
      }
    }

    const names =
      newRuleEmpIds.length > 0
        ? newRuleEmpIds.map((id) => employees.find((e) => e.id === id)?.name || id).join(', ')
        : 'Toda a equipe';
    const daysDesc =
      newRuleDays.length > 0
        ? ` [${newRuleDays.map((d) => WEEKDAY_SHORT[d]).join('/')}]`
        : '';

    const defaultTitle =
      newRuleType === 'same_day'
        ? `${names}: Folgam sempre juntos`
        : newRuleType === 'min_present'
        ? `Mínimo de ${newRuleMinPresent} presente(s) por dia${daysDesc} (${names})`
        : newRuleType === 'day_cap'
        ? `Limite no dia${daysDesc}: Máx ${newRuleMaxOff} folga(s) (${names})`
        : `${names}: Máx ${newRuleMaxOff} folga(s) no mesmo dia${daysDesc}`;

    const ruleObj: CollectiveRule = {
      id: editingRuleId || `rule-${Date.now()}`,
      name: newRuleName.trim() || defaultTitle,
      type: newRuleType,
      employeeIds: newRuleEmpIds,
      maxOffSameDay: Math.max(0, newRuleMaxOff),
      minPresent: newRuleType === 'min_present' ? Math.max(1, newRuleMinPresent) : undefined,
      applyToDays: newRuleDays.length > 0 ? newRuleDays : undefined,
      enabled: true,
    };

    if (editingRuleId) {
      setRules((prev) => prev.map((r) => (r.id === editingRuleId ? ruleObj : r)));
    } else {
      setRules((prev) => [...prev, ruleObj]);
    }
    resetRuleForm();
  };

  const handleRestoreDefaults = () => {
    if (confirm('Deseja restaurar as condições desta empresa para o padrão inicial?')) {
      const source = effectiveCompanyId ? companyDbEmployees : dbEmployees;
      if (source.length > 0) {
        const fresh = buildConfigFromDbEmployees(source);
        setEmployees(fresh.employees);
        setRules(fresh.rules);
        setShift(fresh.shift);
        setPolicy(fresh.policy || DEFAULT_MTE_POLICY);
        setGroups(fresh.groups || ['A', 'B']);
        setGroupConfigs(fresh.groupConfigs || DEFAULT_GROUP_CONFIGS);
        setShiftProfiles(fresh.shiftProfiles || DEFAULT_SHIFT_PROFILES);
        setManualOverrides({});
      } else {
        setEmployees(DEFAULT_SCHEDULE_EMPLOYEES);
        setRules(DEFAULT_COLLECTIVE_RULES);
        setShift(DEFAULT_SHIFT_TEMPLATE);
        setPolicy(DEFAULT_MTE_POLICY);
        setGroups(['A', 'B']);
        setGroupConfigs(DEFAULT_GROUP_CONFIGS);
        setShiftProfiles(DEFAULT_SHIFT_PROFILES);
        setManualOverrides({});
      }
    }
  };

  const handleSyncCompanyEmployees = () => {
    const source = effectiveCompanyId ? companyDbEmployees : dbEmployees;
    if (source.length === 0) {
      alert('Nenhum colaborador cadastrado no banco para esta empresa.');
      return;
    }
    const fresh = buildConfigFromDbEmployees(source);
    const merged = fresh.employees.map((fe) => {
      const existing = employees.find(
        (e) => e.id === fe.id || e.name.trim().toLowerCase() === fe.name.trim().toLowerCase()
      );
      return existing
        ? { ...existing, id: fe.id, name: fe.name, registeredShift: fe.registeredShift }
        : fe;
    });
    setEmployees(merged);
    alert(`Sincronizado com sucesso (${merged.length} colaboradores)!`);
  };

  const handlePushShiftsToEmployeesTable = async () => {
    if (employees.length === 0) return;
    const source = effectiveCompanyId ? companyDbEmployees : dbEmployees;
    if (source.length === 0) {
      alert('Nenhum funcionário correspondente encontrado no banco de dados.');
      return;
    }
    if (
      !confirm(
        'Deseja gravar os horários semanais configurados nesta Escala 5x2 diretamente no cadastro dos Funcionários (Banco de Dados)?'
      )
    ) {
      return;
    }

    setIsPushingToDb(true);
    let updatedCount = 0;
    try {
      const currentAssign = solverResult.assignments[0];
      const targetLegalHours = currentAssign?.legalMaxWeeklyHours || 42;

      for (const emp of employees) {
        const dbMatch = source.find(
          (d) =>
            d.id === emp.id ||
            d.name.trim().toLowerCase() === emp.name.trim().toLowerCase()
        );
        if (!dbMatch) continue;

        const empShift = resolveShiftForEmployeeInWeek(
          emp,
          targetLegalHours,
          shift,
          policy,
          undefined,
          solverOptions
        );

        const satActive =
          emp.offMode !== 'mon_fri' &&
          Boolean(empShift.saturdayStart && empShift.saturdayEnd && empShift.saturdayStart !== empShift.saturdayEnd);

        const customSchedulePayload: Record<number, any> = {
          0: { active: false, work_start: '', break_start: '', break_end: '', work_end: '' },
          1: {
            active: true,
            work_start: empShift.workStart,
            break_start: empShift.breakStart !== '-' ? empShift.breakStart : '',
            break_end: empShift.breakEnd !== '-' ? empShift.breakEnd : '',
            work_end: empShift.workEnd,
          },
          2: {
            active: true,
            work_start: empShift.workStart,
            break_start: empShift.breakStart !== '-' ? empShift.breakStart : '',
            break_end: empShift.breakEnd !== '-' ? empShift.breakEnd : '',
            work_end: empShift.workEnd,
          },
          3: {
            active: true,
            work_start: empShift.workStart,
            break_start: empShift.breakStart !== '-' ? empShift.breakStart : '',
            break_end: empShift.breakEnd !== '-' ? empShift.breakEnd : '',
            work_end: empShift.workEnd,
          },
          4: {
            active: true,
            work_start: empShift.workStart,
            break_start: empShift.breakStart !== '-' ? empShift.breakStart : '',
            break_end: empShift.breakEnd !== '-' ? empShift.breakEnd : '',
            work_end: empShift.workEnd,
          },
          5: {
            active: true,
            work_start: empShift.workStart,
            break_start: empShift.breakStart !== '-' ? empShift.breakStart : '',
            break_end: empShift.breakEnd !== '-' ? empShift.breakEnd : '',
            work_end: empShift.workEnd,
          },
          6: {
            active: satActive,
            work_start: satActive ? empShift.saturdayStart : '',
            break_start: satActive && empShift.saturdayBreakStart ? empShift.saturdayBreakStart : '',
            break_end: satActive && empShift.saturdayBreakEnd ? empShift.saturdayBreakEnd : '',
            work_end: satActive ? empShift.saturdayEnd : '',
          },
        };

        const { error } = await supabase
          .from('employees')
          .update({
            weekly_hours: empShift.weeklyHours || targetLegalHours,
            schedule_type: 'custom',
            work_start: empShift.workStart || null,
            break_start: empShift.breakStart !== '-' ? empShift.breakStart : null,
            break_end: empShift.breakEnd !== '-' ? empShift.breakEnd : null,
            work_end: empShift.workEnd || null,
            work_days: satActive ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
            custom_schedule: customSchedulePayload,
          })
          .eq('id', dbMatch.id);

        if (!error) updatedCount++;
      }

      alert(`Horários aplicados com sucesso no cadastro de ${updatedCount} funcionário(s)!`);
    } catch (err: any) {
      alert('Erro ao gravar horários no banco: ' + (err.message || err));
    } finally {
      setIsPushingToDb(false);
    }
  };

  // Gerenciamento de Grupos e seus Turnos
  const handleAddGroup = () => {
    const trimmed = newGroupName.trim().toUpperCase();
    if (!trimmed) return;
    if (groups.includes(trimmed)) {
      alert('Este grupo já existe.');
      return;
    }
    setGroups((prev) => [...prev, trimmed]);
    setGroupConfigs((prev) => [...prev, createDefaultGroupConfig(trimmed)]);
    setSelectedGroupForHours(trimmed);
    setNewGroupName('');
  };

  const handleEditGroup = (oldGroup: GroupId, newGroup: string) => {
    const trimmed = newGroup.trim().toUpperCase();
    if (!trimmed || trimmed === oldGroup) {
      setEditingGroup(null);
      return;
    }
    if (groups.includes(trimmed)) {
      alert('Este grupo já existe.');
      return;
    }
    setEmployees((prev) =>
      prev.map((e) => (e.group === oldGroup ? { ...e, group: trimmed } : e))
    );
    setGroups((prev) => prev.map((g) => (g === oldGroup ? trimmed : g)));
    setGroupConfigs((prev) =>
      prev.map((gc) => (gc.id === oldGroup ? { ...gc, id: trimmed, label: `Grupo ${trimmed}` } : gc))
    );
    if (selectedGroupForHours === oldGroup) setSelectedGroupForHours(trimmed);
    if (groupFilter === oldGroup) setGroupFilter(trimmed);
    setEditingGroup(null);
  };

  const handleDeleteGroup = (groupToDelete: GroupId) => {
    const employeesInGroup = employees.filter((e) => e.group === groupToDelete);
    if (employeesInGroup.length > 0) {
      alert(
        `Não é possível excluir o grupo ${groupToDelete}: há ${employeesInGroup.length} colaborador(es) nele. Mova-os para outro grupo primeiro.`
      );
      return;
    }
    if (groups.length <= 1) {
      alert('Mantenha pelo menos 1 grupo cadastrado.');
      return;
    }
    if (confirm(`Tem certeza que deseja excluir o grupo ${groupToDelete}?`)) {
      const remaining = groups.filter((g) => g !== groupToDelete);
      setGroups(remaining);
      setGroupConfigs((prev) => prev.filter((gc) => gc.id !== groupToDelete));
      if (groupFilter === groupToDelete) setGroupFilter('ALL');
      if (selectedGroupForHours === groupToDelete) setSelectedGroupForHours(remaining[0] || 'A');
    }
  };

  const updateGroupShiftField = (
    groupId: GroupId,
    tier: 'shift42h' | 'shift44h' | 'shift40h' | 'saturdayOff42h',
    field: keyof ShiftTemplate,
    val: string
  ) => {
    setGroupConfigs((prev) => {
      const exists = prev.some((g) => g.id === groupId);
      const baseList = exists ? prev : [...prev, createDefaultGroupConfig(groupId)];
      return baseList.map((gc) => {
        if (gc.id !== groupId) return gc;
        const currentShift = (gc[tier] as ShiftTemplate) || createDefaultGroupConfig(groupId).shift42h;
        const updated = computeShiftLabels({
          ...currentShift,
          [field]: val,
          weeklyHours: tier === 'shift44h' ? 44 : tier === 'shift40h' ? 40 : 42,
        });
        return { ...gc, [tier]: updated };
      });
    });
  };

  const updateGroupMinPresent = (groupId: GroupId, minVal: number) => {
    setGroupConfigs((prev) =>
      prev.map((gc) => (gc.id === groupId ? { ...gc, minDailyPresent: Math.max(0, minVal) } : gc))
    );
  };

  // Gerenciamento de Perfis de Turno
  const handleSaveShiftProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName =
      profName.trim() || `${profWs}–${profWe} (Int. ${profBs}–${profBe} | Sáb ${profSatStart}–${profSatEnd})`;
    const builtShift = computeShiftLabels({
      workStart: profWs,
      breakStart: profBs || '-',
      breakEnd: profBe || '-',
      workEnd: profWe,
      saturdayStart: profSatStart,
      saturdayEnd: profSatEnd,
    });

    if (editingProfileId) {
      setShiftProfiles((prev) =>
        prev.map((p) => (p.id === editingProfileId ? { ...p, name: cleanName, shift: builtShift } : p))
      );
    } else {
      const newId = `prof-${Date.now().toString(36)}`;
      setShiftProfiles((prev) => [...prev, { id: newId, name: cleanName, shift: builtShift }]);
    }
    setEditingProfileId(null);
    setProfName('');
  };

  const handleEditShiftProfile = (prof: CustomShiftProfile) => {
    setEditingProfileId(prof.id);
    setProfName(prof.name);
    setProfWs(prof.shift.workStart);
    setProfBs(prof.shift.breakStart !== '-' ? prof.shift.breakStart : '');
    setProfBe(prof.shift.breakEnd !== '-' ? prof.shift.breakEnd : '');
    setProfWe(prof.shift.workEnd);
    setProfSatStart(prof.shift.saturdayStart);
    setProfSatEnd(prof.shift.saturdayEnd);
  };

  const handleDeleteShiftProfile = (profId: string) => {
    if (!confirm('Deseja excluir este perfil de horário? Os colaboradores que o usavam voltarão ao horário do grupo.')) {
      return;
    }
    setShiftProfiles((prev) => prev.filter((p) => p.id !== profId));
    setEmployees((prev) =>
      prev.map((e) => (e.shiftProfile === profId ? { ...e, shiftProfile: 'group' } : e))
    );
    if (editingProfileId === profId) {
      setEditingProfileId(null);
      setProfName('');
    }
  };

  // Backup JSON Export / Import
  const handleExportConfigJSON = () => {
    const payload: StoredSchedule5x2Config = {
      employees,
      rules,
      shift,
      policy,
      groups,
      groupConfigs,
      shiftProfiles,
      manualOverrides,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-condicoes-5x2-${activeCompany?.name || 'geral'}-${todayIso}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportConfigJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.employees) || !Array.isArray(parsed.rules)) {
          alert('Arquivo JSON inválido.');
          return;
        }
        const { groups: gList, groupConfigs: gcList } = ensureGroupsSynchronized(
          parsed.groups,
          parsed.groupConfigs,
          parsed.employees
        );
        setEmployees(parsed.employees);
        setRules(parsed.rules);
        if (parsed.shift) setShift(parsed.shift);
        if (parsed.policy) setPolicy({ ...DEFAULT_MTE_POLICY, ...parsed.policy });
        setGroups(gList);
        setGroupConfigs(gcList);
        if (Array.isArray(parsed.shiftProfiles)) setShiftProfiles(parsed.shiftProfiles);
        if (parsed.manualOverrides) setManualOverrides(parsed.manualOverrides);
        alert('Configurações e condições importadas com sucesso!');
      } catch {
        alert('Não foi possível ler o arquivo de backup.');
      }
      if (fileImportRef.current) fileImportRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handlePullWorkloadFromEmployeesTab = () => {
    const source = effectiveCompanyId ? companyDbEmployees : dbEmployees;
    if (source.length === 0) {
      alert('Nenhum colaborador encontrado na aba Funcionários para esta empresa.');
      return;
    }

    let matchedCount = 0;
    const updated = employees.map((emp) => {
      const dbMatch = source.find(
        (d) =>
          d.id === emp.id ||
          d.name.trim().toLowerCase() === emp.name.trim().toLowerCase() ||
          d.name.trim().toLowerCase().startsWith(`${emp.name.trim().toLowerCase()} `)
      );
      if (!dbMatch) return emp;
      matchedCount++;
      const reg = extractRegisteredShift(dbMatch);
      return {
        ...emp,
        workloadSource: 'cadastro' as WorkloadSource,
        registeredShift: reg,
      };
    });

    if (matchedCount === 0) {
      const fresh = buildConfigFromDbEmployees(source);
      setEmployees(
        fresh.employees.map((e) => ({
          ...e,
          workloadSource: 'cadastro' as WorkloadSource,
        }))
      );
      alert(`Importados ${fresh.employees.length} colaborador(es) da aba Funcionários com suas cargas horárias cadastradas.`);
      return;
    }

    setEmployees(updated);
    alert(`Carga horária de ${matchedCount} colaborador(es) atualizada a partir da aba Funcionários!`);
  };

  const handleExportCSV = () => {
    if (!solverResult.success) return;
    const rows: string[] = [
      'Semana;Limite MTE;Colaborador;Grupo;Folga Semanal;DSR;Jornada Seg-Sex;Jornada Sabado',
    ];
    for (let i = 0; i < solverResult.weeks.length; i++) {
      const w = solverResult.weeks[i];
      const assign = solverResult.assignments[i];
      for (const emp of activeEmployeesForMonth) {
        const offDay = assign.offDayByEmployee[emp.id];
        const s = resolveShiftForEmployeeInWeek(
          emp,
          assign.legalMaxWeeklyHours,
          assign.appliedShift,
          policy,
          offDay,
          solverOptions
        );
        const offLabel =
          offDay === 0
            ? 'Sem folga útil (6x1)'
            : `${WEEKDAY_LABELS[offDay as Weekday]} (${w.datesByDow[offDay] || ''})`;
        const satOff = offDay === 6 || emp.offMode === 'mon_fri' || s.saturdayStart === s.saturdayEnd;
        rows.push(
          `"${w.label}";"${assign.legalMaxWeeklyHours}h/sem";"${emp.name}";"Grupo ${emp.group}";"${offLabel}";"Domingo (${w.datesByDow[0]})";"${s.workStart}-${s.workEnd} (Int. ${s.breakStart}-${s.breakEnd})";"${satOff ? 'FOLGA' : `${s.saturdayStart}-${s.saturdayEnd}`}"`
        );
      }
    }
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `escala-5x2-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyUltralabPreset = () => {
    if (
      !confirm(
        'Aplicar o padrão de horários ULTRALAB (Seg–Sex 07:00–17:24 com intervalo 12:00–13:30; Sáb 07:00–12:00 com 15min de intervalo; 1 folga útil por dia sem colisão) aos colaboradores desta escala? Você poderá editar qualquer horário depois.'
      )
    ) {
      return;
    }
    setPolicy((prev) => ({ ...prev, phaseMode: '42h' }));
    setEmployees((prev) =>
      prev.map((emp) => {
        const norm = emp.name.trim().toLowerCase();
        const isJouberth = norm.includes('jouberth');
        const fixedDay: Weekday | undefined = norm.includes('david')
          ? 1
          : norm.includes('licia') || norm.includes('lícia')
          ? 2
          : isJouberth
          ? 3
          : norm.includes('nelida') || norm.includes('nélida')
          ? 4
          : undefined;
        return {
          ...emp,
          workloadSource: 'custom_shift',
          customWeeklyHours: 42,
          allowedDays: fixedDay ? [fixedDay, ...([1, 2, 3, 4, 5].filter((d) => d !== fixedDay) as Weekday[])] : emp.allowedDays,
          customShift: {
            workStart: '07:00',
            breakStart: '12:00',
            breakEnd: '13:30',
            workEnd: '17:24',
            saturdayStart: '07:00',
            saturdayBreakStart: isJouberth ? '10:00' : '09:45',
            saturdayBreakEnd: isJouberth ? '10:15' : '10:00',
            saturdayEnd: '12:00',
            saturdayOffBreakStart: '12:00',
            saturdayOffBreakEnd: '14:00',
          },
        };
      })
    );
    // Garante regra de exclusão mútua entre a equipe se ainda não existir
    if (employees.length >= 2) {
      const ruleId = 'rule-ultralab-exclusao';
      setRules((prev) => {
        if (prev.some((r) => r.id === ruleId)) return prev;
        return [
          ...prev,
          {
            id: ruleId,
            name: 'Equipe: Máximo 1 folga por dia útil (não folgam juntos)',
            type: 'max_simultaneous',
            employeeIds: employees.map((e) => e.id),
            maxOffSameDay: 1,
            enabled: true,
          },
        ];
      });
    }
    alert('Padrão ULTRALAB aplicado! Você pode ajustar qualquer dia ou horário livremente nas abas.');
  };

  const handlePrintWeek = (wIdx: number) => {
    if (!solverResult.success || !solverResult.weeks[wIdx]) return;
    printScheduleWeekHtml({
      week: solverResult.weeks[wIdx],
      assignment: solverResult.assignments[wIdx],
      employees: activeEmployeesForMonth,
      policy,
      solverOptions,
      companyName: activeCompany ? activeCompany.name : 'Todas as Empresas',
      companyCnpj: activeCompany?.cnpj,
    });
  };

  const handlePrintCurrentWeek = () => {
    if (!solverResult.success || solverResult.weeks.length === 0) return;
    const todayStr = toLocalDateStr();
    const idx = solverResult.weeks.findIndex((w) => Object.values(w.datesByDow).includes(todayStr));
    handlePrintWeek(idx >= 0 ? idx : 0);
  };

  const handleExportControlePDF = () => {
    exportControleJornadaPDF({
      solverResult,
      employees: activeEmployeesForMonth,
      policy,
      solverOptions,
      companyName: activeCompany ? activeCompany.name : 'Geral',
      monthLabel: MONTH_NAMES[selectedMonth],
      year: selectedYear,
      dailyAlertHours: 10,
    });
  };

  const handleExportPDF = () => {
    if (!solverResult.success) return;
    const companyLabel = activeCompany ? activeCompany.name : 'Todas as Empresas';
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(
      `Controle de Jornada 5x2 — ${MONTH_NAMES[selectedMonth]} / ${selectedYear}`,
      14,
      15
    );
    doc.setFontSize(9);
    doc.text(
      `Empresa: ${companyLabel}${activeCompany?.cnpj ? ` (CNPJ: ${activeCompany.cnpj})` : ''} | Portaria MTE nº 2.041/2026 | Auditoria: ${allAuditsPassed ? 'APROVADA' : 'COM ALERTAS'}`,
      14,
      21
    );

    let y = 29;
    const colWidths = [38, 16, 30, 30, 30, 30, 30, 30, 24];
    const headers = ['Colaborador', 'Grupo', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    for (let wIdx = 0; wIdx < solverResult.weeks.length; wIdx++) {
      const week = solverResult.weeks[wIdx];
      const assign = solverResult.assignments[wIdx];

      if (y > 170) {
        doc.addPage();
        y = 15;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${week.label} — Teto Vigente: ${assign.legalMaxWeeklyHours}h/sem`, 14, y);
      y += 4;

      doc.setFontSize(8);
      let x = 14;
      headers.forEach((h, idx) => {
        doc.rect(x, y, colWidths[idx], 6);
        doc.text(h, x + 1.5, y + 4);
        x += colWidths[idx];
      });
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      for (const emp of activeEmployeesForMonth) {
        if (y > 192) {
          doc.addPage();
          y = 15;
        }
        const offDay = assign.offDayByEmployee[emp.id];
        const s = resolveShiftForEmployeeInWeek(
          emp,
          assign.legalMaxWeeklyHours,
          assign.appliedShift,
          policy,
          offDay,
          solverOptions
        );
        const weekdayStr = `${s.workStart}-${s.workEnd}`;
        const satOff = offDay === 6 || emp.offMode === 'mon_fri' || s.saturdayStart === s.saturdayEnd;
        const satStr = satOff ? 'FOLGA' : `${s.saturdayStart}-${s.saturdayEnd}`;

        const cells = [
          emp.name.substring(0, 20),
          `${emp.group}`,
          offDay === 1 ? 'FOLGA' : weekdayStr,
          offDay === 2 ? 'FOLGA' : weekdayStr,
          offDay === 3 ? 'FOLGA' : weekdayStr,
          offDay === 4 ? 'FOLGA' : weekdayStr,
          offDay === 5 ? 'FOLGA' : weekdayStr,
          satStr,
          'DSR',
        ];
        x = 14;
        cells.forEach((val, idx) => {
          doc.rect(x, y, colWidths[idx], 5.5);
          doc.text(val, x + 1.5, y + 3.8);
          x += colWidths[idx];
        });
        y += 5.5;
      }
      y += 6;
    }

    doc.save(`escala-5x2-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
  };

  const selectedGroupConfig = useMemo(
    () =>
      groupConfigs.find((gc) => gc.id === selectedGroupForHours) ||
      createDefaultGroupConfig(selectedGroupForHours || 'A'),
    [groupConfigs, selectedGroupForHours]
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Módulo 5x2 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-industrial-text flex items-center gap-2">
              <Sparkles className="text-cyber-emerald" size={20} />
              Controle de Jornada 5x2
            </h2>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                allAuditsPassed
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {allAuditsPassed ? (
                <>
                  <CheckCircle2 size={13} /> CLT & MTE 2.041/2026: 100% Conforme
                </>
              ) : (
                <>
                  <AlertTriangle size={13} /> Revisar Alertas na Auditoria
                </>
              )}
            </span>
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                cloudSyncStatus === 'saved'
                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : cloudSyncStatus === 'saving'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : cloudSyncStatus === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {cloudSyncStatus === 'saved'
                ? '☁ Salvo na nuvem (Supabase)'
                : cloudSyncStatus === 'saving'
                ? '☁ Salvando na nuvem...'
                : cloudSyncStatus === 'error'
                ? '⚠ Erro ao salvar na nuvem'
                : '☁ Sincronização na nuvem ativa'}
            </span>
          </div>
          <p className="text-xs text-industrial-muted mt-1">
            100% configurável pelo site: clique em qualquer célula para fixar folga manual ou personalize grupos, turnos e regras nas abas ao lado.
          </p>
        </div>

        {/* Sub-navegação */}
        <div className="flex bg-industrial-bg p-1 rounded-xl gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('schedule')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'schedule'
                ? 'bg-white text-cyber-emerald shadow-sm'
                : 'text-industrial-muted hover:text-industrial-text'
            }`}
          >
            <Calendar size={14} /> Escala Mensal
          </button>
          <button
            type="button"
            onClick={() => setSubTab('conditions')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'conditions'
                ? 'bg-white text-cyber-emerald shadow-sm'
                : 'text-industrial-muted hover:text-industrial-text'
            }`}
          >
            <Lock size={14} /> Condições Individuais & Coletivas
          </button>
          <button
            type="button"
            onClick={() => setSubTab('shifts')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'shifts'
                ? 'bg-white text-cyber-emerald shadow-sm'
                : 'text-industrial-muted hover:text-industrial-text'
            }`}
          >
            <Sliders size={14} /> Grupos, Turnos & Batidas
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'audit'
                ? 'bg-white text-cyber-emerald shadow-sm'
                : 'text-industrial-muted hover:text-industrial-text'
            }`}
          >
            <ShieldCheck size={14} /> Vigência MTE & Auditoria
          </button>
        </div>
      </div>

      {/* SUB-ABA 1: ESCALA MENSAL */}
      {subTab === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-industrial-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="block text-[11px] font-semibold text-industrial-muted mb-1 flex items-center gap-1">
                    <Building2 size={12} /> Empresa
                  </label>
                  <select
                    value={effectiveCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    disabled={Boolean(loggedAdmin.company_id)}
                    className="px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium bg-industrial-bg outline-none focus:border-cyber-emerald disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {!loggedAdmin.company_id && <option value="">Todas as Empresas</option>}
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                    Mês de Referência
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium bg-industrial-bg outline-none focus:border-cyber-emerald"
                  >
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                    Ano
                  </label>
                  <input
                    type="number"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value) || 2026)}
                    className="w-24 px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium bg-industrial-bg outline-none focus:border-cyber-emerald"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                    A partir do dia
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={startFromDate}
                      onChange={(e) => handleSelectStartDate(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium bg-industrial-bg outline-none focus:border-cyber-emerald"
                    />
                    {startFromDate && (
                      <button
                        type="button"
                        onClick={() => setStartFromDate('')}
                        className="px-2.5 py-2 rounded-lg border border-industrial-border text-xs font-semibold text-industrial-muted hover:text-industrial-text hover:bg-industrial-bg"
                      >
                        Mês todo
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                    Carga Horária (Escala / MTE)
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value={policy.phaseMode}
                      onChange={(e) =>
                        setPolicy({ ...policy, phaseMode: e.target.value as MteTransitionPhase })
                      }
                      className="px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium bg-industrial-bg outline-none focus:border-cyber-emerald"
                    >
                      <option value="auto">Automático MTE (44h → 42h → 40h)</option>
                      <option value="44h">44h semanais</option>
                      <option value="42h">42h semanais</option>
                      <option value="40h">40h semanais</option>
                      <option value="custom">Personalizado (h/sem)</option>
                    </select>
                    {policy.phaseMode === 'custom' && (
                      <input
                        type="number"
                        min={10}
                        max={48}
                        value={policy.customMaxWeeklyHours || 42}
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            customMaxWeeklyHours: Math.max(10, Math.min(48, Number(e.target.value) || 42)),
                          })
                        }
                        className="w-16 px-2 py-2 rounded-lg border border-cyber-emerald text-sm font-bold text-center outline-none"
                        title="Horas semanais personalizadas"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePullWorkloadFromEmployeesTab}
                  className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 whitespace-nowrap"
                  title="Puxar carga horária e horários cadastrados na aba Funcionários"
                >
                  Puxar de Funcionários
                </button>
                <button
                  type="button"
                  onClick={handlePushShiftsToEmployeesTable}
                  disabled={isPushingToDb}
                  className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap flex items-center gap-1 disabled:opacity-50"
                  title="Gravar horários desta escala no cadastro da aba Funcionários no banco de dados"
                >
                  <Save size={13} /> {isPushingToDb ? 'Gravando...' : 'Aplicar em Funcionários'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCalendar((v) => !v)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    showCalendar
                      ? 'border-cyber-emerald bg-emerald-50 text-emerald-700'
                      : 'border-industrial-border hover:border-cyber-emerald hover:text-cyber-emerald'
                  }`}
                >
                  <Calendar size={14} /> {showCalendar ? 'Ocultar Calendário' : 'Calendário'}
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={!solverResult.success}
                  className="px-3 py-2 rounded-xl border border-industrial-border text-xs font-semibold hover:border-cyber-emerald hover:text-cyber-emerald transition-colors flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Download size={14} /> CSV
                </button>
                <button
                  type="button"
                  onClick={handlePrintCurrentWeek}
                  disabled={!solverResult.success}
                  className="px-3.5 py-2 rounded-xl bg-industrial-text text-white text-xs font-bold hover:bg-opacity-90 transition-all flex items-center gap-1.5 disabled:opacity-40"
                  title="Imprimir a escala 5x2 da semana vigente"
                >
                  <Printer size={14} /> Imprimir Semana Vigente
                </button>
                <button
                  type="button"
                  onClick={handleExportControlePDF}
                  disabled={!solverResult.success}
                  className="px-3.5 py-2 rounded-xl bg-cyber-emerald text-white text-xs font-bold hover:bg-opacity-90 transition-all flex items-center gap-1.5 disabled:opacity-40"
                  title="Exportar Controle de Jornada individual por semana (Modelo ULTRALAB, Domingo a Sábado)"
                >
                  <Download size={14} /> PDF Controle de Jornada
                </button>
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={!solverResult.success}
                  className="px-3 py-2 rounded-xl border border-industrial-border text-xs font-semibold hover:border-cyber-emerald hover:text-cyber-emerald transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  title="Exportar tabela resumo mensal"
                >
                  <Download size={14} /> PDF Resumo
                </button>
              </div>
            </div>

            {/* Barra de integração com as outras abas + indicador de ajustes manuais */}
            <div className="pt-2.5 border-t border-industrial-border/70 flex flex-wrap items-center justify-between gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-industrial-text">
                <input
                  type="checkbox"
                  checked={useInOtherTabs}
                  onChange={(e) => handleToggleUseInOtherTabs(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                />
                <span>
                  Usar automaticamente as folgas e horários desta <strong>Escala 5x2</strong> nas abas{' '}
                  <strong>Relatórios (Faltas)</strong>, <strong>Banco de Horas</strong> e{' '}
                  <strong>Batidas Automáticas</strong>
                </span>
              </label>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-industrial-muted">
                  Dica: clique em qualquer célula (Seg–Sáb) na tabela abaixo para fixar/mudar uma folga manualmente na semana.
                </span>
                {hasManualOverridesInMonth && (
                  <button
                    type="button"
                    onClick={handleClearMonthManualOverrides}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[11px] hover:bg-amber-100 flex items-center gap-1"
                  >
                    <Unlock size={12} /> Limpar Ajustes Manuais do Mês
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Calendário interativo */}
          {showCalendar && (
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-industrial-border space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-cyber-emerald" />
                  <h3 className="font-bold text-sm text-industrial-text">
                    Calendário — {MONTH_NAMES[selectedMonth]} / {selectedYear}
                  </h3>
                  {startFromDate ? (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Exibindo escala a partir de {startFromDate.split('-').reverse().join('/')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-industrial-muted">
                      Clique em um dia para filtrar a escala a partir daquela data
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectStartDate(todayIso)}
                    className="px-2.5 py-1 rounded-lg border border-industrial-border text-[11px] font-semibold hover:border-cyber-emerald hover:text-cyber-emerald"
                  >
                    Hoje
                  </button>
                  {startFromDate && (
                    <button
                      type="button"
                      onClick={() => setStartFromDate('')}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-industrial-text hover:bg-slate-200"
                    >
                      Limpar filtro
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
                  <div
                    key={d}
                    className={`text-[11px] font-bold py-1 ${
                      d === 'Dom' ? 'text-amber-700' : 'text-industrial-muted'
                    }`}
                  >
                    {d}
                  </div>
                ))}
                {calendarCells.map((cell, idx) => {
                  if (!cell.day || !cell.iso) {
                    return <div key={`empty-${idx}`} className="h-12 rounded-lg bg-slate-50/50" />;
                  }
                  const isSelected = startFromDate === cell.iso;
                  const isAfterStart = Boolean(startFromDate && cell.iso > startFromDate);
                  const isBeforeStart = Boolean(startFromDate && cell.iso < startFromDate);
                  const isToday = cell.iso === todayIso;
                  const info = dayOffCountMap[cell.iso];

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setStartFromDate(isSelected ? '' : cell.iso!)}
                      className={`h-12 rounded-lg border px-1.5 py-1 flex flex-col items-center justify-between transition-all text-xs ${
                        isSelected
                          ? 'bg-cyber-emerald text-white border-cyber-emerald font-bold shadow-sm ring-2 ring-emerald-200'
                          : isAfterStart
                          ? 'bg-emerald-50/70 border-emerald-200 text-industrial-text hover:border-cyber-emerald'
                          : isBeforeStart
                          ? 'bg-slate-50 border-industrial-border/60 text-industrial-muted opacity-45 hover:opacity-80'
                          : cell.dow === 0
                          ? 'bg-amber-50/50 border-amber-200/70 text-amber-800 hover:border-cyber-emerald'
                          : 'bg-white border-industrial-border text-industrial-text hover:border-cyber-emerald'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between">
                        <span className="font-bold text-[12px]">{cell.day}</span>
                        {isToday && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected ? 'bg-white' : 'bg-cyber-emerald'
                            }`}
                            title="Hoje"
                          />
                        )}
                      </div>
                      {info && (
                        <span
                          className={`text-[9px] font-semibold truncate max-w-full ${
                            isSelected
                              ? 'text-white/95'
                              : info.isSunday
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {info.isSunday
                            ? 'DSR'
                            : `${info.offCount} folga${info.offCount === 1 ? '' : 's'}`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!solverResult.success ? (
            <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-bold text-sm">Impossível resolver a escala com as restrições atuais</h3>
                <p className="text-xs mt-1">{solverResult.error}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setSubTab('conditions')}
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg"
                  >
                    Ajustar Condições Individuais & Coletivas
                  </button>
                  {hasManualOverridesInMonth && (
                    <button
                      type="button"
                      onClick={handleClearMonthManualOverrides}
                      className="px-3 py-1.5 bg-white border border-red-300 text-red-700 text-xs font-semibold rounded-lg"
                    >
                      Limpar Ajustes Manuais do Mês
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {solverResult.weeks
                .map((week, wIdx) => ({ week, wIdx }))
                .filter(({ week }) => !startFromDate || (week.datesByDow[0] || '') >= startFromDate)
                .map(({ week, wIdx }) => {
                  const assign = solverResult.assignments[wIdx];
                  const isDayBeforeStart = (iso?: string) => Boolean(startFromDate && iso && iso < startFromDate);
                  const isSelectedStartDay = (iso?: string) => Boolean(startFromDate && iso && iso === startFromDate);

                  return (
                    <div
                      key={week.weekIndex}
                      className="bg-white rounded-2xl shadow-sm border border-industrial-border overflow-hidden"
                    >
                      <div className="px-5 py-3.5 bg-industrial-bg border-b border-industrial-border flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-bold text-sm text-industrial-text flex items-center gap-2">
                            <Calendar size={16} className="text-cyber-emerald" />
                            {week.label}
                          </h3>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              assign.legalMaxWeeklyHours <= 40
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : assign.legalMaxWeeklyHours <= 42
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {assign.legalMaxWeeklyHours >= 44
                              ? 'Padrão Normal em uso: 44h/sem'
                              : assign.legalMaxWeeklyHours === 42
                              ? `Vigência MTE (≥${policy.transition42Date.split('-').reverse().join('/')}): 42h/sem`
                              : `Vigência MTE: ${assign.legalMaxWeeklyHours}h/sem`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-[11px] font-medium text-industrial-muted">
                            Equipe ativa: {activeEmployeesForMonth.length} colaboradores
                            {vacationEmployeesForMonth.length > 0 && (
                              <span className="ml-1.5 text-amber-700 font-semibold">
                                • De férias (excluídos): {vacationEmployeesForMonth.map((e) => e.name).join(', ')}
                              </span>
                            )}
                            {activeCompany ? ` • ${activeCompany.name}` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePrintWeek(wIdx)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-industrial-border text-[11px] font-bold text-industrial-text hover:border-cyber-emerald hover:text-cyber-emerald flex items-center gap-1 transition-colors"
                            title="Imprimir esta semana"
                          >
                            <Printer size={12} /> Imprimir Semana
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-industrial-border bg-slate-50/70 text-industrial-muted">
                              <th className="text-left py-2.5 px-4 font-semibold">Colaborador</th>
                              {hasGroupDistinction && (
                                <th className="text-center py-2.5 px-2 font-semibold">Grupo</th>
                              )}
                              <th className="text-center py-2.5 px-2 font-semibold">Carga Horária</th>
                              {ALL_WEEKDAYS.map((d) => {
                                const iso = week.datesByDow[d];
                                return (
                                  <th
                                    key={d}
                                    className={`text-center py-2.5 px-2 font-semibold ${
                                      isSelectedStartDay(iso)
                                        ? 'bg-emerald-100/80 text-emerald-900'
                                        : isDayBeforeStart(iso)
                                        ? 'opacity-35'
                                        : ''
                                    }`}
                                  >
                                    <div>{WEEKDAY_SHORT[d]}</div>
                                    <div className="text-[10px] font-normal">
                                      {iso?.slice(8, 10)}/{iso?.slice(5, 7)}
                                    </div>
                                  </th>
                                );
                              })}
                              <th
                                className={`text-center py-2.5 px-2 font-semibold ${
                                  isSelectedStartDay(week.datesByDow[6])
                                    ? 'bg-emerald-100/80 text-emerald-900'
                                    : isDayBeforeStart(week.datesByDow[6])
                                    ? 'opacity-35'
                                    : ''
                                }`}
                              >
                                <div>Sáb</div>
                                <div className="text-[10px] font-normal">
                                  {week.datesByDow[6]?.slice(8, 10)}/{week.datesByDow[6]?.slice(5, 7)}
                                </div>
                              </th>
                              <th
                                className={`text-center py-2.5 px-2 font-semibold ${
                                  isSelectedStartDay(week.datesByDow[0])
                                    ? 'bg-emerald-100/80 text-emerald-900'
                                    : isDayBeforeStart(week.datesByDow[0])
                                    ? 'opacity-35'
                                    : ''
                                }`}
                              >
                                <div>Dom</div>
                                <div className="text-[10px] font-normal">
                                  {week.datesByDow[0]?.slice(8, 10)}/{week.datesByDow[0]?.slice(5, 7)}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-industrial-border/60">
                            {activeEmployeesForMonth.map((emp) => {
                              const offDay = assign.offDayByEmployee[emp.id];
                              const isManual = Boolean(assign.manualByEmployee?.[emp.id]);
                              const empShift = resolveShiftForEmployeeInWeek(
                                emp,
                                assign.legalMaxWeeklyHours,
                                assign.appliedShift,
                                policy,
                                offDay,
                                solverOptions
                              );
                              const satOff =
                                offDay === 6 ||
                                emp.offMode === 'mon_fri' ||
                                empShift.saturdayStart === empShift.saturdayEnd;

                              return (
                                <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2.5 px-4 font-semibold text-industrial-text">
                                    <span>{emp.name}</span>
                                    {emp.alternateDays && (
                                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                        Alterna
                                      </span>
                                    )}
                                    {isManual && (
                                      <span
                                        className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold"
                                        title="Folga fixada manualmente nesta semana (clique na folga para voltar ao automático)"
                                      >
                                        Manual
                                      </span>
                                    )}
                                  </td>
                                  {hasGroupDistinction && (
                                    <td className="py-2.5 px-2 text-center">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          emp.group === 'A'
                                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                            : emp.group === 'B'
                                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                            : 'bg-teal-50 text-teal-700 border border-teal-200'
                                        }`}
                                      >
                                        {emp.group}
                                      </span>
                                    </td>
                                  )}
                                  <td className="py-2 px-1.5 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <select
                                        value={
                                          emp.workloadSource === 'custom_shift'
                                            ? 'custom_shift'
                                            : emp.workloadSource === 'cadastro'
                                            ? 'cadastro'
                                            : emp.workloadSource === 'custom'
                                            ? [44, 42, 40, 36].includes(emp.customWeeklyHours || 0)
                                              ? `custom:${emp.customWeeklyHours}`
                                              : 'custom:other'
                                            : 'policy'
                                        }
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === 'custom:other') {
                                            updateEmployeeWorkload(
                                              emp.id,
                                              `custom:${emp.customWeeklyHours || 30}`
                                            );
                                          } else {
                                            updateEmployeeWorkload(emp.id, val);
                                          }
                                        }}
                                        className="px-1.5 py-1 rounded-md border border-industrial-border bg-white text-[11px] font-semibold outline-none focus:border-cyber-emerald"
                                      >
                                        <option value="policy">MTE ({assign.legalMaxWeeklyHours}h)</option>
                                        <option value="cadastro">
                                          Func. ({emp.registeredShift?.weeklyHours || 44}h)
                                        </option>
                                        <option value="custom_shift">
                                          Batidas Indiv. ({empShift.weeklyHours}h)
                                        </option>
                                        <option value="custom:44">44h</option>
                                        <option value="custom:42">42h</option>
                                        <option value="custom:40">40h</option>
                                        <option value="custom:36">36h</option>
                                        <option value="custom:other">Outra...</option>
                                      </select>
                                      {emp.workloadSource === 'custom' &&
                                        ![44, 42, 40, 36].includes(emp.customWeeklyHours || 0) && (
                                          <input
                                            type="number"
                                            min={1}
                                            max={48}
                                            value={emp.customWeeklyHours || 30}
                                            onChange={(e) =>
                                              updateEmployeeWorkload(emp.id, `custom:${e.target.value}`)
                                            }
                                            className="w-12 px-1 py-0.5 rounded border border-cyber-emerald text-[11px] text-center font-bold outline-none"
                                          />
                                        )}
                                    </div>
                                  </td>
                                  {ALL_WEEKDAYS.map((d) => {
                                    const isOff = offDay === d;
                                    const iso = week.datesByDow[d];
                                    const covTag = !isOff
                                      ? getDayCoverageTag(emp, d, assign, activeEmployeesForMonth)
                                      : null;
                                    return (
                                      <td
                                        key={d}
                                        onClick={() => handleToggleCellManualOff(week.weekKey, emp.id, d)}
                                        title={
                                          isOff && isManual
                                            ? 'Clique para remover folga manual e voltar ao automático'
                                            : `Clique para definir FOLGA manual de ${emp.name} nesta ${WEEKDAY_LABELS[d]} | Intervalo: ${empShift.breakStart}–${empShift.breakEnd}`
                                        }
                                        className={`py-2 px-1.5 text-center cursor-pointer select-none ${
                                          isSelectedStartDay(iso)
                                            ? 'bg-emerald-50/70'
                                            : isDayBeforeStart(iso)
                                            ? 'opacity-35'
                                            : ''
                                        }`}
                                      >
                                        {isOff ? (
                                          <span
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] border ${
                                              isManual
                                                ? 'bg-blue-100 text-blue-800 border-blue-300'
                                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                            }`}
                                          >
                                            {isManual && <Lock size={10} />} FOLGA
                                          </span>
                                        ) : covTag ? (
                                          <span className="inline-flex flex-col items-center px-2 py-1 rounded-lg bg-red-100 text-red-700 border border-red-300 font-bold text-[11px] leading-tight">
                                            <span>{empShift.workStart}–{empShift.workEnd}</span>
                                            <span className="text-[9px] font-black tracking-wider text-red-800">
                                              {covTag.label}
                                            </span>
                                          </span>
                                        ) : (
                                          <span className="inline-block px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-800 font-medium text-[11px] transition-colors">
                                            {empShift.workStart}–{empShift.workEnd}
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td
                                    onClick={() => handleToggleCellManualOff(week.weekKey, emp.id, 6)}
                                    title="Clique para fixar/alternar folga manual no Sábado nesta semana"
                                    className={`py-2 px-1.5 text-center cursor-pointer select-none ${
                                      isSelectedStartDay(week.datesByDow[6])
                                        ? 'bg-emerald-50/70'
                                        : isDayBeforeStart(week.datesByDow[6])
                                        ? 'opacity-35'
                                        : ''
                                    }`}
                                  >
                                    {satOff ? (
                                      <span
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] border ${
                                          isManual && offDay === 6
                                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        }`}
                                      >
                                        {isManual && offDay === 6 && <Lock size={10} />} FOLGA
                                      </span>
                                    ) : (() => {
                                      const satTag = getDayCoverageTag(emp, 6, assign, activeEmployeesForMonth);
                                      return satTag ? (
                                        <span className="inline-flex flex-col items-center px-2 py-1 rounded-lg bg-red-100 text-red-700 border border-red-300 font-bold text-[11px] leading-tight">
                                          <span>{empShift.saturdayStart}–{empShift.saturdayEnd}</span>
                                          <span className="text-[9px] font-black tracking-wider text-red-800">
                                            {satTag.label}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="inline-block px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-800 font-medium text-[11px] transition-colors">
                                          {empShift.saturdayStart}–{empShift.saturdayEnd}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td
                                    className={`py-2 px-1.5 text-center ${
                                      isSelectedStartDay(week.datesByDow[0])
                                        ? 'bg-emerald-50/70'
                                        : isDayBeforeStart(week.datesByDow[0])
                                        ? 'opacity-35'
                                        : ''
                                    }`}
                                  >
                                    <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200">
                                      DSR
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-industrial-bg border-t border-industrial-border font-semibold text-[11px]">
                              <td colSpan={hasGroupDistinction ? 3 : 2} className="py-2.5 px-4 text-industrial-muted">
                                Cobertura Diária (Presentes)
                              </td>
                              {ALL_OFF_DAYS.map((d) => {
                                const totalOff = activeEmployeesForMonth.filter(
                                  (e) =>
                                    assign.offDayByEmployee[e.id] === d ||
                                    (d === 6 && e.offMode === 'mon_fri')
                                ).length;
                                const totalPresent = activeEmployeesForMonth.length - totalOff;
                                return (
                                  <td key={d} className="py-2 px-1 text-center">
                                    <div className="text-industrial-text">
                                      {totalPresent}/{activeEmployeesForMonth.length}
                                    </div>
                                    {hasGroupDistinction && (
                                      <div className="text-[10px] text-industrial-muted font-normal">
                                        {activeDistinctGroups
                                          .map((grp) => {
                                            const grpEmps = activeEmployeesForMonth.filter((e) => e.group === grp);
                                            const grpOff = grpEmps.filter(
                                              (e) =>
                                                assign.offDayByEmployee[e.id] === d ||
                                                (d === 6 && e.offMode === 'mon_fri')
                                            ).length;
                                            return `${grp}:${grpEmps.length - grpOff}`;
                                          })
                                          .join(' • ')}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-2 px-1 text-center text-amber-700">DSR Geral</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* SUB-ABA 2: CONDIÇÕES INDIVIDUAIS & COLETIVAS */}
      {subTab === 'conditions' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                  <Users size={18} className="text-cyber-emerald" />
                  Condições Individuais por Colaborador
                </h3>
                <p className="text-xs text-industrial-muted mt-0.5">
                  Altere nome, grupo, modo (5x2, Seg–Sex ou 6x1), carga, perfil de turno, dias permitidos e alternância direto na tabela.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!loggedAdmin.company_id && companies.length > 0 && (
                  <select
                    value={effectiveCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-industrial-border text-xs font-medium bg-industrial-bg outline-none focus:border-cyber-emerald"
                  >
                    <option value="">Todas as Empresas</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="Filtrar colaborador..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-industrial-border text-xs bg-industrial-bg outline-none focus:border-cyber-emerald"
                />
                {groups.length > 1 && (
                  <div className="flex bg-industrial-bg p-1 rounded-lg border border-industrial-border text-[11px] font-semibold">
                    {(['ALL', ...groups] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGroupFilter(g)}
                        className={`px-2.5 py-1 rounded-md transition-all ${
                          groupFilter === g
                            ? 'bg-white text-cyber-emerald shadow-sm'
                            : 'text-industrial-muted hover:text-industrial-text'
                        }`}
                      >
                        {g === 'ALL' ? 'Todos' : g}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleApplyUltralabPreset}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 flex items-center gap-1.5"
                  title="Aplica horários 07:00–17:24 (Int. 12:00–13:30) e Sáb 07:00–12:00 (Int. 15min)"
                >
                  <Sparkles size={13} /> Padrão ULTRALAB
                </button>
                <button
                  type="button"
                  onClick={handleSyncCompanyEmployees}
                  className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5"
                >
                  <RefreshCw size={13} /> Sincronizar Cadastro
                </button>
                <button
                  type="button"
                  onClick={handleExportConfigJSON}
                  className="px-2.5 py-1.5 rounded-lg border border-industrial-border text-xs font-semibold text-industrial-text hover:border-cyber-emerald flex items-center gap-1"
                  title="Salvar cópia de segurança de todas as regras em arquivo JSON"
                >
                  <Download size={13} /> Backup
                </button>
                <input
                  ref={fileImportRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportConfigJSON}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileImportRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg border border-industrial-border text-xs font-semibold text-industrial-text hover:border-cyber-emerald flex items-center gap-1"
                  title="Importar regras de um arquivo de backup JSON"
                >
                  <Upload size={13} /> Importar
                </button>
                <button
                  type="button"
                  onClick={handleRestoreDefaults}
                  className="px-3 py-1.5 rounded-lg border border-industrial-border text-xs font-semibold text-industrial-muted hover:text-industrial-text flex items-center gap-1.5"
                >
                  <RotateCcw size={13} /> Restaurar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-industrial-border text-industrial-muted bg-industrial-bg">
                    <th className="text-left py-2.5 px-3 font-semibold">Colaborador</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Grupo</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Modo</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Carga Horária</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Perfil de Turno</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Dias Permitidos (Seg–Sáb)</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Alternar</th>
                    <th className="text-left py-2.5 px-3 font-semibold">Observação</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border/60">
                  {employees
                    .filter((emp) => groupFilter === 'ALL' || emp.group === groupFilter)
                    .filter(
                      (emp) =>
                        !empSearch ||
                        emp.name.toLowerCase().includes(empSearch.toLowerCase()) ||
                        (emp.note || '').toLowerCase().includes(empSearch.toLowerCase())
                    )
                    .map((emp) => {
                      const workloadSelectValue =
                        emp.workloadSource === 'custom_shift'
                          ? 'custom_shift'
                          : emp.workloadSource === 'cadastro'
                          ? 'cadastro'
                          : emp.workloadSource === 'custom'
                          ? [44, 42, 40, 36].includes(emp.customWeeklyHours || 0)
                            ? `custom:${emp.customWeeklyHours}`
                            : 'custom:other'
                          : 'policy';
                      const grpCfg = groupConfigs.find((gc) => gc.id === emp.group);
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={emp.name}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEmployees((prev) =>
                                  prev.map((it) => (it.id === emp.id ? { ...it, name: v } : it))
                                );
                              }}
                              className="w-32 px-1.5 py-1 rounded border border-transparent hover:border-industrial-border focus:border-cyber-emerald bg-transparent focus:bg-white font-bold text-industrial-text outline-none"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <select
                              value={emp.group}
                              onChange={(e) => changeEmployeeGroup(emp.id, e.target.value as GroupId)}
                              className="px-2 py-1 rounded-md border border-industrial-border bg-white font-semibold text-xs outline-none"
                            >
                              {groups.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <select
                              value={emp.offMode || '5x2'}
                              onChange={(e) => {
                                const val = e.target.value as EmployeeOffMode;
                                setEmployees((prev) =>
                                  prev.map((it) => (it.id === emp.id ? { ...it, offMode: val } : it))
                                );
                              }}
                              className="px-2 py-1 rounded-md border border-industrial-border bg-white font-medium text-[11px] outline-none"
                            >
                              <option value="5x2">5x2 (Folga Rodízio/Fixa)</option>
                              <option value="mon_fri">Seg–Sex (Sáb+Dom Livres)</option>
                              <option value="6x1">6x1 (Só Dom DSR)</option>
                            </select>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <select
                                value={workloadSelectValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'custom:other') {
                                    updateEmployeeWorkload(
                                      emp.id,
                                      `custom:${emp.customWeeklyHours || 30}`
                                    );
                                  } else {
                                    updateEmployeeWorkload(emp.id, val);
                                  }
                                }}
                                className="px-2 py-1 rounded-md border border-industrial-border bg-white font-medium text-[11px] outline-none"
                              >
                                <option value="policy">Padrão Escala (MTE)</option>
                                <option value="cadastro">
                                  Aba Funcionários ({emp.registeredShift?.weeklyHours || 44}h)
                                </option>
                                <option value="custom_shift">Batidas Individuais</option>
                                <option value="custom:44">Fixo 44h</option>
                                <option value="custom:42">Fixo 42h</option>
                                <option value="custom:40">Fixo 40h</option>
                                <option value="custom:36">Fixo 36h</option>
                                <option value="custom:other">Outra (h/sem)...</option>
                              </select>
                              {emp.workloadSource === 'custom' &&
                                ![44, 42, 40, 36].includes(emp.customWeeklyHours || 0) && (
                                  <input
                                    type="number"
                                    min={1}
                                    max={48}
                                    value={emp.customWeeklyHours || 30}
                                    onChange={(e) =>
                                      updateEmployeeWorkload(emp.id, `custom:${e.target.value}`)
                                    }
                                    className="w-12 px-1.5 py-1 rounded-md border border-cyber-emerald text-[11px] text-center font-bold outline-none"
                                  />
                                )}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <select
                              value={emp.shiftProfile || 'group'}
                              onChange={(e) => {
                                const val = e.target.value as ShiftProfileId;
                                setEmployees((prev) =>
                                  prev.map((item) =>
                                    item.id === emp.id ? { ...item, shiftProfile: val } : item
                                  )
                                );
                              }}
                              className="px-2 py-1 rounded-md border border-industrial-border bg-white font-medium text-[11px] outline-none max-w-[180px]"
                            >
                              <option value="group">
                                Padrão Grupo {emp.group} ({grpCfg?.shift42h.workStart || '07:00'})
                              </option>
                              {shiftProfiles.map((sp) => (
                                <option key={sp.id} value={sp.id}>
                                  {sp.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            {emp.offMode && emp.offMode !== '5x2' ? (
                              <div className="text-center text-[11px] font-semibold text-industrial-muted">
                                {emp.offMode === 'mon_fri' ? 'Sábado + Domingo' : 'Apenas Domingo (DSR)'}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                {ALL_OFF_DAYS.map((day) => {
                                  const active = emp.allowedDays.includes(day);
                                  return (
                                    <button
                                      key={day}
                                      type="button"
                                      onClick={() => toggleAllowedDay(emp.id, day)}
                                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all border ${
                                        active
                                          ? 'bg-cyber-emerald text-white border-cyber-emerald'
                                          : 'bg-white text-industrial-muted border-industrial-border hover:border-slate-400'
                                      }`}
                                    >
                                      {WEEKDAY_SHORT[day]}
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEmployees((prev) =>
                                      prev.map((item) =>
                                        item.id === emp.id
                                          ? {
                                              ...item,
                                              allowedDays: [6],
                                              alternateDays: false,
                                              note: 'Somente folga ao Sábado',
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${
                                    emp.allowedDays.length === 1 && emp.allowedDays[0] === 6
                                      ? 'bg-amber-500 text-white border-amber-500'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                  }`}
                                >
                                  Só Sáb
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={emp.alternateDays}
                              onChange={() => toggleAlternateDays(emp.id)}
                              disabled={(emp.offMode && emp.offMode !== '5x2') || emp.allowedDays.length < 2}
                              className="w-4 h-4 accent-emerald-500 cursor-pointer"
                              title="Alternar obrigatoriamente entre os dias permitidos em semanas consecutivas"
                            />
                          </td>
                          <td className="py-2 px-3 text-industrial-muted max-w-xs">
                            <input
                              type="text"
                              value={emp.note || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEmployees((prev) =>
                                  prev.map((item) =>
                                    item.id === emp.id ? { ...item, note: val } : item
                                  )
                                );
                              }}
                              placeholder="Observação / Regra"
                              className="w-full px-2 py-1 rounded-md border border-transparent hover:border-industrial-border focus:border-cyber-emerald bg-transparent focus:bg-white text-[11px] text-industrial-text outline-none"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveEmployee(emp.id)}
                              className="text-industrial-muted hover:text-red-500 p-1"
                              title="Remover colaborador da escala"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Aplicar Regra Individual Rápida */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!indRuleEmpId || (indRuleOffMode === '5x2' && indRuleDays.length === 0)) {
                  alert('Selecione um colaborador e pelo menos 1 dia permitido.');
                  return;
                }
                setEmployees((prev) =>
                  prev.map((emp) =>
                    emp.id === indRuleEmpId
                      ? {
                          ...emp,
                          group: indRuleGroup,
                          offMode: indRuleOffMode,
                          shiftProfile: indRuleProfile,
                          allowedDays: [...indRuleDays].sort((a, b) => a - b) as Weekday[],
                          alternateDays: indRuleAlternate && indRuleDays.length >= 2,
                          note: indRuleNote.trim() || emp.note,
                        }
                      : emp
                  )
                );
                setIndRuleNote('');
              }}
              className="p-4 rounded-xl bg-industrial-bg border border-industrial-border space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-industrial-text">
                  Configurar Regra Individual Rápida
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIndRuleOffMode('5x2');
                      setIndRuleDays([6]);
                      setIndRuleAlternate(false);
                      setIndRuleNote('Somente folga ao Sábado');
                    }}
                    className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold hover:bg-amber-100"
                  >
                    Preset: Só Sábado
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIndRuleOffMode('5x2');
                      setIndRuleDays([1, 2, 3, 4, 5]);
                      setIndRuleAlternate(false);
                    }}
                    className="px-2 py-1 rounded-md bg-white text-industrial-text border border-industrial-border text-[10px] font-semibold hover:border-cyber-emerald"
                  >
                    Preset: Seg–Sex (Rodízio)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIndRuleOffMode('5x2');
                      setIndRuleDays([2, 5]);
                      setIndRuleAlternate(true);
                    }}
                    className="px-2 py-1 rounded-md bg-white text-industrial-text border border-industrial-border text-[10px] font-semibold hover:border-cyber-emerald"
                  >
                    Preset: Ter/Sex (Alterna)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIndRuleOffMode('mon_fri');
                      setIndRuleNote('Administrativo Seg–Sex (Sáb+Dom livres)');
                    }}
                    className="px-2 py-1 rounded-md bg-white text-industrial-text border border-industrial-border text-[10px] font-semibold hover:border-cyber-emerald"
                  >
                    Preset: Seg–Sex Fixo (Sáb Livre)
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={indRuleEmpId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setIndRuleEmpId(id);
                    const found = employees.find((emp) => emp.id === id);
                    if (found) {
                      setIndRuleGroup(found.group);
                      setIndRuleOffMode(found.offMode || '5x2');
                      setIndRuleProfile(found.shiftProfile || 'group');
                      setIndRuleDays(found.allowedDays);
                      setIndRuleAlternate(found.alternateDays);
                    }
                  }}
                  className="px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald min-w-[170px]"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.group})
                    </option>
                  ))}
                </select>

                <select
                  value={indRuleGroup}
                  onChange={(e) => setIndRuleGroup(e.target.value as GroupId)}
                  className="px-2.5 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none"
                >
                  {groups.map((g) => (
                    <option key={g} value={g}>Grupo {g}</option>
                  ))}
                </select>

                <select
                  value={indRuleOffMode}
                  onChange={(e) => setIndRuleOffMode(e.target.value as EmployeeOffMode)}
                  className="px-2.5 py-2 rounded-lg border border-industrial-border bg-white text-xs font-medium outline-none"
                >
                  <option value="5x2">5x2 (Folga Semanal)</option>
                  <option value="mon_fri">Seg–Sex (Sáb Livre)</option>
                  <option value="6x1">6x1 (Só Dom DSR)</option>
                </select>

                <select
                  value={indRuleProfile}
                  onChange={(e) => setIndRuleProfile(e.target.value as ShiftProfileId)}
                  className="px-2.5 py-2 rounded-lg border border-industrial-border bg-white text-xs font-medium outline-none"
                >
                  <option value="group">Horário Padrão do Grupo</option>
                  {shiftProfiles.map((sp) => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
                </select>

                {indRuleOffMode === '5x2' && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {ALL_OFF_DAYS.map((day) => {
                      const active = indRuleDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setIndRuleDays((prev) => {
                              if (prev.includes(day)) {
                                return prev.length === 1 ? prev : prev.filter((d) => d !== day);
                              }
                              return [...prev, day].sort((a, b) => a - b) as Weekday[];
                            });
                          }}
                          className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all border ${
                            active
                              ? 'bg-cyber-emerald text-white border-cyber-emerald'
                              : 'bg-white text-industrial-muted border-industrial-border hover:border-slate-400'
                          }`}
                        >
                          {WEEKDAY_SHORT[day]}
                        </button>
                      );
                    })}
                  </div>
                )}

                <label className="flex items-center gap-1.5 text-xs font-medium text-industrial-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indRuleAlternate}
                    onChange={(e) => setIndRuleAlternate(e.target.checked)}
                    disabled={indRuleOffMode !== '5x2' || indRuleDays.length < 2}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  Alternar semanas
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Descrição opcional da regra individual..."
                  value={indRuleNote}
                  onChange={(e) => setIndRuleNote(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs outline-none focus:border-cyber-emerald flex-1 min-w-[220px]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyber-emerald text-white text-xs font-bold flex items-center gap-1.5 hover:bg-opacity-90"
                >
                  <CheckCircle2 size={14} /> Aplicar Regra Individual
                </button>
              </div>
            </form>

            {/* Adicionar colaborador (do banco ou manual) */}
            <form
              onSubmit={handleAddEmployee}
              className="pt-3 border-t border-industrial-border flex flex-wrap items-center gap-2"
            >
              {companyDbEmployees.length > 0 && (
                <select
                  value={newEmpDbId}
                  onChange={(e) => {
                    setNewEmpDbId(e.target.value);
                    if (e.target.value) setNewEmpName('');
                  }}
                  className="px-3 py-2 rounded-lg border border-industrial-border text-xs bg-white outline-none focus:border-cyber-emerald min-w-[220px]"
                >
                  <option value="">Escolher do cadastro (opcional)...</option>
                  {companyDbEmployees
                    .filter((dbE) => !employees.some((e) => e.id === dbE.id))
                    .map((dbE) => (
                      <option key={dbE.id} value={dbE.id}>
                        {dbE.name} ({dbE.role})
                      </option>
                    ))}
                </select>
              )}
              <input
                type="text"
                placeholder="Ou digite o nome de um novo colaborador..."
                value={newEmpName}
                onChange={(e) => {
                  setNewEmpName(e.target.value);
                  if (e.target.value) setNewEmpDbId('');
                }}
                className="px-3 py-2 rounded-lg border border-industrial-border text-xs outline-none focus:border-cyber-emerald flex-1 min-w-[200px]"
              />
              <select
                value={newEmpGroup}
                onChange={(e) => setNewEmpGroup(e.target.value as GroupId)}
                className="px-3 py-2 rounded-lg border border-industrial-border text-xs font-semibold bg-white outline-none"
              >
                {groups.map((g) => (
                  <option key={g} value={g}>Grupo {g}</option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyber-emerald text-white text-xs font-bold flex items-center gap-1.5 hover:bg-opacity-90"
              >
                <Plus size={14} /> Adicionar Colaborador
              </button>
            </form>
          </div>

          {/* Condições Coletivas */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-4">
            <div>
              <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                <Lock size={18} className="text-cyber-emerald" />
                Condições Coletivas (Exclusão Mútua, Duplas Conjuntas e Limite por Dia)
              </h3>
              <p className="text-xs text-industrial-muted mt-0.5">
                Crie ou edite qualquer regra entre colaboradores ou limites máximos de folgas em dias específicos (ex: Sábado, Sexta).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rules.map((rule) => {
                const rType = rule.type || 'max_simultaneous';
                return (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                      editingRuleId === rule.id
                        ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-100'
                        : rule.enabled
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-industrial-border bg-slate-50 opacity-60'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-industrial-border text-industrial-muted">
                          {rType === 'same_day'
                            ? 'Folgar Juntos'
                            : rType === 'min_present'
                            ? 'Mínimo Presentes'
                            : rType === 'day_cap'
                            ? 'Limite no Dia'
                            : 'Exclusão / Máx Juntos'}
                        </span>
                        <span className="font-bold text-xs text-industrial-text">{rule.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {rule.employeeIds.length === 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-white border border-industrial-border text-[10px] font-semibold text-industrial-muted">
                            Toda a equipe
                          </span>
                        ) : (
                          rule.employeeIds.map((id) => {
                            const emp = employees.find((e) => e.id === id);
                            return (
                              <span
                                key={id}
                                className="px-2 py-0.5 rounded-full bg-white border border-industrial-border text-[10px] font-semibold text-industrial-text"
                              >
                                {emp ? emp.name : id}
                              </span>
                            );
                          })
                        )}
                      </div>
                      <div className="text-[11px] text-industrial-muted">
                        {rType === 'same_day' ? (
                          <span>Sempre alocados no mesmo dia de folga</span>
                        ) : rType === 'min_present' ? (
                          <span>
                            Mínimo trabalhando no dia: <strong>{rule.minPresent ?? 1}</strong> de{' '}
                            {rule.employeeIds.length > 0 ? rule.employeeIds.length : employees.length}
                          </span>
                        ) : (
                          <span>
                            Máximo de folgas: <strong>{rule.maxOffSameDay}</strong>
                          </span>
                        )}
                        {rule.applyToDays && rule.applyToDays.length > 0 && (
                          <span>
                            {' '}• Dias:{' '}
                            <strong>{rule.applyToDays.map((d) => WEEKDAY_SHORT[d]).join(', ')}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => toggleRuleEnabled(rule.id)}
                        className="w-4 h-4 accent-emerald-500 cursor-pointer"
                        title="Ativar / desativar regra"
                      />
                      <button
                        type="button"
                        onClick={() => handleStartEditRule(rule)}
                        className="text-industrial-muted hover:text-corporate-blue p-1"
                        title="Editar regra coletiva"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-industrial-muted hover:text-red-500 p-1"
                        title="Excluir regra coletiva"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Form Nova / Editar Regra Coletiva */}
            <form
              onSubmit={handleSaveCollectiveRule}
              className="p-4 rounded-xl bg-industrial-bg border border-industrial-border space-y-3"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs font-bold text-industrial-text">
                  {editingRuleId ? 'Editando Regra Coletiva' : '1. Escolha o tipo de regra (clique para selecionar):'}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'max_simultaneous', label: 'Não folgam juntos', desc: 'Máx. X no mesmo dia' },
                    { id: 'same_day', label: 'Folgam juntos', desc: 'Mesmo dia de folga' },
                    { id: 'min_present', label: 'Mínimo presentes', desc: 'Garante equipe mínima' },
                    { id: 'day_cap', label: 'Limite no dia', desc: 'Máx. folgas em um dia' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNewRuleType(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      newRuleType === opt.id
                        ? 'bg-cyber-emerald text-white border-cyber-emerald shadow-sm'
                        : 'bg-white text-industrial-text border-industrial-border hover:border-cyber-emerald'
                    }`}
                  >
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div
                      className={`text-[10px] ${
                        newRuleType === opt.id ? 'text-white/90' : 'text-industrial-muted'
                      }`}
                    >
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <div className="text-[11px] font-semibold text-industrial-muted mb-1.5">
                  {newRuleType === 'day_cap' || newRuleType === 'min_present'
                    ? 'Colaboradores abrangidos (deixe sem marcar para valer para toda a equipe):'
                    : 'Selecione os colaboradores (mínimo 2):'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {employees.map((emp) => {
                    const selected = newRuleEmpIds.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => toggleNewRuleEmployee(emp.id)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                          selected
                            ? 'bg-cyber-emerald text-white border-cyber-emerald'
                            : 'bg-white text-industrial-text border-industrial-border hover:border-cyber-emerald'
                        }`}
                      >
                        {emp.name} ({emp.group})
                      </button>
                    );
                  })}
                </div>
              </div>

              {newRuleType !== 'same_day' && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[11px] font-semibold text-industrial-muted">
                    Aplicar nos dias (vazio = Seg a Sáb):
                  </span>
                  <div className="flex gap-1 flex-wrap">
                    {ALL_OFF_DAYS.map((d) => {
                      const active = newRuleDays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleNewRuleDay(d)}
                          className={`px-2 py-1 rounded-md text-[11px] font-bold border ${
                            active
                              ? 'bg-corporate-blue text-white border-corporate-blue'
                              : 'bg-white text-industrial-muted border-industrial-border'
                          }`}
                        >
                          {WEEKDAY_SHORT[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Descrição opcional da regra..."
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs outline-none focus:border-cyber-emerald flex-1 min-w-[220px]"
                />
                {newRuleType === 'min_present' && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-industrial-muted">Mín. presentes no dia:</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, newRuleEmpIds.length > 0 ? newRuleEmpIds.length : employees.length)}
                      value={newRuleMinPresent}
                      onChange={(e) => setNewRuleMinPresent(Math.max(1, Number(e.target.value) || 1))}
                      className="w-16 px-2 py-2 rounded-lg border border-cyber-emerald bg-white text-xs font-bold outline-none"
                    />
                    <span className="text-industrial-muted">
                      de {newRuleEmpIds.length > 0 ? newRuleEmpIds.length : employees.length}
                    </span>
                  </div>
                )}
                {newRuleType !== 'same_day' && newRuleType !== 'min_present' && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-industrial-muted">Máx. folgas no dia:</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={newRuleMaxOff}
                      onChange={(e) => setNewRuleMaxOff(Math.max(0, Number(e.target.value)))}
                      className="w-16 px-2 py-2 rounded-lg border border-industrial-border bg-white text-xs font-bold outline-none"
                    />
                  </div>
                )}
                {editingRuleId && (
                  <button
                    type="button"
                    onClick={resetRuleForm}
                    className="px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold text-industrial-muted hover:text-industrial-text"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyber-emerald text-white text-xs font-bold flex items-center gap-1.5 hover:bg-opacity-90"
                >
                  <Plus size={14} /> {editingRuleId ? 'Salvar Alterações' : 'Criar Regra'}
                </button>
              </div>
            </form>
          </div>

          {/* Férias de Funcionários */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                <Calendar size={18} className="text-cyber-emerald" />
                Férias de Funcionários
              </h3>
              <span className="text-xs text-industrial-muted">
                Funcionários de férias são excluídos automaticamente do cálculo e da escala no mês selecionado
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const targetEmpId = vacEmpId || employees[0]?.id;
                if (!targetEmpId) return;
                const alreadyExists = vacations.some(
                  (v) => v.employeeId === targetEmpId && v.month === vacMonth && v.year === vacYear
                );
                if (alreadyExists) {
                  alert('Este colaborador já possui férias cadastradas para este mês/ano.');
                  return;
                }
                setVacations((prev) => [
                  ...prev,
                  {
                    id: `vac-${Date.now()}`,
                    employeeId: targetEmpId,
                    month: vacMonth,
                    year: vacYear,
                  },
                ]);
              }}
              className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Funcionário
                </label>
                <select
                  value={vacEmpId}
                  onChange={(e) => setVacEmpId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (Grupo {emp.group})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Mês
                </label>
                <select
                  value={vacMonth}
                  onChange={(e) => setVacMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Ano
                </label>
                <input
                  type="number"
                  min={2024}
                  max={2040}
                  value={vacYear}
                  onChange={(e) => setVacYear(Number(e.target.value) || now.getFullYear())}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyber-emerald text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-opacity-90 h-[34px]"
              >
                <Plus size={14} /> Adicionar Férias
              </button>
            </form>

            {vacations.length > 0 && (
              <div className="overflow-x-auto border border-industrial-border rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-industrial-bg border-b border-industrial-border text-industrial-muted">
                      <th className="text-left py-2.5 px-4 font-semibold">Funcionário</th>
                      <th className="text-center py-2.5 px-4 font-semibold">Mês/Ano</th>
                      <th className="text-right py-2.5 px-4 font-semibold">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-border/60">
                    {vacations.map((vac) => {
                      const emp = employees.find((e) => e.id === vac.employeeId);
                      return (
                        <tr key={vac.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-bold text-industrial-text">
                            {emp ? emp.name : vac.employeeId}
                          </td>
                          <td className="py-2.5 px-4 text-center font-medium text-industrial-text">
                            {MONTH_NAMES[vac.month]}/{vac.year}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setVacations((prev) => prev.filter((item) => item.id !== vac.id))
                              }
                              className="text-red-600 hover:underline font-semibold"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-ABA 3: GRUPOS, TURNOS & BATIDAS INDIVIDUAIS */}
      {subTab === 'shifts' && (
        <div className="space-y-6">
          {/* 1. Gerenciamento de Grupos e Horários de cada Grupo */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                  <Building2 size={18} className="text-cyber-emerald" />
                  Grupos / Setores e Horários Padrão de Cada Grupo
                </h3>
                <p className="text-xs text-industrial-muted mt-0.5">
                  Crie ou renomeie grupos livremente e defina os horários de Seg–Sex, Sábado e cobertura mínima de cada grupo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Novo grupo (ex: C, RECEPÇÃO)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value.toUpperCase())}
                  maxLength={16}
                  className="px-3 py-1.5 rounded-lg border border-industrial-border bg-industrial-bg text-xs font-semibold outline-none focus:border-cyber-emerald"
                />
                <button
                  type="button"
                  onClick={handleAddGroup}
                  disabled={!newGroupName.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-cyber-emerald text-white text-xs font-bold hover:bg-opacity-90 disabled:opacity-50"
                >
                  + Criar Grupo
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <div
                  key={g}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                    selectedGroupForHours === g
                      ? 'border-cyber-emerald bg-emerald-50/70 shadow-xs'
                      : 'border-industrial-border bg-industrial-bg/40'
                  }`}
                >
                  {editingGroup === g ? (
                    <>
                      <input
                        type="text"
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value.toUpperCase())}
                        maxLength={16}
                        className="px-2 py-1 rounded border border-cyber-emerald bg-white text-xs font-bold w-24 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleEditGroup(g, editGroupName)}
                        className="text-xs font-bold text-emerald-700"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroup(null)}
                        className="text-xs text-industrial-muted"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedGroupForHours(g)}
                        className="text-xs font-bold text-industrial-text"
                      >
                        Grupo {g} ({employees.filter((e) => e.group === g).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGroup(g);
                          setEditGroupName(g);
                        }}
                        className="text-industrial-muted hover:text-corporate-blue"
                        title="Renomear grupo"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(g)}
                        className="text-industrial-muted hover:text-red-500"
                        title="Excluir grupo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Editor de Horários do Grupo Selecionado */}
            <div className="p-4 rounded-xl bg-industrial-bg border border-industrial-border space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-sm text-industrial-text">
                  Horários do Grupo {selectedGroupForHours}
                </h4>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-industrial-muted font-medium">Mínimo de presentes por dia neste grupo:</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={selectedGroupConfig.minDailyPresent ?? 1}
                    onChange={(e) =>
                      updateGroupMinPresent(selectedGroupForHours, Number(e.target.value) || 0)
                    }
                    className="w-16 px-2 py-1 rounded-lg border border-industrial-border bg-white font-bold text-center outline-none"
                  />
                </div>
              </div>

              {(
                [
                  { key: 'shift42h', title: 'Vigência 42h Semanais (Seg–Sex + Sábado)' },
                  { key: 'saturdayOff42h', title: 'Vigência 42h — Quando Folga no Sábado (Seg–Sex)' },
                  { key: 'shift44h', title: 'Vigência 44h Semanais (Seg–Sex + Sábado)' },
                  { key: 'shift40h', title: 'Vigência 40h Semanais (Seg–Sex)' },
                ] as const
              ).map(({ key, title }) => {
                const st =
                  (selectedGroupConfig[key] as ShiftTemplate) ||
                  createDefaultGroupConfig(selectedGroupForHours).shift42h;
                const hideSat = key === 'saturdayOff42h' || key === 'shift40h';
                return (
                  <div key={key} className="bg-white p-3.5 rounded-xl border border-industrial-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-industrial-text">{title}</span>
                      <span className="text-[11px] text-emerald-700 font-semibold">
                        Seg–Sex: {st.dailyHoursLabel}/dia {!hideSat && `• Sáb: ${st.saturdayHoursLabel}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs">
                      <div>
                        <label className="block text-[10px] text-industrial-muted font-semibold mb-0.5">Entrada</label>
                        <input
                          type="time"
                          value={st.workStart}
                          onChange={(e) =>
                            updateGroupShiftField(selectedGroupForHours, key, 'workStart', e.target.value)
                          }
                          className="w-full px-2 py-1.5 rounded border border-industrial-border font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-industrial-muted font-semibold mb-0.5">Saída Almoço</label>
                        <input
                          type="time"
                          value={st.breakStart !== '-' ? st.breakStart : ''}
                          onChange={(e) =>
                            updateGroupShiftField(selectedGroupForHours, key, 'breakStart', e.target.value)
                          }
                          className="w-full px-2 py-1.5 rounded border border-industrial-border font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-industrial-muted font-semibold mb-0.5">Volta Almoço</label>
                        <input
                          type="time"
                          value={st.breakEnd !== '-' ? st.breakEnd : ''}
                          onChange={(e) =>
                            updateGroupShiftField(selectedGroupForHours, key, 'breakEnd', e.target.value)
                          }
                          className="w-full px-2 py-1.5 rounded border border-industrial-border font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-industrial-muted font-semibold mb-0.5">Saída</label>
                        <input
                          type="time"
                          value={st.workEnd}
                          onChange={(e) =>
                            updateGroupShiftField(selectedGroupForHours, key, 'workEnd', e.target.value)
                          }
                          className="w-full px-2 py-1.5 rounded border border-industrial-border font-medium"
                        />
                      </div>
                      {!hideSat && (
                        <>
                          <div>
                            <label className="block text-[10px] text-industrial-muted font-semibold mb-0.5">Sáb Entrada</label>
                            <input
                              type="time"
                              value={st.saturdayStart}
                              onChange={(e) =>
                                updateGroupShiftField(selectedGroupForHours, key, 'saturdayStart', e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded border border-industrial-border font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-industrial-muted font-semibold mb-0.5">Sáb Saída</label>
                            <input
                              type="time"
                              value={st.saturdayEnd}
                              onChange={(e) =>
                                updateGroupShiftField(selectedGroupForHours, key, 'saturdayEnd', e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded border border-industrial-border font-medium"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Perfis de Turno Reutilizáveis */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-4">
            <div>
              <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                <Clock size={18} className="text-cyber-emerald" />
                Perfis de Turno Personalizados
              </h3>
              <p className="text-xs text-industrial-muted mt-0.5">
                Crie ou edite turnos diferenciados (ex: almoço das 11h às 12h, saída às 17h, sábado até 13h) e atribua a qualquer colaborador.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {shiftProfiles.map((sp) => (
                <div
                  key={sp.id}
                  className="p-3.5 rounded-xl border border-industrial-border bg-industrial-bg/30 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-bold text-xs text-industrial-text">{sp.name}</p>
                    <p className="text-[11px] text-industrial-muted mt-0.5">
                      Seg–Sex: {sp.shift.workStart}–{sp.shift.workEnd} (Int. {sp.shift.breakStart}–{sp.shift.breakEnd}) • Sáb: {sp.shift.saturdayStart}–{sp.shift.saturdayEnd}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleEditShiftProfile(sp)}
                      className="p-1.5 text-industrial-muted hover:text-corporate-blue"
                      title="Editar perfil"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteShiftProfile(sp.id)}
                      className="p-1.5 text-industrial-muted hover:text-red-500"
                      title="Excluir perfil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleSaveShiftProfile}
              className="p-4 rounded-xl bg-industrial-bg border border-industrial-border space-y-3"
            >
              <div className="text-xs font-bold text-industrial-text">
                {editingProfileId ? 'Editando Perfil de Turno' : 'Novo Perfil de Turno'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5 text-xs items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] font-semibold text-industrial-muted mb-0.5">Nome</label>
                  <input
                    type="text"
                    placeholder="Ex: Turno 11h"
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-industrial-border bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-industrial-muted mb-0.5">Entrada</label>
                  <input type="time" value={profWs} onChange={(e) => setProfWs(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-industrial-border bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-industrial-muted mb-0.5">Int. Início</label>
                  <input type="time" value={profBs} onChange={(e) => setProfBs(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-industrial-border bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-industrial-muted mb-0.5">Int. Fim</label>
                  <input type="time" value={profBe} onChange={(e) => setProfBe(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-industrial-border bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-industrial-muted mb-0.5">Saída</label>
                  <input type="time" value={profWe} onChange={(e) => setProfWe(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-industrial-border bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-industrial-muted mb-0.5">Sáb Início</label>
                  <input type="time" value={profSatStart} onChange={(e) => setProfSatStart(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-industrial-border bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-industrial-muted mb-0.5">Sáb Fim</label>
                  <input type="time" value={profSatEnd} onChange={(e) => setProfSatEnd(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-industrial-border bg-white" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {editingProfileId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProfileId(null);
                      setProfName('');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-industrial-border bg-white text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-cyber-emerald text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Save size={13} /> {editingProfileId ? 'Salvar Perfil' : 'Adicionar Perfil'}
                </button>
              </div>
            </form>
          </div>

          {/* 3. Batidas Individuais por Funcionário (Seg-Sex + Sábado) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                  <Clock size={18} className="text-cyber-emerald" />
                  Horário Individual Direto por Colaborador (Seg–Sex + Sábado)
                </h3>
                <p className="text-xs text-industrial-muted mt-0.5">
                  Alterar qualquer batida abaixo aplica imediatamente esse horário específico ao colaborador na Escala Mensal, PDF, CSV e Auditoria.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs divide-y divide-industrial-border/60">
                <thead>
                  <tr className="border-b border-industrial-border text-industrial-muted bg-industrial-bg">
                    <th className="text-left py-2.5 px-3 font-semibold">Colaborador</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Origem Atual</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Entrada</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Int. Início</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Int. Fim</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Saída</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Sáb Início</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Sáb Fim</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Padrão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border/50">
                  {employees.map((emp) => {
                    const effective = resolveShiftForEmployeeInWeek(
                      emp,
                      solverResult.assignments[0]?.legalMaxWeeklyHours || 42,
                      shift,
                      policy,
                      undefined,
                      solverOptions
                    );
                    const isCustom = emp.workloadSource === 'custom_shift';
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-semibold text-industrial-text">{emp.name}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isCustom
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isCustom ? `Individual (${effective.weeklyHours}h)` : `Automático (${effective.weeklyHours}h)`}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-center">
                          <input
                            type="time"
                            value={effective.workStart}
                            onChange={(e) => updateEmployeeCustomShiftField(emp.id, 'workStart', e.target.value)}
                            className="px-1.5 py-1 rounded border border-industrial-border text-xs"
                          />
                        </td>
                        <td className="py-2 px-1.5 text-center">
                          <input
                            type="time"
                            value={effective.breakStart !== '-' ? effective.breakStart : ''}
                            onChange={(e) => updateEmployeeCustomShiftField(emp.id, 'breakStart', e.target.value)}
                            className="px-1.5 py-1 rounded border border-industrial-border text-xs"
                          />
                        </td>
                        <td className="py-2 px-1.5 text-center">
                          <input
                            type="time"
                            value={effective.breakEnd !== '-' ? effective.breakEnd : ''}
                            onChange={(e) => updateEmployeeCustomShiftField(emp.id, 'breakEnd', e.target.value)}
                            className="px-1.5 py-1 rounded border border-industrial-border text-xs"
                          />
                        </td>
                        <td className="py-2 px-1.5 text-center">
                          <input
                            type="time"
                            value={effective.workEnd}
                            onChange={(e) => updateEmployeeCustomShiftField(emp.id, 'workEnd', e.target.value)}
                            className="px-1.5 py-1 rounded border border-industrial-border text-xs"
                          />
                        </td>
                        <td className="py-2 px-1.5 text-center">
                          <input
                            type="time"
                            value={effective.saturdayStart}
                            onChange={(e) => updateEmployeeCustomShiftField(emp.id, 'saturdayStart', e.target.value)}
                            className="px-1.5 py-1 rounded border border-industrial-border text-xs"
                          />
                        </td>
                        <td className="py-2 px-1.5 text-center">
                          <input
                            type="time"
                            value={effective.saturdayEnd}
                            onChange={(e) => updateEmployeeCustomShiftField(emp.id, 'saturdayEnd', e.target.value)}
                            className="px-1.5 py-1 rounded border border-industrial-border text-xs"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => updateEmployeeWorkload(emp.id, 'policy')}
                              className="text-[11px] text-corporate-blue hover:underline font-semibold"
                            >
                              Usar Grupo
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 4: AUDITORIA CLT & PORTARIA MTE 2.041/2026 */}
      {subTab === 'audit' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                  <Clock size={18} className="text-cyber-emerald" />
                  Parâmetros Legais (CLT & Portaria MTE nº 2.041/2026)
                </h3>
                <p className="text-xs text-industrial-muted mt-0.5">
                  Configure livremente datas de transição de jornada, limites semanais, intervalo intrajornada e descanso interjornada.
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setPolicy({ ...policy, phaseMode: 'auto', transition42Date: '2026-12-16' });
                  }}
                  className="px-2.5 py-1 rounded-lg border border-industrial-border text-[11px] font-semibold hover:border-cyber-emerald"
                >
                  Vigência Automática MTE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPolicy({ ...policy, phaseMode: '44h' });
                    setShift(SHIFT_44H);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-industrial-border text-[11px] font-semibold hover:border-cyber-emerald"
                >
                  Fixo 44h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPolicy({ ...policy, phaseMode: '42h' });
                    setShift(SHIFT_42H);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-industrial-border text-[11px] font-semibold hover:border-cyber-emerald"
                >
                  Fixo 42h
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPolicy({ ...policy, phaseMode: '40h' });
                    setShift(SHIFT_40H);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-industrial-border text-[11px] font-semibold hover:border-cyber-emerald"
                >
                  Fixo 40h
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 p-4 rounded-xl bg-industrial-bg border border-industrial-border">
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Regime de Vigência
                </label>
                <select
                  value={policy.phaseMode}
                  onChange={(e) =>
                    setPolicy({ ...policy, phaseMode: e.target.value as MteTransitionPhase })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald"
                >
                  <option value="auto">Automático por Data</option>
                  <option value="44h">Fixo 44h semanais</option>
                  <option value="42h">Fixo 42h semanais</option>
                  <option value="40h">Fixo 40h semanais</option>
                  <option value="custom">Teto Personalizado</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Início Vigência 42h
                </label>
                <input
                  type="date"
                  value={policy.transition42Date}
                  onChange={(e) => setPolicy({ ...policy, transition42Date: e.target.value })}
                  disabled={policy.phaseMode !== 'auto'}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-medium outline-none focus:border-cyber-emerald disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Início Vigência 40h (Opcional)
                </label>
                <input
                  type="date"
                  value={policy.transition40Date}
                  onChange={(e) => setPolicy({ ...policy, transition40Date: e.target.value })}
                  disabled={policy.phaseMode !== 'auto'}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-medium outline-none focus:border-cyber-emerald disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Intrajornada Mín. (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={policy.minIntrajornadaMinutes ?? 60}
                  onChange={(e) =>
                    setPolicy({ ...policy, minIntrajornadaMinutes: Math.max(0, Number(e.target.value)) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Interjornada Mín. (horas)
                </label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={policy.minInterjornadaHours ?? 11}
                  onChange={(e) =>
                    setPolicy({ ...policy, minInterjornadaHours: Math.max(0, Number(e.target.value)) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald"
                />
              </div>
            </div>
          </div>

          {/* Resultado da Auditoria */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                <ShieldCheck size={18} className="text-cyber-emerald" />
                Relatório de Auditoria Automática ({MONTH_NAMES[selectedMonth]}/{selectedYear})
              </h3>
              <span className="text-xs text-industrial-muted flex items-center gap-1">
                <ShieldCheck size={12} className="text-cyber-emerald" /> {employees.length} colaboradores auditados
              </span>
            </div>

            {solverResult.audits.length === 0 ? (
              <p className="text-xs text-red-600">
                Auditoria indisponível enquanto houver conflito insolúvel nas restrições.
              </p>
            ) : (
              <div className="space-y-3">
                {solverResult.audits.map((check) => (
                  <div
                    key={check.id}
                    className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
                      check.passed
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-red-200 bg-red-50/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-industrial-border text-industrial-muted">
                          {check.category}
                        </span>
                        <h4 className="font-bold text-xs text-industrial-text">{check.title}</h4>
                      </div>
                      <p className="text-xs text-industrial-muted mt-1">{check.details}</p>
                    </div>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        check.passed
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {check.passed ? 'APROVADO' : 'ALERTA'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
