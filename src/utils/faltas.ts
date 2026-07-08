import { TimeLog, Employee, Holiday, Absence } from '../types';

export function generateAbsences(
  logs: TimeLog[],
  employees: Employee[],
  startDateStr: string,
  endDateStr: string,
  holidays: Holiday[] = [],
  absencesDb: Absence[] = []
): TimeLog[] {
  if (!startDateStr || !endDateStr) return [];
  
  const generatedAbsences: TimeLog[] = [];
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T23:59:59');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  employees.forEach(emp => {
    // Get work days - using schedule_type if present, otherwise work_days, fallback to 1-5 (Mon-Fri)
    let activeWorkDays: number[] = [];
    if (emp.schedule_type === 'custom' && emp.custom_schedule) {
      activeWorkDays = Object.keys(emp.custom_schedule)
        .map(Number)
        .filter(day => emp.custom_schedule![day]?.active);
    } else {
      activeWorkDays = emp.work_days || [1, 2, 3, 4, 5];
    }

    const empLogs = logs.filter(l => l.employee_id === emp.id);
    const logsByDate = new Set(empLogs.map(l => l.timestamp.split('T')[0]));
    
    const current = new Date(start);
    // Only check past days to avoid marking today as absent prematurely
    while (current <= end && current < today) {
      const dow = current.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      if (activeWorkDays.includes(dow)) {
        // Handle timezone issues to get exact YYYY-MM-DD
        const dateStr = current.getFullYear() + '-' + 
                       String(current.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(current.getDate()).padStart(2, '0');
        
        const isHoliday = holidays.some(h => h.date === dateStr);
        const isAbsence = absencesDb.some(a => dateStr >= a.start_date && dateStr <= a.end_date);
        
        if (!logsByDate.has(dateStr) && !isHoliday && !isAbsence) {
          generatedAbsences.push({
            id: `falta-${emp.id}-${dateStr}`,
            employee_id: emp.id,
            timestamp: `${dateStr}T00:00:00-03:00`,
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
            employees: emp
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }
  });

  return generatedAbsences;
}
