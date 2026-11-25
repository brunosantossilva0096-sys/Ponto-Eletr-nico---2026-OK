import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import {
  Calendar,
  Lock,
  ShieldCheck,
  RefreshCw,
  Download,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  ALL_OFF_DAYS,
  ALL_WEEKDAYS,
  CollectiveRule,
  DEFAULT_COLLECTIVE_RULES,
  DEFAULT_MTE_POLICY,
  DEFAULT_SCHEDULE_EMPLOYEES,
  DEFAULT_SHIFT_TEMPLATE,
  generateAndAuditSchedule,
  GroupId,
  MtePolicyConfig,
  MteTransitionPhase,
  resolveShiftForEmployeeInWeek,
  ScheduleEmployeeConfig,
  SHIFT_40H,
  SHIFT_42H,
  SHIFT_44H,
  ShiftProfileId,
  ShiftTemplate,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  Weekday,
} from '../utils/scheduleSolver5x2';

const STORAGE_KEY = 'ponto_schedule_5x2_config_v4';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

interface StoredConfig {
  employees: ScheduleEmployeeConfig[];
  rules: CollectiveRule[];
  shift: ShiftTemplate;
  policy?: MtePolicyConfig;
}

function loadStoredConfig(): StoredConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.employees) && Array.isArray(parsed.rules) && parsed.shift) {
        return {
          ...parsed,
          policy: parsed.policy || DEFAULT_MTE_POLICY,
        };
      }
    }
  } catch {
    // Ignora erro de parse e usa padrões
  }
  return {
    employees: DEFAULT_SCHEDULE_EMPLOYEES,
    rules: DEFAULT_COLLECTIVE_RULES,
    shift: DEFAULT_SHIFT_TEMPLATE,
    policy: DEFAULT_MTE_POLICY,
  };
}

