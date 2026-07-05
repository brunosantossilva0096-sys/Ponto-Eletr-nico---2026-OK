import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Absence, Employee } from '../types';
import { Save, CalendarRange, Plus, Trash2 } from 'lucide-react';

export const AdminAbsences = () => {
  const [absences, setAbsences] = useState<(Absence & { employees: Employee })[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchAbsences = async () => {
    const { data } = await supabase.from('absences').select('*, employees(*)').order('start_date', { ascending: false });
    if (data) setAbsences(data as any);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('*').order('name');
    if (data) setEmployees(data);
  };

  useEffect(() => {
    fetchAbsences();
    fetchEmployees();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate || !reason) return;

    if (editingId) {
      await supabase.from('absences').update({ employee_id: employeeId, start_date: startDate, end_date: endDate, reason, approved_by: approvedBy }).eq('id', editingId);
    } else {
      await supabase.from('absences').insert([{ employee_id: employeeId, start_date: startDate, end_date: endDate, reason, approved_by: approvedBy }]);
    }
    
    setEmployeeId('');
    setStartDate('');
    setEndDate('');
    setReason('');
    setApprovedBy('');
    setEditingId(null);
    fetchAbsences();
  };

  const handleEdit = (a: Absence) => {
    setEditingId(a.id);
    setEmployeeId(a.employee_id);
    setStartDate(a.start_date);
    setEndDate(a.end_date);
    setReason(a.reason);
    setApprovedBy(a.approved_by || '');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja realmente excluir este abono?')) {
      await supabase.from('absences').delete().eq('id', id);
      fetchAbsences();
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] overflow-y-auto">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <CalendarRange size={18} className="text-cyber-emerald"/> 
          {editingId ? 'Editar Abono' : 'Lançar Abono'}
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Funcionário</label>
            <select 
              required
              value={employeeId} 
              onChange={e => setEmployeeId(e.target.value)} 
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none"
            >
              <option value="">Selecione...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Início</label>
              <input 
                type="date" 
                required
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Fim</label>
              <input 
                type="date" 
                required
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Motivo / Justificativa</label>
            <textarea 
              required
              placeholder="Ex: Atestado médico de 2 dias"
              value={reason} 
              onChange={e => setReason(e.target.value)} 
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none min-h-[80px]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Aprovado por (Opcional)</label>
            <input 
              type="text" 
              placeholder="Nome do gestor"
              value={approvedBy} 
              onChange={e => setApprovedBy(e.target.value)} 
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none"
            />
          </div>
          
          <div className="flex gap-2 pt-2">
            <button type="submit" className="flex-1 bg-cyber-emerald text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-opacity-90">
              <Save size={16} /> Salvar
            </button>
            {editingId && (
              <button 
                type="button"
                onClick={() => { setEditingId(null); setEmployeeId(''); setStartDate(''); setEndDate(''); setReason(''); setApprovedBy(''); }}
                className="px-4 bg-industrial-bg text-industrial-muted rounded-lg font-semibold hover:bg-industrial-border"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] flex flex-col">
        <h2 className="font-bold text-lg mb-4">Lista de Abonos e Faltas Justificadas</h2>
        <div className="flex-1 overflow-auto border border-industrial-border rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-industrial-bg text-industrial-muted sticky top-0">
              <tr>
                <th className="p-3 font-semibold">Período</th>
                <th className="p-3 font-semibold">Funcionário</th>
                <th className="p-3 font-semibold">Motivo</th>
                <th className="p-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border">
              {absences.map(a => (
                <tr key={a.id} className="hover:bg-industrial-bg/50">
                  <td className="p-3 font-semibold">
                    <span className="block">{new Date(a.start_date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</span>
                    {a.start_date !== a.end_date && (
                      <span className="text-industrial-muted text-xs">até {new Date(a.end_date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="block font-medium">{a.employees?.name}</span>
                    <span className="text-xs text-industrial-muted">{a.employees?.cpf}</span>
                  </td>
                  <td className="p-3">
                    <p className="line-clamp-2 text-xs text-industrial-text">{a.reason}</p>
                    {a.approved_by && <span className="text-[10px] text-cyber-emerald">Resp: {a.approved_by}</span>}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => handleEdit(a)} className="text-corporate-blue hover:underline mr-3 text-xs font-semibold">Editar</button>
                    <button onClick={() => handleDelete(a.id)} className="text-red-500 hover:underline text-xs font-semibold">Excluir</button>
                  </td>
                </tr>
              ))}
              {absences.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-industrial-muted">Nenhum abono lançado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
