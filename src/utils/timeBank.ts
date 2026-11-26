import { Employee, TimeLog, Holiday, Absence } from '../types';
import { calcShiftWorkMinutes, toLocalDateStr } from './dateUtils';
import {
  CompanyPointRules,
  loadCompanyRules,
  resolveEmployeeDayFrom5x2,
  TimeBankAdjustment,
} from './companyRules';

export interface DailyTimeBankEntry {
  date: string;
  worked: number;
  expected: number;
  balance: number;
  logs: TimeLog[];
  abono?: Absence;
  isHoliday?: boolean;
  isOff5x2?: boolean;
  inProgress?: boolean;
}

export interface TimeBankReportResult {
  worked: number;
  expected: number;
  adjustmentsTotal: number;
  adjustments: TimeBankAdjustment[];
  balance: number;
  daily: DailyTimeBankEntry[];
}

function extractCustomAbonoMinutes(reason?: string | null): number | null {
  if (!reason) return null;
  const match = reason.match(/\[ABONO_MIN:(\d+)\]/);
  if (match) {
    const mins = Number(match[1]);
    if (!isNaN(mins) && mins >= 0) return mins;
  }
  return null;
}

export const calculateTimeBank = (
  employee: Employee | null,
  logs: TimeLog[],
  startDateStr: string,
  endDateStr: string,
  holidays: Holiday[] = [],
  absences: Absence[] = [],
  overrideRules?: CompanyPointRules
): TimeBankReportResult | null => {
  if (!employee || !startDateStr || !endDateStr || startDateStr > endDateStr) return null;

  const rules = overrideRules || loadCompanyRules(employee.company_id || '');
  const todayStr = toLocalDateStr();

  // Agrupa batidas reais pela data LOCAL (evita jogar batidas após 21:00 BRT no dia seguinte)
  const logsByDate: Record<string, TimeLog[]> = {};
  logs.forEach((log) => {
    if (log.employee_id && log.employee_id !== employee.id) return;
    const d = toLocalDateStr(log.timestamp);
    if (d >= startDateStr && d <= endDateStr) {
      if (!logsByDate[d]) logsByDate[d] = [];
      logsByDate[d].push(log);
    }
  });

  let totalWorkedMinutes = 0;
  let overallExpectedMinutes = 0;
  const daily: DailyTimeBankEntry[] = [];

  const isHoliday = (dateStr: string) => holidays.some((h) => h.date === dateStr);
  const getAbsence = (dateStr: string) =>
    absences.find(
      (a) =>
        (!a.employee_id || a.employee_id === employee.id) &&
        dateStr >= a.start_date &&
        dateStr <= a.end_date
    );

  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const current = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  while (current <= end) {
    const dateStr = toLocalDateStr(current);
    const dayOfWeek = current.getDay();
    const isFutureDay = dateStr > todayStr;
    const isToday = dateStr === todayStr;

    // 1. Calcula minutos esperados (Escala 5x2 ativa OU cadastro do funcionário)
    let expectedMinutesPerDay = 0;
    let isOff5x2 = false;

    const resolved5x2 = resolveEmployeeDayFrom5x2(
      employee,
      dateStr,
      rules.useSchedule5x2InReportsAndTimeBank
    );

    if (resolved5x2 && resolved5x2.foundIn5x2) {
      if (!resolved5x2.isWorkDay) {
        expectedMinutesPerDay = 0;
        isOff5x2 = resolved5x2.offReason === 'FOLGA_5X2';
      } else {
        expectedMinutesPerDay = calcShiftWorkMinutes(
          resolved5x2.workStart,
          resolved5x2.breakStart,
          resolved5x2.breakEnd,
          resolved5x2.workEnd
        );
      }
    } else if (employee.schedule_type === 'custom' && employee.custom_schedule) {
      const schedule = employee.custom_schedule[dayOfWeek];
      if (schedule?.active) {
        const workMins = calcShiftWorkMinutes(
          schedule.work_start,
          schedule.break_start,
          schedule.break_end,
          schedule.work_end
        );
        const activeCount = Object.values(employee.custom_schedule).filter((s: any) => s?.active).length;
        const fallback =
          activeCount > 0 ? Math.round(((employee.weekly_hours || 44) / activeCount) * 60) : 0;
        expectedMinutesPerDay = workMins > 0 ? workMins : fallback;
      }
    } else {
      if (!employee.work_days || employee.work_days.includes(dayOfWeek)) {
        const workMins = calcShiftWorkMinutes(
          employee.work_start,
          employee.break_start,
          employee.break_end,
          employee.work_end
        );
        const activeDaysPerWeek = employee.work_days ? employee.work_days.length : 5;
        const fallback =
          activeDaysPerWeek > 0
            ? Math.round(((employee.weekly_hours || 44) / activeDaysPerWeek) * 60)
            : 0;
        expectedMinutesPerDay = workMins > 0 ? workMins : fallback;
      }
    }

    // 2. Calcula minutos trabalhados (ignorando registros sintéticos/manuais de 'Falta' no pareamento)
    const allDayLogs = logsByDate[dateStr]
      ? [...logsByDate[dateStr]].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
      : [];
    const validPunchLogs = allDayLogs.filter(
      (l) => !l.isFalta && l.type !== 'Falta' && l.type !== 'Falta Meio Expediente'
    );

    let workedInDay = 0;
    if (validPunchLogs.length >= 2) {
      for (let i = 0; i < validPunchLogs.length - 1; i += 2) {
        const inTime = new Date(validPunchLogs[i].timestamp).getTime();
        const outTime = new Date(validPunchLogs[i + 1].timestamp).getTime();
        if (outTime > inTime) {
          workedInDay += (outTime - inTime) / (1000 * 60);
        }
      }
    }

    // 3. Feriados e Abonos
    const abono = getAbsence(dateStr);
    const holidayFlag = isHoliday(dateStr);

    if (holidayFlag) {
      expectedMinutesPerDay = 0;
    } else if (abono) {
      const customAbonoMins = extractCustomAbonoMinutes(abono.reason);
      if (customAbonoMins !== null) {
        expectedMinutesPerDay = Math.max(0, expectedMinutesPerDay - customAbonoMins);
      } else if (abono.shift === 'manha' || abono.shift === 'tarde') {
        const credit =
          rules.partialAbsenceMode === 'half_expected'
            ? Math.round(expectedMinutesPerDay / 2)
            : rules.partialAbsenceFixedMinutes ?? 240;
        expectedMinutesPerDay = Math.max(0, expectedMinutesPerDay - credit);
      } else {
        expectedMinutesPerDay = 0;
      }
    }

    // 4. Não cobrar horas esperadas de dias futuros sem batidas, nem do dia de hoje se ainda em andamento
    let inProgress = false;
    if (isFutureDay && validPunchLogs.length === 0) {
      expectedMinutesPerDay = 0;
    } else if (
      isToday &&
      rules.ignoreIncompleteTodayInTimeBank &&
      (validPunchLogs.length === 0 || validPunchLogs.length % 2 !== 0)
    ) {
      expectedMinutesPerDay = 0;
      inProgress = validPunchLogs.length > 0;
    }

    const roundedWorked = Math.round(workedInDay);
    let dayBalance = roundedWorked - expectedMinutesPerDay;

    // 5. Tolerância diária CLT (Art. 58 §1º — ex: até 10 min não desconta nem gera extra)
    if (
      !inProgress &&
      expectedMinutesPerDay > 0 &&
      roundedWorked > 0 &&
      rules.cltDailyToleranceMinutes > 0 &&
      Math.abs(dayBalance) <= rules.cltDailyToleranceMinutes
    ) {
      dayBalance = 0;
      expectedMinutesPerDay = roundedWorked;
    }

    const shouldIncludeDay =
      !isFutureDay &&
      (allDayLogs.length > 0 ||
        Boolean(abono) ||
        holidayFlag ||
        isOff5x2 ||
        (expectedMinutesPerDay > 0 && dateStr < todayStr) ||
        (expectedMinutesPerDay > 0 && isToday));

    if (shouldIncludeDay || (isFutureDay && allDayLogs.length > 0)) {
      totalWorkedMinutes += roundedWorked;
      overallExpectedMinutes += expectedMinutesPerDay;

      daily.push({
        date: dateStr,
        worked: roundedWorked,
        expected: expectedMinutesPerDay,
        balance: dayBalance,
        logs: allDayLogs,
        abono: abono || undefined,
        isHoliday: holidayFlag,
        isOff5x2,
        inProgress,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));

  const empAdjustments = (rules.adjustments || []).filter(
    (adj) =>
      adj.employeeId === employee.id &&
      adj.date >= startDateStr &&
      adj.date <= endDateStr
  );
  const adjustmentsTotal = empAdjustments.reduce((acc, item) => acc + (item.minutes || 0), 0);
  const overallBalanceMinutes = totalWorkedMinutes - overallExpectedMinutes + adjustmentsTotal;

  return {
    worked: totalWorkedMinutes,
    expected: overallExpectedMinutes,
    adjustmentsTotal,
    adjustments: empAdjustments,
    balance: overallBalanceMinutes,
    daily,
  };
};

export const formatHours = (mins: number) => {
  const isNegative = mins < 0;
  const absMins = Math.abs(Math.round(mins));
  const h = Math.floor(absMins / 60);
  const m = absMins % 60;
  const prefix = isNegative ? '-' : '+';
  return `${prefix}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const formatHoursNeutral = (mins: number) => {
  const absMins = Math.abs(Math.round(mins));
  const h = Math.floor(absMins / 60);
  const m = absMins % 60;
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
};
