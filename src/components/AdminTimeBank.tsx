import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { TimeLog, Employee } from '../types';
import { Search, Clock, Calendar as CalendarIcon, User } from 'lucide-react';

export const AdminTimeBank = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase.from('employees').select('*').order('name');
      if (data) setEmployees(data);
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!selectedEmployee || !selectedMonth) return;
      setIsLoading(true);
      
      const startOfMonth = `${selectedMonth}-01T00:00:00`;
      // Handle leap years and different month lengths
      const year = parseInt(selectedMonth.split('-')[0]);
      const month = parseInt(selectedMonth.split('-')[1]);
      const lastDay = new Date(year, month, 0).getDate();
      const endOfMonth = `${selectedMonth}-${lastDay}T23:59:59`;

      const { data } = await supabase
        .from('time_logs')
        .select('*')
        .eq('employee_id', selectedEmployee)
        .gte('timestamp', startOfMonth)
        .lte('timestamp', endOfMonth)
        .order('timestamp', { ascending: true });
        
      if (data) setLogs(data);
      setIsLoading(false);
    };

    fetchLogs();
  }, [selectedEmployee, selectedMonth]);

  const calculateHours = () => {
    const emp = employees.find(e => e.id === selectedEmployee);
    if (!emp) return null;

    // Group logs by date
    const logsByDate: Record<string, TimeLog[]> = {};
    logs.forEach(log => {
      const d = log.timestamp.split('T')[0];
      if (!logsByDate[d]) logsByDate[d] = [];
      logsByDate[d].push(log);
    });

    let totalWorkedMinutes = 0;
    
    // Calculate worked hours per day
    Object.keys(logsByDate).forEach(date => {
      const dayLogs = logsByDate[date].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      if (dayLogs.length >= 2) {
        // Tenta achar pares Entrada/Saida
        const entradas = dayLogs.filter(l => l.type.includes('Entrada'));
        const saidas = dayLogs.filter(l => l.type.includes('Saída'));
        
        if (entradas.length > 0 && saidas.length > 0) {
           for(let i=0; i<Math.min(entradas.length, saidas.length); i++) {
             const inTime = new Date(entradas[i].timestamp).getTime();
             const outTime = new Date(saidas[i].timestamp).getTime();
             if (outTime > inTime) {
               totalWorkedMinutes += (outTime - inTime) / (1000 * 60);
             }
           }
        } else if (dayLogs.length === 2) {
           // Fallback se o type nao ajudar
           const inTime = new Date(dayLogs[0].timestamp).getTime();
           const outTime = new Date(dayLogs[1].timestamp).getTime();
           totalWorkedMinutes += (outTime - inTime) / (1000 * 60);
        } else if (dayLogs.length === 4) {
           // Fallback padrao 4 batidas
           const in1 = new Date(dayLogs[0].timestamp).getTime();
           const out1 = new Date(dayLogs[1].timestamp).getTime();
           const in2 = new Date(dayLogs[2].timestamp).getTime();
           const out2 = new Date(dayLogs[3].timestamp).getTime();
           totalWorkedMinutes += (out1 - in1) / (1000 * 60);
           totalWorkedMinutes += (out2 - in2) / (1000 * 60);
        }
      }
    });

    // Calculate expected hours for the month
    const weeklyHours = emp.weekly_hours || 44;
    // Aproximação: Semanas no mes = Dias do mes / 7
    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Forma mais exata: contar os dias úteis configurados do funcionario no mes
    let workDaysCount = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month - 1, i);
      const dayOfWeek = date.getDay();
      
      if (emp.schedule_type === 'custom' && emp.custom_schedule) {
        if (emp.custom_schedule[dayOfWeek]?.active) {
          workDaysCount++;
        }
      } else {
        if (emp.work_days && emp.work_days.includes(dayOfWeek)) {
          workDaysCount++;
        }
      }
    }

    let dailyExpectedHours = 0;
    
    if (emp.schedule_type === 'custom' && emp.custom_schedule) {
      // Se for custom, a meta diaria varia, entao a media eh a jornada semanal / dias ativos
      const activeDaysPerWeek = Object.values(emp.custom_schedule).filter((s: any) => s.active).length;
      dailyExpectedHours = activeDaysPerWeek > 0 ? (weeklyHours / activeDaysPerWeek) : 0;
    } else {
      const activeDaysPerWeek = emp.work_days ? emp.work_days.length : 5;
      dailyExpectedHours = activeDaysPerWeek > 0 ? (weeklyHours / activeDaysPerWeek) : 0;
    }

    const expectedMinutes = Math.round(dailyExpectedHours * workDaysCount * 60);
    const balanceMinutes = Math.round(totalWorkedMinutes) - expectedMinutes;

    return {
      worked: Math.round(totalWorkedMinutes),
      expected: expectedMinutes,
      balance: balanceMinutes
    };
  };

  const formatHours = (mins: number) => {
    const isNegative = mins < 0;
    const absMins = Math.abs(mins);
    const h = Math.floor(absMins / 60);
    const m = absMins % 60;
    const prefix = isNegative ? '-' : '+';
    return `${isNegative ? prefix : ''}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };
  
  const formatHoursNeutral = (mins: number) => {
    const absMins = Math.abs(mins);
    const h = Math.floor(absMins / 60);
    const m = absMins % 60;
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  };

  const report = calculateHours();

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-industrial-border overflow-hidden">
      <div className="bg-industrial-bg/50 border-b border-industrial-border p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <h2 className="text-xl font-bold text-industrial-text flex items-center gap-2">
          <Clock size={24} className="text-cyber-emerald" /> Banco de Horas
        </h2>
        
        <div className="flex gap-4 w-full md:w-auto">
          <select 
            value={selectedEmployee} 
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="flex-1 bg-white border border-industrial-border rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus:border-cyber-emerald"
          >
            <option value="">Selecione o Funcionário</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          
          <input 
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-40 bg-white border border-industrial-border rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus:border-cyber-emerald"
          />
        </div>
      </div>

      <div className="p-6">
        {!selectedEmployee ? (
          <div className="text-center py-12 text-industrial-muted">
            <User size={48} className="mx-auto mb-4 opacity-50" />
            <p>Selecione um funcionário para visualizar o banco de horas.</p>
          </div>
        ) : isLoading ? (
          <div className="text-center py-12 text-industrial-muted">
            <p>Carregando batidas...</p>
          </div>
        ) : report ? (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-industrial-bg rounded-xl p-6 border border-industrial-border">
                <p className="text-xs font-bold text-industrial-muted uppercase mb-1">Horas Trabalhadas</p>
                <p className="text-3xl font-black text-industrial-text">{formatHoursNeutral(report.worked)}</p>
              </div>
              <div className="bg-industrial-bg rounded-xl p-6 border border-industrial-border">
                <p className="text-xs font-bold text-industrial-muted uppercase mb-1">Horas Esperadas</p>
                <p className="text-3xl font-black text-industrial-text">{formatHoursNeutral(report.expected)}</p>
              </div>
              <div className={`rounded-xl p-6 border ${report.balance >= 0 ? 'bg-cyber-emerald/10 border-cyber-emerald' : 'bg-red-50 border-red-200'}`}>
                <p className="text-xs font-bold uppercase mb-1 flex justify-between">
                  <span className={report.balance >= 0 ? 'text-cyber-emerald' : 'text-red-600'}>Saldo Final</span>
                </p>
                <p className={`text-4xl font-black ${report.balance >= 0 ? 'text-cyber-emerald' : 'text-red-600'}`}>
                  {formatHours(report.balance)}
                </p>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-corporate-blue/20 rounded-lg p-4 text-sm text-corporate-blue flex items-start gap-3">
              <CalendarIcon size={20} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">Entenda o Cálculo</p>
                <p>O sistema identificou os dias úteis do mês com base na configuração do funcionário. Se ele tem uma jornada de <strong>{employees.find(e => e.id === selectedEmployee)?.weekly_hours || 44}h semanais</strong>, a meta diária foi dividida pelos dias que ele deve trabalhar. Esse relatório soma todas as batidas reais do mês e subtrai da meta total do mês para gerar o saldo.</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
