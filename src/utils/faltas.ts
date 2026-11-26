import { TimeLog, Employee, Holiday, Absence } from '../types';
import { buildLocalTimestampIso, toLocalDateStr } from './dateUtils';
import { isEmployeeInactive, loadCompanyRules, resolveEmployeeDayFrom5x2 } from './companyRules';

export function generateAbsences(
  logs: TimeLog[],
  employees: Employee[],
  startDateStr: string,
  endDateStr: string,
  holidays: Holiday[] = [],
  absencesDb: Absence[] = [],
  forceUseSchedule5x2?: boolean
): TimeLog[] {
  if (!startDateStr || !endDateStr || startDateStr > endDateStr) return [];

  const generatedAbsences: TimeLog[] = [];
  const todayStr = toLocalDateStr();

  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);

  employees.forEach((emp) => {
    if (isEmployeeInactive(emp)) return;
    const companyRules = loadCompanyRules(emp.company_id || '');
    if (!companyRules.showAutoAbsencesInReports && forceUseSchedule5x2 === undefined) {
      return;
    }
    const use5x2 =
      forceUseSchedule5x2 !== undefined
        ? forceUseSchedule5x2
        : companyRules.useSchedule5x2InReportsAndTimeBank;

    let fallbackActiveWorkDays: number[] = [];
    if (emp.schedule_type === 'custom' && emp.custom_schedule) {
      fallbackActiveWorkDays = Object.keys(emp.custom_schedule)
        .map(Number)
        .filter((day) => emp.custom_schedule![day]?.active);
    } else {
      fallbackActiveWorkDays = emp.work_days || [1, 2, 3, 4, 5];
    }

    const empLogs = logs.filter((l) => l.employee_id === emp.id);
    // Usa data local para não deslocar batidas noturnas (>21:00 BRT)
    const logsByDate = new Set(empLogs.map((l) => toLocalDateStr(l.timestamp)));
    // Filtra apenas abonos DESTE funcionário (corrige bug onde abono de um afetava todos)
    const empAbsences = absencesDb.filter((a) => a.employee_id === emp.id);

    const current = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    while (current <= end) {
      const dateStr = toLocalDateStr(current);
      // Apenas dias passados (não marca o dia atual em andamento como falta)
      if (dateStr >= todayStr) break;

      const dow = current.getDay();
      let isExpectedWorkDay = fallbackActiveWorkDays.includes(dow);

      const res5x2 = resolveEmployeeDayFrom5x2(emp, dateStr, use5x2);
      if (res5x2 && res5x2.foundIn5x2) {
        isExpectedWorkDay = res5x2.isWorkDay;
      }

      if (isExpectedWorkDay) {
        const isHoliday = holidays.some((h) => h.date === dateStr);
        const isAbsence = empAbsences.some((a) => dateStr >= a.start_date && dateStr <= a.end_date);

        if (!logsByDate.has(dateStr) && !isHoliday && !isAbsence) {
          generatedAbsences.push({
            id: `falta-${emp.id}-${dateStr}`,
            employee_id: emp.id,
            timestamp: buildLocalTimestampIso(dateStr, '08:00'),
            type: 'Falta',
            distance: null,
            latitude: null,
            longitude: null,
            verification_method: 'Sistema (Ausência)',
            photo_evidence: null,
            hash_assinatura: 'N/A',
            pis_pasep_trabalhador: emp.pis,
            cpf_trabalhador: emp.cpf,
            cnpj_empregador: emp.companies?.cnpj || null,
            razao_social_empregador: emp.companies?.name || null,
            created_at: new Date().toISOString(),
            isFalta: true,
            employees: emp,
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }
  });

  return generatedAbsences;
}
