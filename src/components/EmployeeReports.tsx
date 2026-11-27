import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { TimeLog, Employee, Holiday, Absence } from '../types';
import { FileText, ArrowLeft, Clock, Edit2, Trash2, X, Calculator, Calendar, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { calculateTimeBank, formatHours, formatHoursNeutral } from '../utils/timeBank';
import { generateAbsences } from '../utils/faltas';
import {
  buildLocalTimestampIso,
  formatDateBr,
  getFirstDayOfMonthStr,
  toLocalDateStr,
  toLocalTimeStr,
} from '../utils/dateUtils';
import {
  extractCloudSchedule5x2FromEmployees,
  getCompanyScheduleStorageKey,
  resolveEmployeeDayFrom5x2,
} from '../utils/companyRules';

export const EmployeeReports = ({
  employee,
  onBack,
  isAdmin = false,
}: {
  employee: Employee;
  onBack: () => void;
  isAdmin?: boolean;
}) => {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [startDate, setStartDate] = useState(() => getFirstDayOfMonthStr());
  const [endDate, setEndDate] = useState(() => toLocalDateStr());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [scheduleSyncedTick, setScheduleSyncedTick] = useState(0);

  const fetchLogs = async () => {
    let allLogs: TimeLog[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    try {
      while (hasMore) {
        const { data, error } = await supabase
          .from('time_logs')
          .select('*')
          .eq('employee_id', employee.id)
          .order('timestamp', { ascending: false })
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
      console.error('Erro ao buscar histórico do funcionário:', err);
    }
  };

  const fetchAuxData = async () => {
    const { data: hData } = await supabase.from('holidays').select('*');
    if (hData) setHolidays(hData);

    const { data: aData } = await supabase
      .from('absences')
      .select('*')
      .eq('employee_id', employee.id);
    if (aData) setAbsences(aData);

    // Sincroniza a Escala 5x2 da nuvem (Supabase) para a empresa do funcionário
    try {
      let q = supabase.from('employees').select('*');
      if (employee.company_id) q = q.eq('company_id', employee.company_id);
      const { data: compEmps } = await q;
      if (compEmps && compEmps.length > 0) {
        const cloudCfg = extractCloudSchedule5x2FromEmployees(compEmps as Employee[], employee.company_id || '');
        if (cloudCfg) {
          localStorage.setItem(getCompanyScheduleStorageKey(employee.company_id || ''), JSON.stringify(cloudCfg));
          setScheduleSyncedTick((t) => t + 1);
        }
      }
    } catch {
      // usa cache local se offline
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchAuxData();
  }, [employee.id]);

  const baseFiltered = logs.filter((l) => {
    const logDate = toLocalDateStr(l.timestamp);
    if (startDate && logDate < startDate) return false;
    if (endDate && logDate > endDate) return false;
    return true;
  });

  const generatedAbsences = generateAbsences(logs, [employee], startDate, endDate, holidays, absences);
  const filtered = [...baseFiltered, ...generatedAbsences].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );

  const timeBankReport = calculateTimeBank(employee, logs, startDate, endDate, holidays, absences);

  // Calcula a Escala 5x2 vigente da semana atual (Dom a Sáb) para exibir e imprimir no espelho
  const currentWeekSchedule = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0=Dom..6=Sab
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
    const shortNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
      const iso = toLocalDateStr(d);
      const res = resolveEmployeeDayFrom5x2(employee, iso, true);
      return {
        dow: i,
        short: shortNames[i],
        iso,
        dateShort: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        res,
      };
    });
    const has5x2 = days.some((d) => d.res && d.res.foundIn5x2);
    return { has5x2, days, label: `${days[0].dateShort} a ${days[6].dateShort}` };
  }, [employee, scheduleSyncedTick]);

  const handlePrintMyWeekSchedule = () => {
    const win = window.open('', '_blank', 'width=900,height=520');
    if (!win) {
      alert('Permita pop-ups no navegador para abrir a tela de impressão.');
      return;
    }
    const cellsHtml = currentWeekSchedule.days
      .map((d) => {
        const isSun = d.dow === 0;
        if (isSun) {
          return `<td class="dsr">DSR</td>`;
        }
        if (d.res && !d.res.isWorkDay) {
          return `<td class="folga">FOLGA</td>`;
        }
        if (d.res && d.res.isWorkDay) {
          return `<td><div><strong>${d.res.workStart}–${d.res.workEnd}</strong></div>${
            d.res.breakStart && d.res.breakEnd ? `<div class="sub">Int. ${d.res.breakStart}–${d.res.breakEnd}</div>` : ''
          }</td>`;
        }
        return `<td>-</td>`;
      })
      .join('');
    const headersHtml = currentWeekSchedule.days
      .map((d) => `<th>${d.short}<br/><span class="sub">${d.dateShort}</span></th>`)
      .join('');
    win.document.open();
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Minha Escala 5x2 — ${employee.name}</title>
      <style>
        @page { size: landscape; margin: 12mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; padding: 16px; }
        h1 { font-size: 18px; margin: 0 0 4px 0; }
        .meta { font-size: 12px; color: #475569; margin-bottom: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px 6px; text-align: center; }
        th { background: #1e3a5f; color: #fff; }
        td.folga { background: #d1fae5; color: #065f46; font-weight: bold; }
        td.dsr { background: #fef3c7; color: #92400e; font-weight: bold; }
        .sub { font-size: 10px; opacity: 0.8; }
      </style></head><body>
      <h1>Escala 5x2 Vigente — Semana ${currentWeekSchedule.label}</h1>
      <div class="meta"><strong>Colaborador:</strong> ${employee.name} • <strong>Empresa:</strong> ${employee.companies?.name || '-'}</div>
      <table><thead><tr>${headersHtml}</tr></thead><tbody><tr>${cellsHtml}</tr></tbody></table>
      <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
      </body></html>`);
    win.document.close();
  };

  const [editingLog, setEditingLog] = useState<TimeLog | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editType, setEditType] = useState('Entrada Manhã');
  const [editReason, setEditReason] = useState('');

  const handleDelete = async (id: string) => {
    if (
      confirm(
        'Atenção: Você está prestes a excluir um registro de ponto. Esta ação é irreversível. Deseja continuar?'
      )
    ) {
      const { error } = await supabase.from('time_logs').delete().eq('id', id);
      if (error) {
        alert('Erro ao excluir batida: ' + error.message);
      } else {
        fetchLogs();
      }
    }
  };

  const openEdit = (log: TimeLog) => {
    setEditingLog(log);
    const d = new Date(log.timestamp);
    setEditDate(toLocalDateStr(d));
    setEditTime(toLocalTimeStr(d));
    setEditType(log.type || 'Entrada Manhã');
    setEditReason(log.edit_reason || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog || !editDate || !editTime || !editReason.trim()) {
      alert('Preencha todos os campos, incluindo o motivo da alteração.');
      return;
    }

    const newTimestamp = buildLocalTimestampIso(editDate, editTime);

    const { error } = await supabase
      .from('time_logs')
      .update({
        timestamp: newTimestamp,
        type: editType,
        is_edited: true,
        original_timestamp: editingLog.original_timestamp || editingLog.timestamp,
        edit_reason: editReason.trim(),
      })
      .eq('id', editingLog.id);

    if (error) {
      alert('Erro ao salvar alteração: ' + error.message);
      return;
    }

    setEditingLog(null);
    fetchLogs();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Espelho de Ponto Individual', 14, 20);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Funcionário: ${employee.name}`, 14, 27);
    doc.text(`CPF: ${employee.cpf}`, 14, 32);
    if (employee.companies?.name) {
      doc.text(`Empresa: ${employee.companies.name}`, 14, 37);
      if (employee.companies?.cnpj) {
        doc.text(`CNPJ: ${employee.companies.cnpj}`, 14, 42);
      }
    }

    let currentY = employee.companies?.cnpj ? 47 : 42;
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, currentY);

    if (startDate || endDate) {
      currentY += 5;
      doc.text(
        `Período: ${startDate ? formatDateBr(startDate) : 'Início'} até ${
          endDate ? formatDateBr(endDate) : 'Fim'
        }`,
        14,
        currentY
      );
    }

    let y = currentY + 8;

    if (timeBankReport) {
      doc.setFont('Helvetica', 'bold');
      doc.text('Resumo do Banco de Horas:', 14, y);
      doc.setFont('Helvetica', 'normal');
      y += 5;
      doc.text(
        `Trabalhado: ${formatHoursNeutral(timeBankReport.worked)} | Esperado: ${formatHoursNeutral(
          timeBankReport.expected
        )} | Saldo: ${formatHours(timeBankReport.balance)}`,
        14,
        y
      );
      y += 8;
    } else {
      y = 58;
    }

    doc.line(14, y - 4, 196, y - 4);

    doc.setFont('Helvetica', 'bold');
    doc.text('Data/Hora', 14, y);
    doc.text('Tipo', 55, y);
    doc.text('Método', 90, y);
    doc.text('Distância GPS', 130, y);
    doc.text('Hash', 165, y);

    doc.line(14, y + 2, 196, y + 2);
    y += 8;

    doc.setFont('Helvetica', 'normal');
    filtered.forEach((log) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
        doc.setFont('Helvetica', 'bold');
        doc.text('Data/Hora', 14, y);
        doc.text('Tipo', 55, y);
        doc.text('Método', 90, y);
        doc.text('Distância GPS', 130, y);
        doc.text('Hash', 165, y);
        doc.line(14, y + 2, 196, y + 2);
        y += 8;
        doc.setFont('Helvetica', 'normal');
      }

      const dateVal = new Date(log.timestamp);
      const dateTimeStr =
        log.isFalta || log.type?.startsWith('Falta')
          ? dateVal.toLocaleDateString('pt-BR')
          : `${dateVal.toLocaleDateString('pt-BR')} ${dateVal.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}`;
      const typeStr = log.type || 'Batida';
      const methodStr = log.verification_method || '';
      const gpsStr = log.distance ? `${Math.round(log.distance)}m` : 'Sem GPS';
      const hashStr = log.hash_assinatura ? log.hash_assinatura.substring(0, 12) + '...' : '-';

      doc.text(dateTimeStr, 14, y);
      doc.text(typeStr.substring(0, 18), 55, y);
      doc.text(methodStr.substring(0, 16), 90, y);
      doc.text(gpsStr, 130, y);
      doc.text(hashStr, 165, y);

      y += 6;
    });

    doc.save(`espelho_ponto_${employee.name}_${Date.now()}.pdf`);
  };

  return (
    <div className={isAdmin ? '' : 'min-h-screen bg-industrial-bg flex flex-col items-center justify-center p-4'}>
      <div className="w-full max-w-4xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-industrial-border flex flex-col h-[650px] p-6 relative animate-fade-in">
        <div className="flex justify-between items-center mb-6">
          <button
            type="button"
            onClick={onBack}
            className="text-industrial-muted hover:text-industrial-text flex items-center gap-2 text-sm font-semibold"
          >
            <ArrowLeft size={16} /> Voltar
          </button>

          <h2 className="font-bold text-lg flex items-center gap-2">
            <Clock size={18} className="text-cyber-emerald" /> Espelho de Ponto
          </h2>

          <button
            type="button"
            onClick={handleExportPDF}
            className="bg-industrial-text text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-opacity-90 transition-all"
          >
            <FileText size={16} /> Exportar PDF
          </button>
        </div>

        <div className="bg-industrial-bg/50 p-4 rounded-2xl border border-industrial-border mb-4 text-sm text-industrial-text">
          <p>
            <strong>Nome:</strong> {employee.name}
          </p>
          <p>
            <strong>CPF:</strong> {employee.cpf}
          </p>
        </div>

        {/* Escala 5x2 Vigente da Semana */}
        {currentWeekSchedule.has5x2 && (
          <div className="mb-4 p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                <Calendar size={15} className="text-cyber-emerald" />
                <span>Escala 5x2 Vigente — Semana {currentWeekSchedule.label}</span>
              </div>
              <button
                type="button"
                onClick={handlePrintMyWeekSchedule}
                className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold flex items-center gap-1 transition-colors"
              >
                <Printer size={12} /> Imprimir Escala
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {currentWeekSchedule.days.map((d) => {
                const isSun = d.dow === 0;
                const isOff = !isSun && d.res && !d.res.isWorkDay;
                return (
                  <div
                    key={d.iso}
                    className={`p-2 rounded-xl border text-[11px] ${
                      isSun
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : isOff
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                        : 'bg-white border-industrial-border text-industrial-text'
                    }`}
                  >
                    <div className="font-bold">
                      {d.short} <span className="font-normal text-[10px] opacity-75">{d.dateShort}</span>
                    </div>
                    <div className="mt-1 font-bold text-[10px]">
                      {isSun
                        ? 'DSR'
                        : isOff
                        ? 'FOLGA'
                        : d.res
                        ? `${d.res.workStart}–${d.res.workEnd}`
                        : '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-industrial-bg border border-industrial-border rounded-lg text-sm focus:border-cyber-emerald focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-industrial-bg border border-industrial-border rounded-lg text-sm focus:border-cyber-emerald focus:outline-none"
            />
          </div>
        </div>

        {timeBankReport && (
          <div className="mb-4 p-4 bg-industrial-bg rounded-xl border border-industrial-border flex flex-col md:flex-row gap-6 justify-between items-center">
            <div className="flex items-center gap-3 text-industrial-text">
              <Calculator size={24} className="text-cyber-emerald" />
              <div>
                <p className="font-bold">Resumo do Período</p>
                <p className="text-xs text-industrial-muted">
                  De {formatDateBr(startDate)} até {formatDateBr(endDate)}
                </p>
              </div>
            </div>
            <div className="flex gap-6 w-full md:w-auto">
              <div>
                <p className="text-xs font-bold text-industrial-muted uppercase">Trabalhado</p>
                <p className="font-bold">{formatHoursNeutral(timeBankReport.worked)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-industrial-muted uppercase">Esperado</p>
                <p className="font-bold">{formatHoursNeutral(timeBankReport.expected)}</p>
              </div>
              <div
                className={`px-4 py-1 rounded-lg ${
                  timeBankReport.balance >= 0
                    ? 'bg-cyber-emerald/10 text-cyber-emerald'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                <p className="text-xs font-bold uppercase">
                  Saldo {timeBankReport.balance >= 0 ? '(Positivo)' : '(Negativo)'}
                </p>
                <p className="font-black text-lg">{formatHours(timeBankReport.balance)}</p>
              </div>
            </div>
          </div>
        )}

        {timeBankReport && timeBankReport.daily && timeBankReport.daily.length > 0 && (
          <div className="mb-4 bg-industrial-bg/30 rounded-xl border border-industrial-border overflow-hidden">
            <div className="bg-industrial-bg px-4 py-2 border-b border-industrial-border font-bold text-sm text-industrial-text">
              Saldo por Dia
            </div>
            <div className="p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[140px] overflow-y-auto custom-scrollbar">
              {timeBankReport.daily.map((day) => (
                <div
                  key={day.date}
                  className="bg-white text-sm p-2.5 rounded-lg border border-industrial-border shadow-xs"
                >
                  <div className="flex items-center justify-between gap-1 mb-1 flex-wrap">
                    <p className="font-bold text-industrial-text text-xs">{formatDateBr(day.date)}</p>
                    {day.isOff5x2 && (
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1 py-0.5 rounded font-semibold border border-emerald-200">
                        Folga 5x2
                      </span>
                    )}
                    {day.abono && (
                      <span className="text-[9px] bg-purple-50 text-purple-700 px-1 py-0.5 rounded font-medium border border-purple-200">
                        Abonado
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-industrial-muted mb-0.5">
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

        <div className="flex-1 overflow-auto border border-industrial-border rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-industrial-bg text-industrial-muted sticky top-0">
              <tr>
                <th className="p-3 font-semibold">Data/Hora</th>
                <th className="p-3 font-semibold">Tipo</th>
                <th className="p-3 font-semibold">Método</th>
                <th className="p-3 font-semibold">Localização GPS</th>
                <th className="p-3 font-semibold">Hash de Assinatura</th>
                {isAdmin && <th className="p-3 font-semibold text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border">
              {filtered.map((log) => (
                <tr
                  key={log.id}
                  className={`hover:bg-industrial-bg/50 ${
                    log.isFalta
                      ? 'bg-red-50/80'
                      : log.is_manual
                      ? 'bg-blue-50/50'
                      : log.is_edited
                      ? 'bg-orange-50/50'
                      : ''
                  }`}
                >
                  <td className="p-3">
                    <span className="font-semibold block">
                      {new Date(log.timestamp).toLocaleDateString('pt-BR')}
                    </span>
                    {!(log.isFalta || log.type?.startsWith('Falta')) && (
                      <span className="text-industrial-muted text-xs">
                        {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    )}
                    {log.isFalta ? (
                      <span className="text-[10px] text-red-600 font-bold uppercase tracking-wider block mt-1">
                        Falta
                      </span>
                    ) : log.is_manual ? (
                      <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mt-1">
                        Manual
                      </span>
                    ) : log.is_edited ? (
                      <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wider block mt-1">
                        Editado
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-semibold ${
                        log.isFalta || log.type?.startsWith('Falta')
                          ? 'bg-red-100 text-red-600'
                          : log.type === 'Entrada Manhã'
                          ? 'bg-cyber-emerald/10 text-cyber-emerald'
                          : log.type === 'Saída Manhã'
                          ? 'bg-orange-50 text-orange-500'
                          : log.type === 'Entrada Tarde'
                          ? 'bg-blue-50 text-corporate-blue'
                          : log.type === 'Saída Tarde'
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-industrial-bg text-industrial-muted'
                      }`}
                    >
                      {log.type || 'Batida'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="bg-cyber-emerald/10 text-cyber-emerald px-2 py-1 rounded-md text-xs font-semibold">
                      {log.verification_method}
                    </span>
                  </td>
                  <td className="p-3">
                    {log.distance ? (
                      <span className="text-xs text-industrial-muted block">
                        GPS: {Math.round(log.distance)}m
                      </span>
                    ) : (
                      <span className="text-xs text-industrial-muted block">Sem GPS</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className="font-mono text-[10px] text-industrial-muted block truncate max-w-[200px]"
                      title={log.hash_assinatura}
                    >
                      {log.hash_assinatura}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="p-3 text-right">
                      {!log.isFalta && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(log)}
                            className="p-1.5 text-industrial-muted hover:text-corporate-blue bg-white border border-industrial-border rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(log.id)}
                            className="p-1.5 text-industrial-muted hover:text-red-500 bg-white border border-industrial-border rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="p-8 text-center text-industrial-muted">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal (Admin Only) */}
      {isAdmin && editingLog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              type="button"
              onClick={() => setEditingLog(null)}
              className="absolute top-4 right-4 text-industrial-muted hover:text-industrial-text transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="font-bold text-xl mb-4 flex items-center gap-2">
              <Edit2 size={20} className="text-corporate-blue" /> Editar Batida
            </h3>

            <div className="bg-orange-50 text-orange-800 p-3 rounded-lg text-sm mb-4 border border-orange-200">
              <span className="font-bold block">Atenção RH:</span>
              A alteração de registros de ponto deve ser justificada legalmente. O sistema manterá auditoria da data original.
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Correta</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2.5 focus:border-corporate-blue focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Horário Correto</label>
                <input
                  type="time"
                  required
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2.5 focus:border-corporate-blue focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Tipo de Batida</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2.5 focus:border-corporate-blue focus:outline-none"
                >
                  <option value="Entrada Manhã">Entrada Manhã</option>
                  <option value="Saída Manhã">Saída Manhã</option>
                  <option value="Entrada Tarde">Entrada Tarde</option>
                  <option value="Saída Tarde">Saída Tarde</option>
                  <option value="Batida Extra">Batida Extra</option>
                  <option value="Falta">Falta (Dia Inteiro)</option>
                  <option value="Falta Meio Expediente">Falta Meio Expediente</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">
                  Motivo / Justificativa da Edição
                </label>
                <textarea
                  required
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Ex: Funcionário esqueceu de bater o ponto na saída."
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2.5 focus:border-corporate-blue focus:outline-none resize-none h-24 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingLog(null)}
                  className="flex-1 px-4 py-2.5 border border-industrial-border rounded-xl text-industrial-text font-semibold hover:bg-industrial-bg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-corporate-blue text-white rounded-xl font-bold hover:bg-opacity-90 transition-colors shadow-lg shadow-corporate-blue/20"
                >
                  Salvar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
