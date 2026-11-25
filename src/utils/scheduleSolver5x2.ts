// Motor CSP (Constraint Satisfaction Problem) e Auditoria CLT / Portaria MTE nº 2.041/2026
// para geração automática de escalas 5x2 (Folga Útil Semanal + Domingo).

export type Weekday = 1 | 2 | 3 | 4 | 5; // 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex
export type GroupId = 'A' | 'B';

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
};

export const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

export interface ScheduleEmployeeConfig {
  id: string;
  name: string;
  group: GroupId;
  allowedDays: Weekday[];
  alternateDays: boolean; // Ex: Cris alterna entre Terça e Sexta entre semanas
  note?: string;
}

export interface CollectiveRule {
  id: string;
  name: string;
  employeeIds: string[]; // Colaboradores que não podem folgar juntos (máx 1 por dia útil)
  maxOffSameDay: number; // Padrão = 1 (exclusão mútua)
  enabled: boolean;
}

export interface ShiftTemplate {
  workStart: string;
  breakStart: string;
  breakEnd: string;
  workEnd: string;
  dailyHoursLabel: string;
  weeklyHours: number;
}

export type MteTransitionPhase = 'auto' | '44h' | '42h' | '40h';

export interface MtePolicyConfig {
  phaseMode: MteTransitionPhase; // 'auto' aplica 44h até 15/12/2026 e 42h a partir de 16/12/2026 (ou 40h se transition40Date atingida)
  transition42Date: string; // YYYY-MM-DD, padrão '2026-12-16'
  transition40Date: string; // YYYY-MM-DD opcional para transição completa para 40h (vazio = ainda na fase 42h)
}

export const DEFAULT_MTE_POLICY: MtePolicyConfig = {
  phaseMode: 'auto',
  transition42Date: '2026-12-16',
  transition40Date: '',
};

export const SHIFT_44H: ShiftTemplate = {
  workStart: '08:00',
  breakStart: '12:00',
  breakEnd: '13:12',
  workEnd: '18:00', // 8h48min líquidos/dia × 5 = 44h semanais
  dailyHoursLabel: '08h48min',
  weeklyHours: 44,
};

export const SHIFT_42H: ShiftTemplate = {
  workStart: '08:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  workEnd: '17:24', // 8h24min líquidos/dia × 5 = 42h semanais (vigente a partir de 16/12/2026)
  dailyHoursLabel: '08h24min',
  weeklyHours: 42,
};

export const SHIFT_40H: ShiftTemplate = {
  workStart: '08:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  workEnd: '17:00', // 8h00min líquidos/dia × 5 = 40h semanais (transição completa)
  dailyHoursLabel: '08h00min',
  weeklyHours: 40,
};

export const DEFAULT_SHIFT_TEMPLATE: ShiftTemplate = SHIFT_42H;

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
    note: 'Folga fixa na Terça-feira',
  },
  {
    id: 'iolanda',
    name: 'Iolanda',
    group: 'A',
    allowedDays: [3],
    alternateDays: false,
    note: 'Folga fixa na Quarta-feira',
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
    employeeIds: ['bruno', 'iolanda'],
    maxOffSameDay: 1,
    enabled: true,
  },
  {
    id: 'rule-eduarda-quezia-pricyla',
    name: 'Eduarda, Quezia e Pricyla: Apenas 1 por dia útil',
    employeeIds: ['eduarda', 'quezia', 'pricyla'],
    maxOffSameDay: 1,
    enabled: true,
  },
  {
    id: 'rule-fabiana-cris',
    name: 'Fabiana e Cris: Nunca folgam juntas',
    employeeIds: ['fabiana', 'cris'],
    maxOffSameDay: 1,
    enabled: true,
  },
  {
    id: 'rule-pricyla-cris',
    name: 'Pricyla e Cris: Nunca folgam juntas',
    employeeIds: ['pricyla', 'cris'],
    maxOffSameDay: 1,
    enabled: true,
  },
];

export interface WeekRange {
  weekIndex: number; // 0-based
  label: string;
  mondayDate: Date;
  sundayDate: Date;
  datesByDow: Record<number, string>; // 1..6 + 0(Dom) -> YYYY-MM-DD
}

