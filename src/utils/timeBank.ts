import { Employee, TimeLog, Holiday, Absence } from '../types';

const calcMinutes = (startStr?: string | null, endStr?: string | null) => {
  if (!startStr || !endStr) return 0;
  const [h1, m1] = startStr.split(':').map(Number);
  const [h2, m2] = endStr.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
};

export const calculateTimeBank = (employee: Employee | null, logs: TimeLog[], startDateStr: string, endDateStr: string, holidays: Holiday[] = [], absences: Absence[] = []) => {
  if (!employee || !startDateStr || !endDateStr) return null;

  // Group logs by date
  const logsByDate: Record<string, TimeLog[]> = {};
  logs.forEach(log => {
    const d = log.timestamp.split('T')[0];
    if (d >= startDateStr && d <= endDateStr) {
      if (!logsByDate[d]) logsByDate[d] = [];
      logsByDate[d].push(log);
    }
  });

  let totalWorkedMinutes = 0;
  let overallExpectedMinutes = 0;
  const daily: { date: string, worked: number, expected: number, balance: number, logs: TimeLog[] }[] = [];
  
  const isHoliday = (dateStr: string) => holidays.some(h => h.date === dateStr);
  const isAbsence = (dateStr: string) => absences.some(a => dateStr >= a.start_date && dateStr <= a.end_date);
  
  // Calculate worked hours per day
  Object.keys(logsByDate).forEach(date => {
    const dayLogs = logsByDate[date].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let workedInDay = 0;
    
    if (dayLogs.length >= 2) {
      // Tenta achar pares Entrada/Saida
      const entradas = dayLogs.filter(l => l.type.includes('Entrada'));
      const saidas = dayLogs.filter(l => l.type.includes('Saída'));
      
      if (entradas.length > 0 && saidas.length > 0) {
         for(let i=0; i<Math.min(entradas.length, saidas.length); i++) {
           const inTime = new Date(entradas[i].timestamp).getTime();
           const outTime = new Date(saidas[i].timestamp).getTime();
           if (outTime > inTime) {
             workedInDay += (outTime - inTime) / (1000 * 60);
           }
         }
      } else if (dayLogs.length === 2) {
         // Fallback se o type nao ajudar
         const inTime = new Date(dayLogs[0].timestamp).getTime();
         const outTime = new Date(dayLogs[1].timestamp).getTime();
         workedInDay += (outTime - inTime) / (1000 * 60);
      } else if (dayLogs.length === 4) {
         // Fallback padrao 4 batidas
         const in1 = new Date(dayLogs[0].timestamp).getTime();
         const out1 = new Date(dayLogs[1].timestamp).getTime();
         const in2 = new Date(dayLogs[2].timestamp).getTime();
         const out2 = new Date(dayLogs[3].timestamp).getTime();
         workedInDay += (out1 - in1) / (1000 * 60);
         workedInDay += (out2 - in2) / (1000 * 60);
      }
    }
    
    totalWorkedMinutes += workedInDay;
    
    const dObj = new Date(`${date}T12:00:00`);
    const dayOfWeek = dObj.getDay();
    let isWorkDay = false;
    let expectedMinutesPerDay = 0;
    
    if (employee.schedule_type === 'custom' && employee.custom_schedule) {
      const schedule = employee.custom_schedule[dayOfWeek];
      if (schedule?.active) {
        isWorkDay = true;
        const workMins = calcMinutes(schedule.work_start, schedule.break_start) + calcMinutes(schedule.break_end, schedule.work_end);
        const fallback = Math.round((employee.weekly_hours || 44) / Object.values(employee.custom_schedule).filter((s: any) => s.active).length * 60);
        expectedMinutesPerDay = workMins > 0 ? workMins : fallback;
      }
    } else {
      if (!employee.work_days || employee.work_days.includes(dayOfWeek)) {
        isWorkDay = true;
        const workMins = calcMinutes(employee.work_start, employee.break_start) + calcMinutes(employee.break_end, employee.work_end);
        const activeDaysPerWeek = employee.work_days ? employee.work_days.length : 5;
        const fallback = activeDaysPerWeek > 0 ? Math.round((employee.weekly_hours || 44) / activeDaysPerWeek * 60) : 0;
        expectedMinutesPerDay = workMins > 0 ? workMins : fallback;
      }
    }
    
    if (isHoliday(date) || isAbsence(date)) {
      expectedMinutesPerDay = 0;
    }
    
    daily.push({
      date,
      worked: Math.round(workedInDay),
      expected: expectedMinutesPerDay,
      balance: Math.round(workedInDay) - expectedMinutesPerDay,
      logs: dayLogs
    });
  });

  daily.sort((a, b) => a.date.localeCompare(b.date));

  // Calculate overall expected hours in period
  const start = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T23:59:59`);
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    
    const dateStr = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0');
    
    if (!isHoliday(dateStr) && !isAbsence(dateStr)) {
      if (employee.schedule_type === 'custom' && employee.custom_schedule) {
        const schedule = employee.custom_schedule[dayOfWeek];
        if (schedule?.active) {
          const workMins = calcMinutes(schedule.work_start, schedule.break_start) + calcMinutes(schedule.break_end, schedule.work_end);
          const fallback = Math.round((employee.weekly_hours || 44) / Object.values(employee.custom_schedule).filter((s: any) => s.active).length * 60);
          overallExpectedMinutes += workMins > 0 ? workMins : fallback;
        }
      } else {
        if (!employee.work_days || employee.work_days.includes(dayOfWeek)) {
          const workMins = calcMinutes(employee.work_start, employee.break_start) + calcMinutes(employee.break_end, employee.work_end);
          const activeDaysPerWeek = employee.work_days ? employee.work_days.length : 5;
          const fallback = activeDaysPerWeek > 0 ? Math.round((employee.weekly_hours || 44) / activeDaysPerWeek * 60) : 0;
          overallExpectedMinutes += workMins > 0 ? workMins : fallback;
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }

  const overallBalanceMinutes = Math.round(totalWorkedMinutes) - overallExpectedMinutes;

  return {
    worked: Math.round(totalWorkedMinutes),
    expected: overallExpectedMinutes,
    balance: overallBalanceMinutes,
    daily
  };
};

export const formatHours = (mins: number) => {
  const isNegative = mins < 0;
  const absMins = Math.abs(mins);
  const h = Math.floor(absMins / 60);
  const m = absMins % 60;
  const prefix = isNegative ? '-' : '+';
  return `${isNegative ? prefix : ''}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const formatHoursNeutral = (mins: number) => {
  const absMins = Math.abs(mins);
  const h = Math.floor(absMins / 60);
  const m = absMins % 60;
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
};
