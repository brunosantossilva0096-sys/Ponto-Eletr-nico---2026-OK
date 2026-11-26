import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Absence, Employee, AdminUser, Company } from '../types';
import { Save, CalendarRange, Search, Building2 } from 'lucide-react';
import { formatDateBr } from '../utils/dateUtils';

export const AdminAbsences = ({ loggedAdmin }: { loggedAdmin?: AdminUser }) => {
  const [absences, setAbsences] = useState<(Absence & { employees: Employee })[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(loggedAdmin?.company_id || '');
  const [search, setSearch] = useState('');

  const effectiveCompanyId = loggedAdmin?.company_id || selectedCompanyId;

  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shiftMode, setShiftMode] = useState<'integral' | 'manha' | 'tarde' | 'custom_hours'>('integral');
  const [customHoursTime, setCustomHoursTime] = useState('02:00');
  const [reason, setReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchAbsences = async () => {
    const { data } = await supabase
      .from('absences')
      .select('*, employees(*, companies(*))')
      .order('start_date', { ascending: false });
    if (data) {
      let list = data as (Absence & { employees: Employee })[];
      if (loggedAdmin?.company_id) {
        list = list.filter((a) => a.employees?.company_id === loggedAdmin.company_id);
      }
      setAbsences(list);
    }
  };

  const fetchEmployeesAndCompanies = async () => {
    let empQuery = supabase.from('employees').select('*, companies(*)').order('name');
    let compQuery = supabase.from('companies').select('*').order('name');
    if (loggedAdmin?.company_id) {
      empQuery = empQuery.eq('company_id', loggedAdmin.company_id);
      compQuery = compQuery.eq('id', loggedAdmin.company_id);
    }
    const [{ data: empData }, { data: compData }] = await Promise.all([empQuery, compQuery]);
    if (empData) setEmployees(empData.filter((e: Employee) => e.role !== 'Admin'));
    if (compData) setCompanies(compData);
  };

  useEffect(() => {
    fetchAbsences();
    fetchEmployeesAndCompanies();
  }, [loggedAdmin?.company_id]);

  const formEmployees = useMemo(() => {
    if (!effectiveCompanyId) return employees;
    return employees.filter((e) => e.company_id === effectiveCompanyId);
  }, [employees, effectiveCompanyId]);

  const filteredAbsences = useMemo(() => {
    return absences.filter((a) => {
      if (effectiveCompanyId && a.employees?.company_id !== effectiveCompanyId) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        a.employees?.name?.toLowerCase().includes(s) ||
        a.reason?.toLowerCase().includes(s) ||
        a.employees?.cpf?.includes(search)
      );
    });
  }, [absences, effectiveCompanyId, search]);

  const resetForm = () => {
    setEmployeeId('');
    setStartDate('');
    setEndDate('');
    setShiftMode('integral');
    setCustomHoursTime('02:00');
    setReason('');
    setApprovedBy('');
    setEditingId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate || !reason.trim()) return;
    if (endDate < startDate) {
      alert('A Data Fim não pode ser anterior à Data Início.');
      return;
    }

    let cleanReason = reason.replace(/\s*\[ABONO_MIN:\d+\]/g, '').trim();
    let dbShift: 'integral' | 'manha' | 'tarde' = 'integral';

    if (shiftMode === 'custom_hours') {
      const [h, m] = (customHoursTime || '02:00').split(':').map(Number);
      const mins = (h || 0) * 60 + (m || 0);
      if (mins <= 0) {
        alert('Informe a quantidade de horas a abonar.');
        return;
      }
      dbShift = 'manha'; // Compatível com a coluna existente no banco
      cleanReason = `${cleanReason} [ABONO_MIN:${mins}]`;
    } else {
      dbShift = shiftMode;
    }

    const payload = {
      employee_id: employeeId,
      start_date: startDate,
      end_date: endDate,
      shift: dbShift,
      reason: cleanReason,
      approved_by: approvedBy.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from('absences').update(payload).eq('id', editingId);
      if (error) {
        alert('Erro ao atualizar abono: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('absences').insert([payload]);
      if (error) {
        alert('Erro ao salvar abono: ' + error.message);
        return;
      }
    }

    resetForm();
    fetchAbsences();
  };

  const handleEdit = (a: Absence) => {
    setEditingId(a.id);
    setEmployeeId(a.employee_id);
    setStartDate(a.start_date);
    setEndDate(a.end_date);

    const customMatch = (a.reason || '').match(/\[ABONO_MIN:(\d+)\]/);
    if (customMatch) {
      const mins = Number(customMatch[1]) || 120;
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      setShiftMode('custom_hours');
      setCustomHoursTime(`${hh}:${mm}`);
      setReason(a.reason.replace(/\s*\[ABONO_MIN:\d+\]/g, '').trim());
    } else {
      setShiftMode(a.shift || 'integral');
      setReason(a.reason);
    }
    setApprovedBy(a.approved_by || '');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja realmente excluir este abono?')) {
      const { error } = await supabase.from('absences').delete().eq('id', id);
      if (error) {
        alert('Erro ao excluir abono: ' + error.message);
      } else {
        fetchAbsences();
      }
    }
  };

  const formatShiftBadge = (a: Absence) => {
    const customMatch = (a.reason || '').match(/\[ABONO_MIN:(\d+)\]/);
    if (customMatch) {
      const mins = Number(customMatch[1]);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `Parcial (${h}h${m > 0 ? `${String(m).padStart(2, '0')}m` : ''})`;
    }
    return a.shift === 'manha' ? 'Manhã' : a.shift === 'tarde' ? 'Tarde' : 'Integral';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] overflow-y-auto">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <CalendarRange size={18} className="text-cyber-emerald" />
          {editingId ? 'Editar Abono' : 'Lançar Abono / Declaração'}
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Funcionário</label>
            <select
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald outline-none"
            >
              <option value="">Selecione...</option>
              {formEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.companies?.name && !effectiveCompanyId ? `(${emp.companies.name})` : ''}
                </option>
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
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                }}
                className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Fim</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Tipo / Horas Abonadas</label>
            <select
              value={shiftMode}
              onChange={(e) => setShiftMode(e.target.value as any)}
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald outline-none"
            >
              <option value="integral">Integral (Dia Todo)</option>
              <option value="manha">Meio Período — Manhã</option>
              <option value="tarde">Meio Período — Tarde</option>
              <option value="custom_hours">Horas Específicas (Ex: Declaração Médica)</option>
            </select>
          </div>
          {shiftMode === 'custom_hours' && (
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">
                Quantidade de Horas Abonadas por Dia (HH:MM)
              </label>
              <input
                type="time"
                required
                value={customHoursTime}
                onChange={(e) => setCustomHoursTime(e.target.value)}
                className="w-full bg-industrial-bg border border-cyber-emerald rounded-lg p-2 text-sm font-bold outline-none"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Motivo / Justificativa</label>
            <textarea
              required
              placeholder="Ex: Atestado médico, declaração de comparecimento, férias..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald outline-none min-h-[80px]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Aprovado por (Opcional)</label>
            <input
              type="text"
              placeholder="Nome do gestor"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald outline-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 bg-cyber-emerald text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-opacity-90"
            >
              <Save size={16} /> Salvar
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 bg-industrial-bg text-industrial-muted rounded-lg font-semibold hover:bg-industrial-border"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="font-bold text-lg">Abonos e Faltas Justificadas ({filteredAbsences.length})</h2>
          <div className="flex items-center gap-2">
            {!loggedAdmin?.company_id && companies.length > 0 && (
              <div className="flex items-center gap-1">
                <Building2 size={14} className="text-industrial-muted" />
                <select
                  value={effectiveCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="bg-industrial-bg border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none"
                >
                  <option value="">Todas as Empresas</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2 text-industrial-muted" />
              <input
                type="text"
                placeholder="Buscar colaborador ou motivo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-industrial-bg border border-industrial-border rounded-lg text-xs outline-none focus:border-cyber-emerald"
              />
            </div>
          </div>
        </div>

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
              {filteredAbsences.map((a) => (
                <tr key={a.id} className="hover:bg-industrial-bg/50">
                  <td className="p-3 font-semibold">
                    <span className="block">{formatDateBr(a.start_date)}</span>
                    {a.start_date !== a.end_date && (
                      <span className="text-industrial-muted text-xs">até {formatDateBr(a.end_date)}</span>
                    )}
                    <span className="block mt-1 bg-industrial-border/50 text-industrial-muted text-[10px] font-bold px-2 py-0.5 rounded uppercase w-fit">
                      {formatShiftBadge(a)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="block font-medium">{a.employees?.name}</span>
                    <span className="text-xs text-industrial-muted">{a.employees?.cpf}</span>
                    {a.employees?.companies?.name && !effectiveCompanyId && (
                      <span className="text-[11px] text-emerald-700 block font-medium mt-0.5">
                        {a.employees.companies.name}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <p className="line-clamp-2 text-xs text-industrial-text">
                      {(a.reason || '').replace(/\s*\[ABONO_MIN:\d+\]/g, '')}
                    </p>
                    {a.approved_by && <span className="text-[10px] text-cyber-emerald">Resp: {a.approved_by}</span>}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleEdit(a)}
                      className="text-corporate-blue hover:underline mr-3 text-xs font-semibold"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      className="text-red-500 hover:underline text-xs font-semibold"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {filteredAbsences.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-industrial-muted">
                    Nenhum abono encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