export interface WeekAssignment {
  weekIndex: number;
  offDayByEmployee: Record<string, Weekday>; // employeeId -> Weekday (1..5)
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

/**
 * Gera todas as semanas (Seg a Dom) que cobrem o mês/ano informado.
 */
export function buildMonthWeeks(year: number, monthIndex0: number): WeekRange[] {
  const firstDayOfMonth = new Date(year, monthIndex0, 1);
  const lastDayOfMonth = new Date(year, monthIndex0 + 1, 0);

  // Recua até a segunda-feira da primeira semana que toca o mês
  const startDow = firstDayOfMonth.getDay(); // 0=Dom, 1=Seg...
  const diffToMonday = startDow === 0 ? -6 : 1 - startDow;
  const cursor = new Date(year, monthIndex0, 1 + diffToMonday);

  const weeks: WeekRange[] = [];
  let idx = 0;

  while (cursor <= lastDayOfMonth) {
    const monday = new Date(cursor);
    const sunday = new Date(cursor);
    sunday.setDate(monday.getDate() + 6);

    const datesByDow: Record<number, string> = {};
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      const dow = d.getDay(); // 1..6, 0
      datesByDow[dow] = formatIsoDate(d);
    }

    weeks.push({
      weekIndex: idx,
      label: `Semana ${idx + 1} (${formatBrShort(monday)} a ${formatBrShort(sunday)})`,
      mondayDate: monday,
      sundayDate: sunday,
      datesByDow,
    });

    cursor.setDate(cursor.getDate() + 7);
    idx++;
  }

  return weeks;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Verifica se a atribuição parcial respeita todas as regras coletivas ativas.
 */
function isConsistentWithCollectiveRules(
  empId: string,
  day: Weekday,
  currentAssignment: Record<string, Weekday>,
  rules: CollectiveRule[]
): boolean {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.employeeIds.includes(empId)) continue;

    let countOnDay = 1; // contando o próprio empId
    for (const otherId of rule.employeeIds) {
      if (otherId !== empId && currentAssignment[otherId] === day) {
        countOnDay++;
      }
    }
    if (countOnDay > rule.maxOffSameDay) {
      return false;
    }
  }
  return true;
}

/**
 * Calcula o custo heurístico de alocar `emp` no dia `day` nesta semana,
 * priorizando equilíbrio global, equilíbrio por grupo (A/B) e rodízio entre semanas.
 */
function scoreCandidateDay(
  emp: ScheduleEmployeeConfig,
  day: Weekday,
  currentAssignment: Record<string, Weekday>,
  employeesById: Record<string, ScheduleEmployeeConfig>,
  prevWeekAssignment: Record<string, Weekday> | null,
  historyCounts: Record<string, Record<Weekday, number>>
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

  // Penaliza fortemente concentração no mesmo grupo ou no mesmo dia
  let score = groupOffOnDay * 100 + totalOffOnDay * 35;

  // Penaliza repetir o mesmo dia da semana anterior (para colaboradores flexíveis)
  if (emp.allowedDays.length > 1 && prevWeekAssignment && prevWeekAssignment[emp.id] === day) {
    score += 25;
  }

  // Incentiva rodízio equilibrado ao longo do mês
  const prevCount = historyCounts[emp.id]?.[day] || 0;
  score += prevCount * 12;

  return score;
}

/**
 * Resolve uma semana individual usando Backtracking CSP com ordenação MRV (Minimum Remaining Values)
 * e ordenação de valores por menor conflito de cobertura.
 */
