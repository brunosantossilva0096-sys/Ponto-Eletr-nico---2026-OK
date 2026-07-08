import { Employee, TimeLog } from '../types';

export const calculateTimeBank = (employee: Employee | null, logs: TimeLog[], startDateStr: string, endDateStr: string) => {
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
  const daily: { date: string, worked: number, expected: number, balance: number }[] = [];
  
  // Primeiro vamos definir as horas diárias esperadas
  const weeklyHours = employee.weekly_hours || 44;
  let dailyExpectedHours = 0;
  if (employee.schedule_type === 'custom' && employee.custom_schedule) {
    const activeDaysPerWeek = Object.values(employee.custom_schedule).filter((s: any) => s.active).length;
    dailyExpectedHours = activeDaysPerWeek > 0 ? (weeklyHours / activeDaysPerWeek) : 0;
  } else {
    const activeDaysPerWeek = employee.work_days ? employee.work_days.length : 5;
    dailyExpectedHours = activeDaysPerWeek > 0 ? (weeklyHours / activeDaysPerWeek) : 0;
  }
  const expectedMinutesPerDay = Math.round(dailyExpectedHours * 60);

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
    
    if (employee.schedule_type === 'custom' && employee.custom_schedule) {
      if (employee.custom_schedule[dayOfWeek]?.active) isWorkDay = true;
    } else {
      if (employee.work_days && employee.work_days.includes(dayOfWeek)) isWorkDay = true;
    }
    
    const exp = isWorkDay ? expectedMinutesPerDay : 0;
    daily.push({
      date,
      worked: Math.round(workedInDay),
      expected: exp,
      balance: Math.round(workedInDay) - exp,
      logs: dayLogs
    });
  });

  daily.sort((a, b) => a.date.localeCompare(b.date));

  // Calculate overall expected hours in period
  const start = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T23:59:59`);
  
  let workDaysCount = 0;
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (employee.schedule_type === 'custom' && employee.custom_schedule) {
      if (employee.custom_schedule[dayOfWeek]?.active) workDaysCount++;
    } else {
      if (employee.work_days && employee.work_days.includes(dayOfWeek)) workDaysCount++;
    }
    current.setDate(current.getDate() + 1);
  }

  const overallExpectedMinutes = Math.round(dailyExpectedHours * workDaysCount * 60);
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
