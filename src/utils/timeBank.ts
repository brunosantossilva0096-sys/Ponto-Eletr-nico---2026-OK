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
  const getAbsence = (dateStr: string) => absences.find(a => dateStr >= a.start_date && dateStr <= a.end_date);
  
  const start = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T23:59:59`);
  const current = new Date(start);
  const today = new Date();
  today.setHours(0,0,0,0);
  
  while (current <= end) {
    const dateStr = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0');
    const dayOfWeek = current.getDay();
    
    // 1. Calculate Expected Minutes (Standard or Custom)
    let expectedMinutesPerDay = 0;
    if (employee.schedule_type === 'custom' && employee.custom_schedule) {
      const schedule = employee.custom_schedule[dayOfWeek];
      if (schedule?.active) {
        const workMins = calcMinutes(schedule.work_start, schedule.break_start) + calcMinutes(schedule.break_end, schedule.work_end);
        const fallback = Math.round((employee.weekly_hours || 44) / Object.values(employee.custom_schedule).filter((s: any) => s.active).length * 60);
        expectedMinutesPerDay = workMins > 0 ? workMins : fallback;
      }
    } else {
      if (!employee.work_days || employee.work_days.includes(dayOfWeek)) {
        const workMins = calcMinutes(employee.work_start, employee.break_start) + calcMinutes(employee.break_end, employee.work_end);
        const activeDaysPerWeek = employee.work_days ? employee.work_days.length : 5;
        const fallback = activeDaysPerWeek > 0 ? Math.round((employee.weekly_hours || 44) / activeDaysPerWeek * 60) : 0;
        expectedMinutesPerDay = workMins > 0 ? workMins : fallback;
      }
    }
    
    // 2. Calculate Worked Minutes
    let workedInDay = 0;
    const dayLogs = logsByDate[dateStr] ? logsByDate[dateStr].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) : [];
    
    if (dayLogs.length >= 2) {
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
         const inTime = new Date(dayLogs[0].timestamp).getTime();
         const outTime = new Date(dayLogs[1].timestamp).getTime();
         workedInDay += (outTime - inTime) / (1000 * 60);
      } else if (dayLogs.length === 4) {
         const in1 = new Date(dayLogs[0].timestamp).getTime();
         const out1 = new Date(dayLogs[1].timestamp).getTime();
         const in2 = new Date(dayLogs[2].timestamp).getTime();
         const out2 = new Date(dayLogs[3].timestamp).getTime();
         workedInDay += (out1 - in1) / (1000 * 60);
         workedInDay += (out2 - in2) / (1000 * 60);
      }
    }
    
    // 3. Apply Holiday and Abono Rules
    const abono = getAbsence(dateStr);
    
    if (isHoliday(dateStr)) {
       // Holiday: expected is 0. Any worked hours are extra.
       expectedMinutesPerDay = 0;
    } else if (abono) {
       // Abono: Expected remains normal. But we "credit" the expected hours as worked.
       let creditedHours = 0;
       
       if (abono.shift === 'manha') {
           const wStart = employee.schedule_type === 'custom' && employee.custom_schedule ? employee.custom_schedule[dayOfWeek]?.work_start : employee.work_start;
           const bStart = employee.schedule_type === 'custom' && employee.custom_schedule ? employee.custom_schedule[dayOfWeek]?.break_start : employee.break_start;
           creditedHours = calcMinutes(wStart, bStart);
       } else if (abono.shift === 'tarde') {
           const bEnd = employee.schedule_type === 'custom' && employee.custom_schedule ? employee.custom_schedule[dayOfWeek]?.break_end : employee.break_end;
           const wEnd = employee.schedule_type === 'custom' && employee.custom_schedule ? employee.custom_schedule[dayOfWeek]?.work_end : employee.work_end;
           creditedHours = calcMinutes(bEnd, wEnd);
       } else {
           // Integral
           // Se for integral, não deve exceder as horas esperadas se o funcionário não trabalhou
           creditedHours = expectedMinutesPerDay;
       }
       
       // Credita as horas ao total trabalhado do dia
       workedInDay += creditedHours;
    }
    
    totalWorkedMinutes += workedInDay;
    overallExpectedMinutes += expectedMinutesPerDay;
    
    // Only include in daily breakdown if there's log activity OR if it's a holiday/abono OR if it's a past workday.
    // This makes the UI list much more transparent.
    if (dayLogs.length > 0 || abono || isHoliday(dateStr) || (expectedMinutesPerDay > 0 && current < today)) {
       daily.push({
         date: dateStr,
         worked: Math.round(workedInDay),
         expected: expectedMinutesPerDay,
         balance: Math.round(workedInDay) - expectedMinutesPerDay,
         logs: dayLogs
       });
    }
    
    current.setDate(current.getDate() + 1);
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));

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
