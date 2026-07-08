import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { TimeLog, Employee } from '../types';
import { Clock, Calendar as CalendarIcon, User } from 'lucide-react';
import { calculateTimeBank, formatHours, formatHoursNeutral } from '../utils/timeBank';

export const AdminTimeBank = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  
  // Define default dates: first day of current month to today
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  
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
      if (!selectedEmployee || !startDate || !endDate) return;
      setIsLoading(true);
      
      const startDateTime = `${startDate}T00:00:00`;
      const endDateTime = `${endDate}T23:59:59`;

      const { data } = await supabase
        .from('time_logs')
        .select('*')
        .eq('employee_id', selectedEmployee)
        .gte('timestamp', startDateTime)
        .lte('timestamp', endDateTime)
        .order('timestamp', { ascending: true });
        
      if (data) setLogs(data);
      setIsLoading(false);
    };

    fetchLogs();
  }, [selectedEmployee, startDate, endDate]);

  const emp = employees.find(e => e.id === selectedEmployee) || null;
  const report = calculateTimeBank(emp, logs, startDate, endDate);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-industrial-border overflow-hidden">
      <div className="bg-industrial-bg/50 border-b border-industrial-border p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <h2 className="text-xl font-bold text-industrial-text flex items-center gap-2">
          <Clock size={24} className="text-cyber-emerald" /> Banco de Horas
        </h2>
        
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <select 
            value={selectedEmployee} 
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="flex-1 min-w-[200px] bg-white border border-industrial-border rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus:border-cyber-emerald"
          >
            <option value="">Selecione o Funcionário</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          
          <div className="flex items-center gap-2">
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white border border-industrial-border rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus:border-cyber-emerald"
            />
            <span className="text-industrial-muted">até</span>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white border border-industrial-border rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus:border-cyber-emerald"
            />
          </div>
        </div>
      </div>

      <div className="p-6">
        {!selectedEmployee ? (
          <div className="text-center py-12 text-industrial-muted">
            <User size={48} className="mx-auto mb-4 opacity-50" />
            <p>Selecione um funcionário para visualizar o banco de horas.</p>
          </div>
        ) : (!startDate || !endDate) ? (
          <div className="text-center py-12 text-industrial-muted">
            <p>Selecione a data inicial e final para calcular o banco de horas.</p>
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
                  <span className={report.balance >= 0 ? 'text-cyber-emerald' : 'text-red-600'}>Saldo Final {report.balance >= 0 ? '(Positivo)' : '(Negativo)'}</span>
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
                <p>O sistema identificou os dias úteis entre {new Date(`${startDate}T12:00:00`).toLocaleDateString('pt-BR')} e {new Date(`${endDate}T12:00:00`).toLocaleDateString('pt-BR')} com base na configuração do funcionário. Se ele tem uma jornada de <strong>{emp?.weekly_hours || 44}h semanais</strong>, a meta diária foi dividida pelos dias que ele deve trabalhar. Esse relatório soma todas as batidas reais do período e subtrai da meta total do período para gerar o saldo.</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