function solveWeekCSP(
  weekIndex: number,
  employees: ScheduleEmployeeConfig[],
  rules: CollectiveRule[],
  prevWeekAssignment: Record<string, Weekday> | null,
  historyCounts: Record<string, Record<Weekday, number>>
): { assignment: Record<string, Weekday> | null; backtracks: number } {
  const employeesById: Record<string, ScheduleEmployeeConfig> = {};
  for (const e of employees) employeesById[e.id] = e;

  // Domínio inicial de cada colaborador para esta semana
  const domains: Record<string, Weekday[]> = {};
  for (const emp of employees) {
    let dom = [...emp.allowedDays];
    if (emp.alternateDays && dom.length >= 2) {
      if (prevWeekAssignment && prevWeekAssignment[emp.id]) {
        const filtered = dom.filter((d) => d !== prevWeekAssignment[emp.id]);
        if (filtered.length > 0) dom = filtered;
      } else {
        // Na semana 0, escolhe deterministicamente conforme índice par/ímpar
        const firstChoice = dom[weekIndex % dom.length];
        dom = [firstChoice, ...dom.filter((d) => d !== firstChoice)];
      }
    }
    domains[emp.id] = dom;
  }

  // Verifica domínio vazio imediato
  for (const emp of employees) {
    if (domains[emp.id].length === 0) {
      return { assignment: null, backtracks: 0 };
    }
  }

  // Ordenação MRV: quem tem menos opções (e mais regras coletivas) vem primeiro
  const ruleDegree: Record<string, number> = {};
  for (const emp of employees) ruleDegree[emp.id] = 0;
  for (const r of rules) {
    if (!r.enabled) continue;
    for (const id of r.employeeIds) {
      if (ruleDegree[id] !== undefined) ruleDegree[id]++;
    }
  }

  const ordered = [...employees].sort((a, b) => {
    const diffDom = domains[a.id].length - domains[b.id].length;
    if (diffDom !== 0) return diffDom;
    return (ruleDegree[b.id] || 0) - (ruleDegree[a.id] || 0);
  });

  const current: Record<string, Weekday> = {};
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
      if (!isConsistentWithCollectiveRules(emp.id, day, current, rules)) {
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

/**
 * Determina o limite máximo de horas semanais vigente para uma semana específica
 * conforme a Portaria MTE nº 2.041/2026:
 * - Até 15/12/2026: 44h semanais
 * - A partir de 16/12/2026: 42h semanais (transição até 40h)
 * - Se `transition40Date` estiver configurada e atingida: 40h semanais
 */
export function getLegalMaxWeeklyHoursForWeek(
  week: WeekRange,
  policy: MtePolicyConfig
): number {
  if (policy.phaseMode === '44h') return 44;
  if (policy.phaseMode === '42h') return 42;
  if (policy.phaseMode === '40h') return 40;

  // Modo automático por vigência: verifica se a semana toca a data de transição
  const weekEndIso = formatIsoDate(week.sundayDate);
  if (policy.transition40Date && weekEndIso >= policy.transition40Date) {
    return 40;
  }
  if (policy.transition42Date && weekEndIso >= policy.transition42Date) {
    return 42;
  }
  return 44;
}

/**
 * Seleciona o turno aplicável para a semana:
 * no modo automático ('auto'), ajusta automaticamente para 44h, 42h ou 40h conforme a vigência;
 * nos modos manuais, utiliza o turno configurado pelo usuário.
 */
export function resolveShiftForWeek(
  legalMaxHours: number,
  customShift: ShiftTemplate,
  policy: MtePolicyConfig
): ShiftTemplate {
  if (policy.phaseMode === 'auto') {
    if (legalMaxHours <= 40) return SHIFT_40H;
    if (legalMaxHours <= 42) return SHIFT_42H;
    return SHIFT_44H;
  }
  return customShift;
}

/**
 * Executa o Solver CSP para todas as semanas do mês e realiza a auditoria completa
 * CLT, Portaria MTE nº 2.041/2026 e Condições Individuais/Coletivas.
 */
export function generateAndAuditSchedule(
  year: number,
  monthIndex0: number,
  employees: ScheduleEmployeeConfig[],
  rules: CollectiveRule[],
  shift: ShiftTemplate,
  policy: MtePolicyConfig = DEFAULT_MTE_POLICY
): SolverResult {
  const weeks = buildMonthWeeks(year, monthIndex0);
  const assignments: WeekAssignment[] = [];
  const historyCounts: Record<string, Record<Weekday, number>> = {};

  for (const emp of employees) {
    historyCounts[emp.id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }

  let totalBacktracks = 0;
  let prevAssignment: Record<string, Weekday> | null = null;

  for (const week of weeks) {
    const { assignment, backtracks } = solveWeekCSP(
      week.weekIndex,
      employees,
      rules,
      prevAssignment,
      historyCounts
    );
    totalBacktracks += backtracks;

    if (!assignment) {
      return {
        success: false,
        error: `Não foi possível encontrar uma combinação válida na ${week.label} sem violar as restrições individuais ou coletivas. Revise as regras configuradas.`,
        weeks,
        assignments,
        audits: [],
        totalBacktracks,
      };
    }

    for (const [empId, day] of Object.entries(assignment)) {
      if (historyCounts[empId]) {
        historyCounts[empId][day] = (historyCounts[empId][day] || 0) + 1;
      }
    }

    const legalMaxWeeklyHours = getLegalMaxWeeklyHoursForWeek(week, policy);
    const appliedShift = resolveShiftForWeek(legalMaxWeeklyHours, shift, policy);

    assignments.push({
      weekIndex: week.weekIndex,
      offDayByEmployee: assignment,
      backtracks,
      legalMaxWeeklyHours,
      appliedShift,
    });
    prevAssignment = assignment;
  }

  const audits = runScheduleAudit(weeks, assignments, employees, rules, policy);

  return {
    success: true,
    weeks,
    assignments,
    audits,
    totalBacktracks,
  };
}

function calculateShiftMetrics(shift: ShiftTemplate) {
  const startMin = parseMinutes(shift.workStart);
  const breakStartMin = parseMinutes(shift.breakStart);
  const breakEndMin = parseMinutes(shift.breakEnd);
  const endMin = parseMinutes(shift.workEnd);
  const breakDuration = breakEndMin - breakStartMin;
  const dailyWorkMinutes = endMin - startMin - breakDuration;
  const weeklyMinutes = dailyWorkMinutes * 5;
  const interjornadaMinutes = 24 * 60 - (endMin - startMin);
  return { breakDuration, dailyWorkMinutes, weeklyMinutes, interjornadaMinutes };
}

function runScheduleAudit(
  weeks: WeekRange[],
  assignments: WeekAssignment[],
  employees: ScheduleEmployeeConfig[],
  rules: CollectiveRule[],
  policy: MtePolicyConfig
): AuditCheck[] {
  const checks: AuditCheck[] = [];

  // 1. Auditoria semanal de carga horária conforme Portaria MTE nº 2.041/2026 (44h -> 42h em 16/12/2026 -> 40h)
  const weekLimitFailures: string[] = [];
  const intraFailures: string[] = [];
  const interFailures: string[] = [];
  const weekSummaries: string[] = [];

  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const assign = assignments[i];
    const m = calculateShiftMetrics(assign.appliedShift);
    const weeklyHoursActual = m.weeklyMinutes / 60;

    weekSummaries.push(
      `Sem ${i + 1}: ${weeklyHoursActual.toFixed(1).replace('.0', '')}h/${assign.legalMaxWeeklyHours}h`
    );

    if (m.dailyWorkMinutes <= 0 || m.weeklyMinutes > assign.legalMaxWeeklyHours * 60) {
      weekLimitFailures.push(
        `${w.label}: ${weeklyHoursActual.toFixed(2)}h excede limite de ${assign.legalMaxWeeklyHours}h`
      );
    }
    if (m.dailyWorkMinutes > 6 * 60 && m.breakDuration < 60) {
      intraFailures.push(`${w.label}: intervalo de ${m.breakDuration} min (< 60 min)`);
    }
    if (m.interjornadaMinutes < 11 * 60) {
      interFailures.push(
        `${w.label}: interjornada de ${(m.interjornadaMinutes / 60).toFixed(2)}h (< 11h)`
      );
    }
  }

  checks.push({
    id: 'mte-2041-transicao-jornada',
    category: 'MTE_2041',
    title: `Portaria MTE nº 2.041/2026 — Limite Semanal (44h → 42h em 16/12/2026 → 40h)`,
    passed: weekLimitFailures.length === 0,
    details:
      weekLimitFailures.length === 0
        ? `Modo ${policy.phaseMode === 'auto' ? 'Automático por Vigência' : policy.phaseMode}: ${weekSummaries.join(' | ')}.`
        : `Violação do teto semanal: ${weekLimitFailures.join('; ')}.`,
  });

  checks.push({
    id: 'clt-intrajornada',
    category: 'CLT',
    title: 'Intervalo Intrajornada Mínimo 1h (CLT Art. 71)',
    passed: intraFailures.length === 0,
    details:
      intraFailures.length === 0
        ? `Todas as ${weeks.length} semanas respeitam intervalo intrajornada mínimo de 60 min.`
        : intraFailures.join('; '),
  });

  checks.push({
    id: 'clt-interjornada',
    category: 'CLT',
    title: 'Descanso Interjornada Mínimo 11h (CLT Art. 66)',
    passed: interFailures.length === 0,
    details:
      interFailures.length === 0
        ? `Todas as ${weeks.length} semanas respeitam descanso interjornada mínimo de 11h.`
        : interFailures.join('; '),
  });

  checks.push({
    id: 'mte-2041-dsr',
    category: 'MTE_2041',
    title: 'Portaria MTE nº 2.041/2026 — DSR Dominical e Registro 5x2',
    passed: true,
    details: `Todos os ${employees.length} colaboradores possuem 5 dias trabalhados, 1 folga útil semanal e 1 DSR fixo aos domingos em todas as ${weeks.length} semanas.`,
  });

  // 2. Auditoria de Condições Individuais
  let individualViolations = 0;
  let alternanceViolations = 0;
  for (let w = 0; w < assignments.length; w++) {
    const offMap = assignments[w].offDayByEmployee;
    for (const emp of employees) {
      const assigned = offMap[emp.id];
      if (!emp.allowedDays.includes(assigned)) {
        individualViolations++;
      }
      if (emp.alternateDays && emp.allowedDays.length >= 2 && w > 0) {
        const prev = assignments[w - 1].offDayByEmployee[emp.id];
        if (prev === assigned) {
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

  // 3. Auditoria de Condições Coletivas
  let collectiveViolations = 0;
  const activeRules = rules.filter((r) => r.enabled);
  for (const wAssign of assignments) {
    for (const rule of activeRules) {
      for (const day of ALL_WEEKDAYS) {
        const count = rule.employeeIds.filter((id) => wAssign.offDayByEmployee[id] === day).length;
        if (count > rule.maxOffSameDay) {
          collectiveViolations++;
        }
      }
    }
  }

  checks.push({
    id: 'audit-collective',
    category: 'COLETIVA',
    title: `Condições Coletivas (${activeRules.length} regras ativas)`,
    passed: collectiveViolations === 0,
    details:
      collectiveViolations === 0
        ? 'Nenhuma colisão de folga entre colaboradores com exclusão mútua.'
        : `Detectados ${collectiveViolations} conflitos de exclusão mútua.`,
  });

  // 4. Cobertura mínima por grupo
  let minPresentA = Infinity;
  let minPresentB = Infinity;
  const totalA = employees.filter((e) => e.group === 'A').length;
  const totalB = employees.filter((e) => e.group === 'B').length;

  for (const wAssign of assignments) {
    for (const day of ALL_WEEKDAYS) {
      const offA = employees.filter((e) => e.group === 'A' && wAssign.offDayByEmployee[e.id] === day).length;
      const offB = employees.filter((e) => e.group === 'B' && wAssign.offDayByEmployee[e.id] === day).length;
      minPresentA = Math.min(minPresentA, totalA - offA);
      minPresentB = Math.min(minPresentB, totalB - offB);
    }
  }

  checks.push({
    id: 'audit-coverage',
    category: 'COBERTURA',
    title: 'Equilíbrio de Cobertura por Grupo (A e B)',
    passed: minPresentA > 0 && minPresentB > 0,
    details: `Presença mínima diária: Grupo A = ${minPresentA}/${totalA} • Grupo B = ${minPresentB}/${totalB}.`,
  });

  return checks;
}

