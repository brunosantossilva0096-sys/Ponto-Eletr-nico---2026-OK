import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import { supabase } from '../supabaseClient';
import { Employee, TimeLog, Holiday, Absence, AdminUser, Company } from '../types';
import {
  Clock,
  Calendar as CalendarIcon,
  User,
  Sliders,
  Plus,
  Trash2,
  FileText,
  Building2,
} from 'lucide-react';
import { calculateTimeBank, formatHours, formatHoursNeutral } from '../utils/timeBank';
import {
  CompanyPointRules,
  loadCompanyRules,
  saveCompanyRules,
  TimeBankAdjustment,
} from '../utils/companyRules';
import {
  formatDateBr,
  getFirstDayOfMonthStr,
  getLocalDayBoundsIso,
  toLocalDateStr,
} from '../utils/dateUtils';

export const AdminTimeBank = ({ loggedAdmin }: { loggedAdmin?: AdminUser }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(loggedAdmin?.company_id || '');
  const effectiveCompanyId = loggedAdmin?.company_id || selectedCompanyId;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');

  const [startDate, setStartDate] = useState(() => getFirstDayOfMonthStr());
  const [endDate, setEndDate] = useState(() => toLocalDateStr());

  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [rules, setRules] = useState<CompanyPointRules>(() => loadCompanyRules(effectiveCompanyId));

  // Novo lançamento de ajuste/compensação
  const [adjType, setAdjType] = useState<'credit' | 'debit'>('credit');
  const [adjHours, setAdjHours] = useState<string>('00:00');
  const [adjDate, setAdjDate] = useState<string>(() => toLocalDateStr());
  const [adjReason, setAdjReason] = useState<string>('');

  useEffect(() => {
    const fetchInitial = async () => {
      let compQuery = supabase.from('companies').select('*').order('name');
      let empQuery = supabase.from('employees').select('*, companies(*)').order('name');
      if (loggedAdmin?.company_id) {
        compQuery = compQuery.eq('id', loggedAdmin.company_id);
        empQuery = empQuery.eq('company_id', loggedAdmin.company_id);
      }
      const [{ data: compData }, { data: empData }] = await Promise.all([compQuery, empQuery]);
      if (compData) setCompanies(compData);
      if (empData) setEmployees(empData.filter((e: Employee) => e.role !== 'Admin'));
    };
    fetchInitial();
  }, [loggedAdmin?.company_id]);

  const filteredEmployees = useMemo(() => {
    if (!effectiveCompanyId) return employees;
    return employees.filter((e) => e.company_id === effectiveCompanyId);
  }, [employees, effectiveCompanyId]);

  const emp = employees.find((e) => e.id === selectedEmployee) || null;
  const activeRulesCompanyId = emp?.company_id || effectiveCompanyId;

  useEffect(() => {
    setRules(loadCompanyRules(activeRulesCompanyId));
  }, [activeRulesCompanyId]);

  const updateRules = (patch: Partial<CompanyPointRules>) => {
    const next = { ...rules, ...patch };
    setRules(next);
    saveCompanyRules(activeRulesCompanyId, next);
  };

  useEffect(() => {
    const fetchLogs = async () => {
      if (!selectedEmployee || !startDate || !endDate || startDate > endDate) return;
      setIsLoading(true);

      const { startIso, endIso } = getLocalDayBoundsIso(startDate, endDate);
      let allLogs: TimeLog[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      try {
        while (hasMore) {
          const { data, error } = await supabase
            .from('time_logs')
            .select('*')
            .eq('employee_id', selectedEmployee)
            .gte('timestamp', startIso)
            .lte('timestamp', endIso)
            .order('timestamp', { ascending: true })
            .range(from, from + pageSize - 1);

          if (error || !data || data.length === 0) {
            hasMore = false;
          } else {
            allLogs = allLogs.concat(data as TimeLog[]);
            if (data.length < pageSize) {
              hasMore = false;
            } else {
              from += pageSize;
            }
          }
        }
        setLogs(allLogs);
      } catch (err) {
        console.error('Erro ao buscar logs do banco de horas:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchAuxData = async () => {
      if (!selectedEmployee) return;
      const { data: hData } = await supabase.from('holidays').select('*');
      if (hData) setHolidays(hData);

      const { data: aData } = await supabase
        .from('absences')
        .select('*')
        .eq('employee_id', selectedEmployee);
      if (aData) setAbsences(aData);
    };

    fetchLogs();
    fetchAuxData();
  }, [selectedEmployee, startDate, endDate]);

  const report = useMemo(
    () => calculateTimeBank(emp, logs, startDate, endDate, holidays, absences, rules),
    [emp, logs, startDate, endDate, holidays, absences, rules]
  );

  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emp || !adjDate || !adjReason.trim()) {
      alert('Preencha data, horas e justificativa.');
      return;
    }
    const [hStr, mStr] = (adjHours || '00:00').split(':');
    const totalMins = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
    if (totalMins <= 0) {
      alert('Informe uma quantidade de horas maior que 00:00.');
      return;
    }
    const signed = adjType === 'credit' ? totalMins : -totalMins;
    const newAdj: TimeBankAdjustment = {
      id: `adj-${Date.now()}`,
      employeeId: emp.id,
      date: adjDate,
      minutes: signed,
      reason: adjReason.trim(),
    };
    updateRules({ adjustments: [...(rules.adjustments || []), newAdj] });
    setAdjHours('00:00');
    setAdjReason('');
  };

  const handleRemoveAdjustment = (adjId: string) => {
    updateRules({
      adjustments: (rules.adjustments || []).filter((a) => a.id !== adjId),
    });
  };

  const handleExportPDF = () => {
    if (!emp || !report) return;
    const doc = new jsPDF();
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Extrato de Banco de Horas', 14, 18);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Colaborador: ${emp.name} (${emp.role})`, 14, 26);
    doc.text(`Empresa: ${emp.companies?.name || '-'}`, 14, 31);
    doc.text(`Período: ${formatDateBr(startDate)} até ${formatDateBr(endDate)}`, 14, 36);
    doc.setFont('Helvetica', 'bold');
    doc.text(
      `Trabalhado: ${formatHoursNeutral(report.worked)} | Esperado: ${formatHoursNeutral(
        report.expected
      )} | Ajustes: ${formatHours(report.adjustmentsTotal)} | Saldo Final: ${formatHours(
        report.balance
      )}`,
      14,
      43
    );
    doc.line(14, 46, 196, 46);

    let y = 53;
    doc.setFontSize(9);
    doc.text('Data', 14, y);
    doc.text('Batidas', 42, y);
    doc.text('Trabalhado', 115, y);
    doc.text('Esperado', 145, y);
    doc.text('Saldo Dia', 175, y);
    doc.line(14, y + 2, 196, y + 2);
    y += 7;

    doc.setFont('Helvetica', 'normal');
    report.daily.forEach((d) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      const punchesStr =
        d.logs && d.logs.length > 0
          ? d.logs
              .filter((l) => !l.isFalta && !l.type?.startsWith('Falta'))
              .map((l) =>
                new Date(l.timestamp).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              )
              .join(' ')
          : d.isHoliday
          ? 'Feriado'
          : d.abono
          ? 'Abonado'
          : d.isOff5x2
          ? 'Folga 5x2'
          : '-';

      doc.text(formatDateBr(d.date), 14, y);
      doc.text(punchesStr.substring(0, 36), 42, y);
      doc.text(formatHoursNeutral(d.worked), 115, y);
      doc.text(formatHoursNeutral(d.expected), 145, y);
      doc.text(formatHours(d.balance), 175, y);
      y += 5.5;
    });

    doc.save(`banco_horas_${emp.name.replace(/\s+/g, '_')}_${endDate}.pdf`);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-industrial-border overflow-hidden">
      <div className="bg-industrial-bg/50 border-b border-industrial-border p-6 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
          <h2 className="text-xl font-bold text-industrial-text flex items-center gap-2">
            <Clock size={24} className="text-cyber-emerald" /> Banco de Horas
          </h2>

          <div className="flex flex-wrap gap-2.5 items-center">
            {!loggedAdmin?.company_id && companies.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Building2 size={15} className="text-industrial-muted" />
                <select
                  value={effectiveCompanyId}
                  onChange={(e) => {
                    setSelectedCompanyId(e.target.value);
                    setSelectedEmployee('');
                  }}
                  className="bg-white border border-industrial-border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-cyber-emerald"
                >
                  <option value="">Todas as Empresas</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="min-w-[210px] bg-white border border-industrial-border rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus:border-cyber-emerald"
            >
              <option value="">Selecione o Funcionário</option>
              {filteredEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.companies?.name && !effectiveCompanyId ? `(${e.companies.name})` : ''}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-industrial-border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-cyber-emerald"
              />
              <span className="text-industrial-muted text-xs">até</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-industrial-border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-cyber-emerald"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowRulesPanel((v) => !v)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                showRulesPanel
                  ? 'bg-emerald-50 border-cyber-emerald text-emerald-800'
                  : 'bg-white border-industrial-border text-industrial-text hover:border-cyber-emerald'
              }`}
            >
              <Sliders size={14} /> Condições & Ajustes
            </button>

            {report && emp && (
              <button
                type="button"
                onClick={handleExportPDF}
                className="px-3.5 py-2 rounded-xl bg-industrial-text text-white text-xs font-bold flex items-center gap-1.5 hover:bg-opacity-90"
              >
                <FileText size={14} /> Exportar PDF
              </button>
            )}
          </div>
        </div>

        {/* Painel de Regras Configuráveis do Banco de Horas */}
        {showRulesPanel && (
          <div className="bg-white rounded-xl border border-industrial-border p-4 space-y-4 text-xs animate-fade-in">
            <div className="font-bold text-sm text-industrial-text flex items-center gap-2">
              <Sliders size={15} className="text-cyber-emerald" />
              Regras de Cálculo do Banco de Horas (Editáveis pelo Site)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-industrial-bg/50 border border-industrial-border space-y-2">
                <label className="font-bold text-industrial-text block">
                  Tolerância Diária (CLT Art. 58 §1º)
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => updateRules({ cltDailyToleranceMinutes: 0 })}
                    className={`px-2.5 py-1 rounded border font-semibold ${
                      rules.cltDailyToleranceMinutes === 0
                        ? 'bg-cyber-emerald text-white border-cyber-emerald'
                        : 'bg-white border-industrial-border'
                    }`}
                  >
                    0 min (Exato)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRules({ cltDailyToleranceMinutes: 10 })}
                    className={`px-2.5 py-1 rounded border font-semibold ${
                      rules.cltDailyToleranceMinutes === 10
                        ? 'bg-cyber-emerald text-white border-cyber-emerald'
                        : 'bg-white border-industrial-border'
                    }`}
                  >
                    10 min (CLT)
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={rules.cltDailyToleranceMinutes}
                    onChange={(e) =>
                      updateRules({ cltDailyToleranceMinutes: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-16 px-2 py-1 rounded border border-industrial-border bg-white font-bold text-center"
                  />
                  <span className="text-industrial-muted">min</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-industrial-bg/50 border border-industrial-border space-y-2">
                <label className="font-bold text-industrial-text block">
                  Regra de Abono Parcial (Manhã / Tarde)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={rules.partialAbsenceMode}
                    onChange={(e) =>
                      updateRules({
                        partialAbsenceMode: e.target.value as 'fixed_minutes' | 'half_expected',
                      })
                    }
                    className="flex-1 px-2 py-1.5 rounded border border-industrial-border bg-white font-medium"
                  >
                    <option value="fixed_minutes">Quantidade fixa de minutos</option>
                    <option value="half_expected">Metade exata da jornada do dia (50%)</option>
                  </select>
                  {rules.partialAbsenceMode === 'fixed_minutes' && (
                    <input
                      type="number"
                      min={30}
                      max={600}
                      step={15}
                      value={rules.partialAbsenceFixedMinutes}
                      onChange={(e) =>
                        updateRules({
                          partialAbsenceFixedMinutes: Math.max(15, Number(e.target.value) || 240),
                        })
                      }
                      className="w-20 px-2 py-1.5 rounded border border-industrial-border bg-white font-bold text-center"
                      title="Minutos abonados (240 = 4 horas)"
                    />
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-industrial-bg/50 border border-industrial-border space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-industrial-text">
                  <input
                    type="checkbox"
                    checked={rules.useSchedule5x2InReportsAndTimeBank}
                    onChange={(e) =>
                      updateRules({ useSchedule5x2InReportsAndTimeBank: e.target.checked })
                    }
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Respeitar folgas e horários da Escala 5x2</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-industrial-text">
                  <input
                    type="checkbox"
                    checked={rules.ignoreIncompleteTodayInTimeBank}
                    onChange={(e) =>
                      updateRules({ ignoreIncompleteTodayInTimeBank: e.target.checked })
                    }
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>Não descontar dia atual antes do fim do expediente</span>
                </label>
              </div>
            </div>

            {/* Lançamento Manual de Ajuste / Compensação de Saldo */}
            {emp && loggedAdmin?.role !== 'convencional' && (
              <form
                onSubmit={handleAddAdjustment}
                className="pt-3 border-t border-industrial-border flex flex-wrap items-end gap-2.5"
              >
                <div>
                  <label className="block text-[10px] font-bold text-industrial-muted mb-0.5">
                    Ajuste de Saldo p/ {emp.name}
                  </label>
                  <select
                    value={adjType}
                    onChange={(e) => setAdjType(e.target.value as 'credit' | 'debit')}
                    className="px-2.5 py-1.5 rounded-lg border border-industrial-border bg-white font-semibold"
                  >
                    <option value="credit">+ Crédito de Horas</option>
                    <option value="debit">- Débito / Compensação</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-industrial-muted mb-0.5">Horas (HH:MM)</label>
                  <input
                    type="time"
                    value={adjHours}
                    onChange={(e) => setAdjHours(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-industrial-border bg-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-industrial-muted mb-0.5">Data</label>
                  <input
                    type="date"
                    value={adjDate}
                    onChange={(e) => setAdjDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-industrial-border bg-white"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-bold text-industrial-muted mb-0.5">Motivo / Observação</label>
                  <input
                    type="text"
                    placeholder="Ex: Saldo anterior, folga compensada, pagamento HE..."
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-industrial-border bg-white"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-cyber-emerald text-white font-bold flex items-center gap-1"
                >
                  <Plus size={14} /> Lançar Ajuste
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="p-6">
        {!selectedEmployee ? (
          <div className="text-center py-12 text-industrial-muted">
            <User size={48} className="mx-auto mb-4 opacity-50" />
            <p>Selecione um funcionário para visualizar e configurar o banco de horas.</p>
          </div>
        ) : !startDate || !endDate ? (
          <div className="text-center py-12 text-industrial-muted">
            <p>Selecione a data inicial e final para calcular o banco de horas.</p>
          </div>
        ) : isLoading ? (
          <div className="text-center py-12 text-industrial-muted">
            <p>Carregando batidas...</p>
          </div>
        ) : report ? (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-industrial-bg rounded-xl p-5 border border-industrial-border">
                <p className="text-xs font-bold text-industrial-muted uppercase mb-1">Horas Trabalhadas</p>
                <p className="text-2xl font-black text-industrial-text">{formatHoursNeutral(report.worked)}</p>
              </div>
              <div className="bg-industrial-bg rounded-xl p-5 border border-industrial-border">
                <p className="text-xs font-bold text-industrial-muted uppercase mb-1">Horas Esperadas</p>
                <p className="text-2xl font-black text-industrial-text">{formatHoursNeutral(report.expected)}</p>
              </div>
              <div className="bg-industrial-bg rounded-xl p-5 border border-industrial-border">
                <p className="text-xs font-bold text-industrial-muted uppercase mb-1">Ajustes Manuais</p>
                <p className="text-2xl font-black text-industrial-text">{formatHours(report.adjustmentsTotal)}</p>
              </div>
              <div
                className={`rounded-xl p-5 border ${
                  report.balance >= 0 ? 'bg-cyber-emerald/10 border-cyber-emerald' : 'bg-red-50 border-red-200'
                }`}
              >
                <p className="text-xs font-bold uppercase mb-1">
                  <span className={report.balance >= 0 ? 'text-cyber-emerald' : 'text-red-600'}>
                    Saldo Final {report.balance >= 0 ? '(Positivo)' : '(Negativo)'}
                  </span>
                </p>
                <p
                  className={`text-3xl font-black ${
                    report.balance >= 0 ? 'text-cyber-emerald' : 'text-red-600'
                  }`}
                >
                  {formatHours(report.balance)}
                </p>
              </div>
            </div>

            {report.adjustments.length > 0 && (
              <div className="bg-slate-50 rounded-xl border border-industrial-border p-4 space-y-2">
                <div className="text-xs font-bold text-industrial-text">
                  Ajustes / Compensações Lançados no Período
                </div>
                <div className="space-y-1.5">
                  {report.adjustments.map((adj) => (
                    <div
                      key={adj.id}
                      className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-industrial-border text-xs"
                    >
                      <div>
                        <span className="font-bold mr-2">{formatDateBr(adj.date)}</span>
                        <span
                          className={`font-bold mr-2 ${
                            adj.minutes >= 0 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {formatHours(adj.minutes)}
                        </span>
                        <span className="text-industrial-muted">{adj.reason}</span>
                      </div>
                      {loggedAdmin?.role !== 'convencional' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAdjustment(adj.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remover ajuste"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.daily && report.daily.length > 0 && (
              <div className="bg-industrial-bg/30 rounded-xl border border-industrial-border overflow-hidden">
                <div className="bg-industrial-bg px-4 py-2.5 border-b border-industrial-border font-bold text-sm text-industrial-text">
                  Detalhamento Diário ({report.daily.length} dias)
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {report.daily.map((day) => (
                    <div
                      key={day.date}
                      className="bg-white text-sm p-3 rounded-lg border border-industrial-border shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1 flex-wrap">
                        <p className="font-bold text-industrial-text text-xs">
                          {formatDateBr(day.date)}
                        </p>
                        {day.isHoliday && (
                          <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded font-semibold border border-amber-200">
                            Feriado
                          </span>
                        )}
                        {day.isOff5x2 && !day.isHoliday && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold border border-emerald-200">
                            Folga 5x2
                          </span>
                        )}
                        {day.abono && (
                          <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium border border-purple-200">
                            Abono{' '}
                            {day.abono.shift === 'manha'
                              ? 'Manhã'
                              : day.abono.shift === 'tarde'
                              ? 'Tarde'
                              : 'Integral'}
                          </span>
                        )}
                        {day.inProgress && (
                          <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold border border-blue-200">
                            Em andamento
                          </span>
                        )}
                      </div>

                      {day.logs && day.logs.length > 0 && (
                        <div className="text-[10px] text-industrial-muted mb-2 bg-industrial-bg p-1.5 rounded flex flex-wrap gap-1">
                          {day.logs.map((l: any) => (
                            <span
                              key={l.id}
                              className="font-mono bg-white px-1 border border-industrial-border rounded"
                            >
                              {l.isFalta || l.type?.startsWith('Falta')
                                ? l.type
                                : new Date(l.timestamp).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-[11px] text-industrial-muted mb-1">
                        Trab: {formatHoursNeutral(day.worked)} | Esp: {formatHoursNeutral(day.expected)}
                      </p>
                      <p
                        className={`text-xs font-bold ${
                          day.balance >= 0 ? 'text-cyber-emerald' : 'text-red-600'
                        }`}
                      >
                        Saldo: {formatHours(day.balance)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-corporate-blue/20 rounded-lg p-4 text-xs text-corporate-blue flex items-start gap-3">
              <CalendarIcon size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">Cálculo Transparente e Configurável</p>
                <p>
                  Período de {formatDateBr(startDate)} a {formatDateBr(endDate)}. Dias futuros não descontam horas antecipadamente. Você pode alterar tolerância CLT, abonos parciais, integração com a Escala 5x2 e ajustes manuais clicando em <strong>Condições & Ajustes</strong> acima.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