export const AdminSchedule5x2: React.FC = () => {
  const initial = useMemo(() => loadStoredConfig(), []);
  const now = new Date();

  const [subTab, setSubTab] = useState<'schedule' | 'conditions' | 'audit'>('schedule');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0..11

  const [employees, setEmployees] = useState<ScheduleEmployeeConfig[]>(initial.employees);
  const [rules, setRules] = useState<CollectiveRule[]>(initial.rules);
  const [shift, setShift] = useState<ShiftTemplate>(initial.shift);
  const [policy, setPolicy] = useState<MtePolicyConfig>(initial.policy || DEFAULT_MTE_POLICY);

  // Novo colaborador
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpGroup, setNewEmpGroup] = useState<GroupId>('A');

  // Nova regra individual (estilo regra coletiva, escolhendo o colaborador)
  const [groupFilter, setGroupFilter] = useState<'ALL' | GroupId>('ALL');
  const [indRuleEmpId, setIndRuleEmpId] = useState<string>(initial.employees[0]?.id || '');
  const [indRuleGroup, setIndRuleGroup] = useState<GroupId>(initial.employees[0]?.group || 'A');
  const [indRuleProfile, setIndRuleProfile] = useState<ShiftProfileId>(
    initial.employees[0]?.shiftProfile || 'group'
  );
  const [indRuleDays, setIndRuleDays] = useState<Weekday[]>(
    initial.employees[0]?.allowedDays || [1, 2, 3, 4, 5]
  );
  const [indRuleAlternate, setIndRuleAlternate] = useState<boolean>(
    initial.employees[0]?.alternateDays || false
  );
  const [indRuleNote, setIndRuleNote] = useState<string>('');

  // Nova regra coletiva
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleEmpIds, setNewRuleEmpIds] = useState<string[]>([]);
  const [newRuleMaxOff, setNewRuleMaxOff] = useState<number>(1);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ employees, rules, shift, policy })
      );
    } catch {
      // Ignora erro de quota
    }
  }, [employees, rules, shift, policy]);

  const solverResult = useMemo(() => {
    return generateAndAuditSchedule(selectedYear, selectedMonth, employees, rules, shift, policy);
  }, [selectedYear, selectedMonth, employees, rules, shift, policy]);

  const allAuditsPassed =
    solverResult.success && solverResult.audits.every((a) => a.passed);

  const toggleAllowedDay = (empId: string, day: Weekday) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const exists = emp.allowedDays.includes(day);
        if (exists && emp.allowedDays.length === 1) {
          alert('Cada colaborador precisa ter pelo menos 1 dia útil permitido para folga.');
          return emp;
        }
        const nextDays = exists
          ? emp.allowedDays.filter((d) => d !== day)
          : ([...emp.allowedDays, day].sort((a, b) => a - b) as Weekday[]);
        return { ...emp, allowedDays: nextDays };
      })
    );
  };

  const toggleAlternateDays = (empId: string) => {
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === empId ? { ...emp, alternateDays: !emp.alternateDays } : emp
      )
    );
  };

  const changeEmployeeGroup = (empId: string, group: GroupId) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === empId ? { ...emp, group } : emp))
    );
  };

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newEmpName.trim();
    if (!trimmed) return;
    const id = `${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
    setEmployees((prev) => [
      ...prev,
      {
        id,
        name: trimmed,
        group: newEmpGroup,
        allowedDays: [1, 2, 3, 4, 5],
        alternateDays: false,
        note: 'Adicionado manualmente',
      },
    ]);
    setNewEmpName('');
  };

  const handleRemoveEmployee = (empId: string) => {
    if (employees.length <= 2) {
      alert('Mantenha pelo menos 2 colaboradores na escala.');
      return;
    }
    setEmployees((prev) => prev.filter((e) => e.id !== empId));
    setRules((prev) =>
      prev
        .map((r) => ({ ...r, employeeIds: r.employeeIds.filter((id) => id !== empId) }))
        .filter((r) => r.employeeIds.length >= 2)
    );
  };

  const toggleRuleEnabled = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const toggleNewRuleEmployee = (empId: string) => {
    setNewRuleEmpIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleAddCollectiveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRuleEmpIds.length < 2) {
      alert('Selecione pelo menos 2 colaboradores para criar uma regra coletiva.');
      return;
    }
    const names = newRuleEmpIds
      .map((id) => employees.find((e) => e.id === id)?.name || id)
      .join(', ');
    const title = newRuleName.trim() || `${names}: Máx ${newRuleMaxOff} folga(s) no mesmo dia`;
    setRules((prev) => [
      ...prev,
      {
        id: `rule-${Date.now()}`,
        name: title,
        employeeIds: newRuleEmpIds,
        maxOffSameDay: Math.max(1, newRuleMaxOff),
        enabled: true,
      },
    ]);
    setNewRuleName('');
    setNewRuleEmpIds([]);
    setNewRuleMaxOff(1);
  };

  const handleRestoreDefaults = () => {
    if (confirm('Deseja restaurar todas as condições individuais, coletivas e a política MTE 2.041/2026 para o padrão original?')) {
      setEmployees(DEFAULT_SCHEDULE_EMPLOYEES);
      setRules(DEFAULT_COLLECTIVE_RULES);
      setShift(DEFAULT_SHIFT_TEMPLATE);
      setPolicy(DEFAULT_MTE_POLICY);
    }
  };

  const handleExportCSV = () => {
    if (!solverResult.success) return;
    const rows: string[] = [
      'Semana;Limite MTE;Colaborador;Grupo;Folga Util;DSR;Jornada Seg-Sex;Jornada Sabado',
    ];
    for (let i = 0; i < solverResult.weeks.length; i++) {
      const w = solverResult.weeks[i];
      const assign = solverResult.assignments[i];
      for (const emp of employees) {
        const offDay = assign.offDayByEmployee[emp.id];
        const s = resolveShiftForEmployeeInWeek(
          emp,
          assign.legalMaxWeeklyHours,
          assign.appliedShift,
          policy,
          offDay
        );
        const offDate = w.datesByDow[offDay] || '';
        rows.push(
          `"${w.label}";"${assign.legalMaxWeeklyHours}h/sem";"${emp.name}";"Grupo ${emp.group}";"${WEEKDAY_LABELS[offDay]} (${offDate})";"Domingo (${w.datesByDow[0]})";"${s.workStart}-${s.workEnd} (Int. ${s.breakStart}-${s.breakEnd})";"${offDay === 6 ? 'FOLGA' : `${s.saturdayStart}-${s.saturdayEnd}`}"`
        );
      }
    }
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `escala-5x2-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!solverResult.success) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(
      `Controle de Jornada 5x2 — ${MONTH_NAMES[selectedMonth]} / ${selectedYear}`,
      14,
      15
    );
    doc.setFontSize(9);
    doc.text(
      `Portaria MTE nº 2.041/2026 (44h → 42h em 16/12/2026 → 40h) | Auditoria: ${allAuditsPassed ? 'APROVADA' : 'COM ALERTAS'}`,
      14,
      21
    );

    let y = 29;
    const colWidths = [36, 16, 28, 28, 28, 28, 28, 28, 28];
    const headers = ['Colaborador', 'Grupo', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    for (let wIdx = 0; wIdx < solverResult.weeks.length; wIdx++) {
      const week = solverResult.weeks[wIdx];
      const assign = solverResult.assignments[wIdx];
      const s = assign.appliedShift;

      if (y > 170) {
        doc.addPage();
        y = 15;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `${week.label} — Limite: ${assign.legalMaxWeeklyHours}h/sem (${s.workStart}–${s.workEnd}, Int. ${s.breakStart}–${s.breakEnd})`,
        14,
        y
      );
      y += 4;

      // Cabeçalho
      doc.setFontSize(8);
      let x = 14;
      headers.forEach((h, idx) => {
        doc.rect(x, y, colWidths[idx], 6);
        doc.text(h, x + 2, y + 4);
        x += colWidths[idx];
      });
      y += 6;

      doc.setFont('helvetica', 'normal');
      for (const emp of employees) {
        if (y > 192) {
          doc.addPage();
          y = 15;
        }
        const offDay = assign.offDayByEmployee[emp.id];
        const cells = [
          emp.name,
          `Grp ${emp.group}`,
          offDay === 1 ? 'FOLGA' : 'Trab',
          offDay === 2 ? 'FOLGA' : 'Trab',
          offDay === 3 ? 'FOLGA' : 'Trab',
          offDay === 4 ? 'FOLGA' : 'Trab',
          offDay === 5 ? 'FOLGA' : 'Trab',
          offDay === 6 ? 'FOLGA' : 'Trab',
          'DSR',
        ];
        x = 14;
        cells.forEach((val, idx) => {
          doc.rect(x, y, colWidths[idx], 5.5);
          doc.text(val, x + 2, y + 3.8);
          x += colWidths[idx];
        });
        y += 5.5;
      }
      y += 6;
    }

    doc.save(`escala-5x2-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Módulo 5x2 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-industrial-text flex items-center gap-2">
              <Sparkles className="text-cyber-emerald" size={20} />
              Controle de Jornada 5x2 — Solver CSP
            </h2>
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                allAuditsPassed
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {allAuditsPassed ? (
                <>
                  <CheckCircle2 size={13} /> CLT & MTE 2.041/2026: 100% Conforme
                </>
              ) : (
                <>
                  <AlertTriangle size={13} /> Conflito de Restrições
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-industrial-muted mt-1">
            Geração automática de folgas úteis semanais + DSR dominical com Motor de Restrições Individuais e Coletivas.
          </p>
        </div>

        {/* Sub-navegação */}
        <div className="flex bg-industrial-bg p-1 rounded-xl gap-1 overflow-x-auto">
          <button
            onClick={() => setSubTab('schedule')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'schedule'
                ? 'bg-white text-cyber-emerald shadow-sm'
                : 'text-industrial-muted hover:text-industrial-text'
            }`}
          >
            <Calendar size={14} /> Escala Mensal
          </button>
          <button
            onClick={() => setSubTab('conditions')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'conditions'
                ? 'bg-white text-cyber-emerald shadow-sm'
                : 'text-industrial-muted hover:text-industrial-text'
            }`}
          >
            <Lock size={14} /> Condições Individuais & Coletivas
          </button>
          <button
            onClick={() => setSubTab('audit')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
              subTab === 'audit'
                ? 'bg-white text-cyber-emerald shadow-sm'
                : 'text-industrial-muted hover:text-industrial-text'
            }`}
          >
            <ShieldCheck size={14} /> Auditoria CLT & MTE
          </button>
        </div>
      </div>

      {/* SUB-ABA 1: ESCALA MENSAL */}
      {subTab === 'schedule' && (
        <div className="space-y-6">
          {/* Barra de controles */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-industrial-border flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Mês de Referência
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium bg-industrial-bg outline-none focus:border-cyber-emerald"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Ano
                </label>
                <input
                  type="number"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value) || 2026)}
                  className="w-24 px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium bg-industrial-bg outline-none focus:border-cyber-emerald"
                />
              </div>
              <div className="px-3 py-2 rounded-lg bg-industrial-bg border border-industrial-border text-xs">
                <span className="text-industrial-muted">Portaria MTE nº 2.041/2026: </span>
                <span className="font-bold text-industrial-text">
                  {policy.phaseMode === 'auto'
                    ? '44h → 42h (16/12/2026) → 40h'
                    : `Fixo ${policy.phaseMode}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportCSV}
                disabled={!solverResult.success}
                className="px-3.5 py-2 rounded-xl border border-industrial-border text-xs font-semibold hover:border-cyber-emerald hover:text-cyber-emerald transition-colors flex items-center gap-1.5 disabled:opacity-40"
              >
                <Download size={14} /> Exportar CSV
              </button>
              <button
                onClick={handleExportPDF}
                disabled={!solverResult.success}
                className="px-3.5 py-2 rounded-xl bg-cyber-emerald text-white text-xs font-bold hover:bg-opacity-90 transition-all flex items-center gap-1.5 disabled:opacity-40"
              >
                <Download size={14} /> Exportar PDF
              </button>
            </div>
          </div>

          {!solverResult.success ? (
            <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-bold text-sm">Impossível resolver a escala com as restrições atuais</h3>
                <p className="text-xs mt-1">{solverResult.error}</p>
                <button
                  onClick={() => setSubTab('conditions')}
                  className="mt-3 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg"
                >
                  Ajustar Condições Individuais & Coletivas
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {solverResult.weeks.map((week, wIdx) => {
                const assign = solverResult.assignments[wIdx];
                const groupACount = employees.filter((e) => e.group === 'A').length;
                const groupBCount = employees.filter((e) => e.group === 'B').length;

                return (
                  <div
                    key={week.weekIndex}
                    className="bg-white rounded-2xl shadow-sm border border-industrial-border overflow-hidden"
                  >
                    <div className="px-5 py-3.5 bg-industrial-bg border-b border-industrial-border flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="font-bold text-sm text-industrial-text flex items-center gap-2">
                          <Calendar size={16} className="text-cyber-emerald" />
                          {week.label}
                        </h3>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            assign.legalMaxWeeklyHours <= 40
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : assign.legalMaxWeeklyHours <= 42
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {assign.legalMaxWeeklyHours >= 44
                            ? 'Padrão Normal em uso: 44h/sem'
                            : assign.legalMaxWeeklyHours === 42
                            ? 'Vigência MTE (≥16/12/2026): 42h/sem • Grp A: 07h | Grp B: 07h45 | Iolanda/Bruno: 07h–17h'
                            : `Vigência MTE: ${assign.legalMaxWeeklyHours}h/sem`}
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-industrial-muted">
                        Solver CSP: {assign.backtracks} backtrack(s) • Equipe: {employees.length} colaboradores
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-industrial-border bg-slate-50/70 text-industrial-muted">
                            <th className="text-left py-2.5 px-4 font-semibold">Colaborador</th>
                            <th className="text-center py-2.5 px-2 font-semibold">Grupo</th>
                            {ALL_WEEKDAYS.map((d) => (
                              <th key={d} className="text-center py-2.5 px-2 font-semibold">
                                <div>{WEEKDAY_SHORT[d]}</div>
                                <div className="text-[10px] font-normal">
                                  {week.datesByDow[d]?.slice(8, 10)}/{week.datesByDow[d]?.slice(5, 7)}
                                </div>
                              </th>
                            ))}
                            <th className="text-center py-2.5 px-2 font-semibold">
                              <div>Sáb</div>
                              <div className="text-[10px] font-normal">
                                {week.datesByDow[6]?.slice(8, 10)}/{week.datesByDow[6]?.slice(5, 7)}
                              </div>
                            </th>
                            <th className="text-center py-2.5 px-2 font-semibold">
                              <div>Dom</div>
                              <div className="text-[10px] font-normal">
                                {week.datesByDow[0]?.slice(8, 10)}/{week.datesByDow[0]?.slice(5, 7)}
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-industrial-border/60">
                          {employees.map((emp) => {
                            const offDay = assign.offDayByEmployee[emp.id];
                            const empShift = resolveShiftForEmployeeInWeek(
                              emp,
                              assign.legalMaxWeeklyHours,
                              assign.appliedShift,
                              policy,
                              offDay
                            );
                            return (
                              <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-4 font-semibold text-industrial-text">
                                  {emp.name}
                                  {emp.alternateDays && (
                                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                      Alterna
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      emp.group === 'A'
                                        ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                                    }`}
                                  >
                                    Grupo {emp.group}
                                  </span>
                                </td>
                                {ALL_WEEKDAYS.map((d) => {
                                  const isOff = offDay === d;
                                  return (
                                    <td key={d} className="py-2 px-1.5 text-center">
                                      {isOff ? (
                                        <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300">
                                          FOLGA
                                        </span>
                                      ) : (
                                        <span
                                          className="inline-block px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium text-[11px]"
                                          title={`Intervalo: ${empShift.breakStart}–${empShift.breakEnd}`}
                                        >
                                          {empShift.workStart}–{empShift.workEnd}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="py-2 px-1.5 text-center">
                                  {offDay === 6 ? (
                                    <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300">
                                      FOLGA
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium text-[11px]">
                                      {empShift.saturdayStart}–{empShift.saturdayEnd}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-1.5 text-center">
                                  <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200">
                                    DSR
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-industrial-bg border-t border-industrial-border font-semibold text-[11px]">
                            <td colSpan={2} className="py-2.5 px-4 text-industrial-muted">
                              Cobertura Diária (Presentes)
                            </td>
                            {ALL_OFF_DAYS.map((d) => {
                              const offA = employees.filter(
                                (e) => e.group === 'A' && assign.offDayByEmployee[e.id] === d
                              ).length;
                              const offB = employees.filter(
                                (e) => e.group === 'B' && assign.offDayByEmployee[e.id] === d
                              ).length;
                              const presA = groupACount - offA;
                              const presB = groupBCount - offB;
                              return (
                                <td key={d} className="py-2 px-1 text-center">
                                  <div className="text-industrial-text">
                                    {presA + presB}/{employees.length}
                                  </div>
                                  <div className="text-[10px] text-industrial-muted font-normal">
                                    A:{presA} • B:{presB}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-2 px-1 text-center text-amber-700">DSR Geral</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-ABA 2: CONDIÇÕES INDIVIDUAIS & COLETIVAS */}
      {subTab === 'conditions' && (
        <div className="space-y-6">
          {/* Condições Individuais */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                  <Users size={18} className="text-cyber-emerald" />
                  Condições Individuais (Folga Semanal Seg–Sáb + DSR Domingo)
                </h3>
                <p className="text-xs text-industrial-muted mt-0.5">
                  Todas as regras são maleáveis por colaborador: dias permitidos (incluindo somente Sábado), grupo, perfil de horário e alternância.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex bg-industrial-bg p-1 rounded-lg border border-industrial-border text-[11px] font-semibold">
                  {(['ALL', 'A', 'B'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGroupFilter(g)}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        groupFilter === g
                          ? 'bg-white text-cyber-emerald shadow-sm'
                          : 'text-industrial-muted hover:text-industrial-text'
                      }`}
                    >
                      {g === 'ALL' ? 'Todos' : `Grupo ${g}`}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleRestoreDefaults}
                  className="px-3 py-1.5 rounded-lg border border-industrial-border text-xs font-semibold text-industrial-muted hover:text-industrial-text hover:border-industrial-text flex items-center gap-1.5"
                >
                  <RotateCcw size={13} /> Restaurar Padrões
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-industrial-border text-industrial-muted bg-industrial-bg">
                    <th className="text-left py-2.5 px-3 font-semibold">Colaborador</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Grupo</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Perfil 42h</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Dias Permitidos (Seg–Sáb)</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Alternar</th>
                    <th className="text-left py-2.5 px-3 font-semibold">Observação / Regra</th>
                    <th className="text-center py-2.5 px-2 font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-industrial-border/60">
                  {employees
                    .filter((emp) => groupFilter === 'ALL' || emp.group === groupFilter)
                    .map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-bold text-industrial-text">{emp.name}</td>
                      <td className="py-2.5 px-2 text-center">
                        <select
                          value={emp.group}
                          onChange={(e) => changeEmployeeGroup(emp.id, e.target.value as GroupId)}
                          className="px-2 py-1 rounded-md border border-industrial-border bg-white font-semibold text-xs outline-none"
                        >
                          <option value="A">Grupo A</option>
                          <option value="B">Grupo B</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <select
                          value={emp.shiftProfile || 'group'}
                          onChange={(e) => {
                            const val = e.target.value as ShiftProfileId;
                            setEmployees((prev) =>
                              prev.map((item) =>
                                item.id === emp.id ? { ...item, shiftProfile: val } : item
                              )
                            );
                          }}
                          className="px-2 py-1 rounded-md border border-industrial-border bg-white font-medium text-[11px] outline-none"
                        >
                          <option value="group">
                            Padrão Grupo {emp.group} ({emp.group === 'A' ? '07:00' : '07:45'})
                          </option>
                          <option value="iolanda">07:00–17:00 (Int. 12–13h)</option>
                          <option value="bruno">07:00–17:00 (Int. 11–12h)</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {ALL_OFF_DAYS.map((day) => {
                            const active = emp.allowedDays.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleAllowedDay(emp.id, day)}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all border ${
                                  active
                                    ? 'bg-cyber-emerald text-white border-cyber-emerald'
                                    : 'bg-white text-industrial-muted border-industrial-border hover:border-slate-400'
                                }`}
                              >
                                {WEEKDAY_SHORT[day]}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() =>
                              setEmployees((prev) =>
                                prev.map((item) =>
                                  item.id === emp.id
                                    ? {
                                        ...item,
                                        allowedDays: [6],
                                        alternateDays: false,
                                        note: 'Somente folga ao Sábado',
                                      }
                                    : item
                                )
                              )
                            }
                            className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all ${
                              emp.allowedDays.length === 1 && emp.allowedDays[0] === 6
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            }`}
                            title="Definir folga somente ao Sábado"
                          >
                            Só Sáb
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={emp.alternateDays}
                          onChange={() => toggleAlternateDays(emp.id)}
                          disabled={emp.allowedDays.length < 2}
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                          title="Alternar automaticamente entre os dias permitidos em semanas consecutivas"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-industrial-muted max-w-xs">
                        {emp.note || '—'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveEmployee(emp.id)}
                          className="text-industrial-muted hover:text-red-500 p-1"
                          title="Remover colaborador da escala"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Adicionar / Aplicar Regra Individual (mesmo padrão da regra coletiva) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!indRuleEmpId || indRuleDays.length === 0) {
                  alert('Selecione um colaborador e pelo menos 1 dia permitido.');
                  return;
                }
                setEmployees((prev) =>
                  prev.map((emp) =>
                    emp.id === indRuleEmpId
                      ? {
                          ...emp,
                          group: indRuleGroup,
                          shiftProfile: indRuleProfile,
                          allowedDays: [...indRuleDays].sort((a, b) => a - b) as Weekday[],
                          alternateDays: indRuleAlternate && indRuleDays.length >= 2,
                          note: indRuleNote.trim() || emp.note,
                        }
                      : emp
                  )
                );
                setIndRuleNote('');
              }}
              className="p-4 rounded-xl bg-industrial-bg border border-industrial-border space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-industrial-text">
                  Configurar Regra Individual (Escolha o Colaborador)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIndRuleDays([6]);
                      setIndRuleAlternate(false);
                      setIndRuleNote('Somente folga ao Sábado');
                    }}
                    className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold hover:bg-amber-100"
                  >
                    Preset: Somente Sábado
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIndRuleDays([1, 2, 3, 4, 5]);
                      setIndRuleAlternate(false);
                    }}
                    className="px-2 py-1 rounded-md bg-white text-industrial-text border border-industrial-border text-[10px] font-semibold hover:border-cyber-emerald"
                  >
                    Preset: Seg–Sex
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIndRuleDays([2, 5]);
                      setIndRuleAlternate(true);
                    }}
                    className="px-2 py-1 rounded-md bg-white text-industrial-text border border-industrial-border text-[10px] font-semibold hover:border-cyber-emerald"
                  >
                    Preset: Ter/Sex (Alterna)
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={indRuleEmpId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setIndRuleEmpId(id);
                    const found = employees.find((emp) => emp.id === id);
                    if (found) {
                      setIndRuleGroup(found.group);
                      setIndRuleProfile(found.shiftProfile || 'group');
                      setIndRuleDays(found.allowedDays);
                      setIndRuleAlternate(found.alternateDays);
                    }
                  }}
                  className="px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald min-w-[170px]"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (Grupo {emp.group})
                    </option>
                  ))}
                </select>

                <select
                  value={indRuleGroup}
                  onChange={(e) => setIndRuleGroup(e.target.value as GroupId)}
                  className="px-2.5 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none"
                >
                  <option value="A">Grupo A</option>
                  <option value="B">Grupo B</option>
                </select>

                <select
                  value={indRuleProfile}
                  onChange={(e) => setIndRuleProfile(e.target.value as ShiftProfileId)}
                  className="px-2.5 py-2 rounded-lg border border-industrial-border bg-white text-xs font-medium outline-none"
                >
                  <option value="group">Horário Padrão do Grupo</option>
                  <option value="iolanda">Horário 07:00–17:00 (Int. 12–13h)</option>
                  <option value="bruno">Horário 07:00–17:00 (Int. 11–12h)</option>
                </select>

                <div className="flex items-center gap-1 flex-wrap">
                  {ALL_OFF_DAYS.map((day) => {
                    const active = indRuleDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setIndRuleDays((prev) => {
                            if (prev.includes(day)) {
                              return prev.length === 1 ? prev : prev.filter((d) => d !== day);
                            }
                            return [...prev, day].sort((a, b) => a - b) as Weekday[];
                          });
                        }}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all border ${
                          active
                            ? 'bg-cyber-emerald text-white border-cyber-emerald'
                            : 'bg-white text-industrial-muted border-industrial-border hover:border-slate-400'
                        }`}
                      >
                        {WEEKDAY_SHORT[day]}
                      </button>
                    );
                  })}
                </div>

                <label className="flex items-center gap-1.5 text-xs font-medium text-industrial-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indRuleAlternate}
                    onChange={(e) => setIndRuleAlternate(e.target.checked)}
                    disabled={indRuleDays.length < 2}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  Alternar semanas
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Descrição opcional da regra individual..."
                  value={indRuleNote}
                  onChange={(e) => setIndRuleNote(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs outline-none focus:border-cyber-emerald flex-1 min-w-[220px]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyber-emerald text-white text-xs font-bold flex items-center gap-1.5 hover:bg-opacity-90"
                >
                  <Plus size={14} /> Aplicar Regra Individual
                </button>
              </div>
            </form>

            {/* Adicionar colaborador */}
            <form
              onSubmit={handleAddEmployee}
              className="pt-3 border-t border-industrial-border flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                placeholder="Nome do novo colaborador..."
                value={newEmpName}
                onChange={(e) => setNewEmpName(e.target.value)}
                className="px-3 py-2 rounded-lg border border-industrial-border text-xs outline-none focus:border-cyber-emerald flex-1 min-w-[200px]"
              />
              <select
                value={newEmpGroup}
                onChange={(e) => setNewEmpGroup(e.target.value as GroupId)}
                className="px-3 py-2 rounded-lg border border-industrial-border text-xs font-semibold bg-white outline-none"
              >
                <option value="A">Grupo A</option>
                <option value="B">Grupo B</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyber-emerald text-white text-xs font-bold flex items-center gap-1.5 hover:bg-opacity-90"
              >
                <Plus size={14} /> Adicionar Colaborador
              </button>
            </form>
          </div>

          {/* Condições Coletivas */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-4">
            <div>
              <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                <Lock size={18} className="text-cyber-emerald" />
                Condições Coletivas (Exclusão Mútua / Conflitos de Folga)
              </h3>
              <p className="text-xs text-industrial-muted mt-0.5">
                Impede que determinados colaboradores folguem no mesmo dia útil.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                    rule.enabled
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-industrial-border bg-slate-50 opacity-60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="font-bold text-xs text-industrial-text">{rule.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {rule.employeeIds.map((id) => {
                        const emp = employees.find((e) => e.id === id);
                        return (
                          <span
                            key={id}
                            className="px-2 py-0.5 rounded-full bg-white border border-industrial-border text-[10px] font-semibold text-industrial-text"
                          >
                            {emp ? emp.name : id}
                          </span>
                        );
                      })}
                    </div>
                    <div className="text-[11px] text-industrial-muted">
                      Máximo simultâneo no mesmo dia útil: <strong>{rule.maxOffSameDay}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => toggleRuleEnabled(rule.id)}
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                      title="Ativar / desativar regra"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-industrial-muted hover:text-red-500 p-1"
                      title="Excluir regra coletiva"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Form Nova Regra Coletiva */}
            <form
              onSubmit={handleAddCollectiveRule}
              className="p-4 rounded-xl bg-industrial-bg border border-industrial-border space-y-3"
            >
              <div className="text-xs font-bold text-industrial-text">
                Adicionar Nova Regra Coletiva
              </div>
              <div className="flex flex-wrap gap-1.5">
                {employees.map((emp) => {
                  const selected = newRuleEmpIds.includes(emp.id);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => toggleNewRuleEmployee(emp.id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                        selected
                          ? 'bg-cyber-emerald text-white border-cyber-emerald'
                          : 'bg-white text-industrial-text border-industrial-border hover:border-cyber-emerald'
                      }`}
                    >
                      {emp.name} ({emp.group})
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Descrição opcional da regra..."
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs outline-none focus:border-cyber-emerald flex-1 min-w-[220px]"
                />
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-industrial-muted">Máx. folgas juntas:</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={newRuleMaxOff}
                    onChange={(e) => setNewRuleMaxOff(Number(e.target.value) || 1)}
                    className="w-16 px-2 py-2 rounded-lg border border-industrial-border bg-white text-xs font-bold outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyber-emerald text-white text-xs font-bold flex items-center gap-1.5 hover:bg-opacity-90"
                >
                  <Plus size={14} /> Criar Regra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-ABA 3: AUDITORIA CLT & PORTARIA MTE 2.041/2026 */}
      {subTab === 'audit' && (
        <div className="space-y-6">
          {/* Configuração de Horário 5x2 e Vigência Portaria MTE 2.041/2026 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                  <Clock size={18} className="text-cyber-emerald" />
                  Parâmetros de Jornada 5x2 & Transição Portaria MTE nº 2.041/2026
                </h3>
                <p className="text-xs text-industrial-muted mt-0.5">
                  Regra legal: 44h semanais até 15/12/2026, passando para 42h semanais a partir de 16/12/2026 até a transição completa para 40h.
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setPolicy({ ...policy, phaseMode: '44h' });
                    setShift(SHIFT_44H);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-industrial-border text-[11px] font-semibold hover:border-cyber-emerald"
                >
                  Preset 44h (08:00–18:00)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPolicy({ ...policy, phaseMode: '42h' });
                    setShift(SHIFT_42H);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-industrial-border text-[11px] font-semibold hover:border-cyber-emerald"
                >
                  Preset 42h (08:00–17:24)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPolicy({ ...policy, phaseMode: '40h' });
                    setShift(SHIFT_40H);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-industrial-border text-[11px] font-semibold hover:border-cyber-emerald"
                >
                  Preset 40h (08:00–17:00)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-industrial-bg border border-industrial-border">
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Regime de Vigência (MTE 2.041/2026)
                </label>
                <select
                  value={policy.phaseMode}
                  onChange={(e) =>
                    setPolicy({ ...policy, phaseMode: e.target.value as MteTransitionPhase })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-semibold outline-none focus:border-cyber-emerald"
                >
                  <option value="auto">Automático por Data (44h → 42h → 40h)</option>
                  <option value="42h">Fixo 42h semanais (08h24/dia)</option>
                  <option value="40h">Fixo 40h semanais (08h00/dia)</option>
                  <option value="44h">Fixo 44h semanais (08h48/dia)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Início Vigência 42h Semanais
                </label>
                <input
                  type="date"
                  value={policy.transition42Date}
                  onChange={(e) => setPolicy({ ...policy, transition42Date: e.target.value })}
                  disabled={policy.phaseMode !== 'auto'}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-medium outline-none focus:border-cyber-emerald disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Início Vigência 40h (Opcional)
                </label>
                <input
                  type="date"
                  value={policy.transition40Date}
                  onChange={(e) => setPolicy({ ...policy, transition40Date: e.target.value })}
                  disabled={policy.phaseMode !== 'auto'}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border bg-white text-xs font-medium outline-none focus:border-cyber-emerald disabled:opacity-50"
                />
              </div>
            </div>

            {policy.phaseMode !== 'auto' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Entrada
                </label>
                <input
                  type="time"
                  value={shift.workStart}
                  onChange={(e) => setShift({ ...shift, workStart: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium outline-none focus:border-cyber-emerald"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Início Intervalo
                </label>
                <input
                  type="time"
                  value={shift.breakStart}
                  onChange={(e) => setShift({ ...shift, breakStart: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium outline-none focus:border-cyber-emerald"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Fim Intervalo
                </label>
                <input
                  type="time"
                  value={shift.breakEnd}
                  onChange={(e) => setShift({ ...shift, breakEnd: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium outline-none focus:border-cyber-emerald"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-industrial-muted mb-1">
                  Saída
                </label>
                <input
                  type="time"
                  value={shift.workEnd}
                  onChange={(e) => setShift({ ...shift, workEnd: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-industrial-border text-sm font-medium outline-none focus:border-cyber-emerald"
                />
              </div>
            </div>
            )}
          </div>

          {/* Resultado da Auditoria */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                <ShieldCheck size={18} className="text-cyber-emerald" />
                Relatório de Auditoria Automática ({MONTH_NAMES[selectedMonth]}/{selectedYear})
              </h3>
              <span className="text-xs text-industrial-muted flex items-center gap-1">
                <RefreshCw size={12} /> Total de backtracks do Solver: {solverResult.totalBacktracks}
              </span>
            </div>

            {solverResult.audits.length === 0 ? (
              <p className="text-xs text-red-600">
                Auditoria indisponível enquanto houver conflito insolúvel nas restrições.
              </p>
            ) : (
              <div className="space-y-3">
                {solverResult.audits.map((check) => (
                  <div
                    key={check.id}
                    className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
                      check.passed
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-red-200 bg-red-50/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-industrial-border text-industrial-muted">
                          {check.category}
                        </span>
                        <h4 className="font-bold text-xs text-industrial-text">{check.title}</h4>
                      </div>
                      <p className="text-xs text-industrial-muted mt-1">{check.details}</p>
                    </div>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        check.passed
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {check.passed ? 'APROVADO' : 'CONFLITO'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

