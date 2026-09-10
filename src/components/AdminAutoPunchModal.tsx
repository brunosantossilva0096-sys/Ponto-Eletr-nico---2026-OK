import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, AdminUser, Holiday } from '../types';
import { Wand2, X, Calendar, AlertTriangle, RefreshCw, Save, ShieldAlert, Sparkles, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

interface AutoPunchItem {
  type: string;
  baseTime: string;
  adjustedTime: string;
  minuteDiff: number;
}

interface DayPunches {
  date: string;
  dayOfWeekName: string;
  punches: AutoPunchItem[];
  hasExistingLogs: boolean;
  isDayOff: boolean;
  isHoliday: boolean;
}

interface AdminAutoPunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  loggedAdmin: AdminUser;
  onSuccess: () => void;
}

const DOW_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export const AdminAutoPunchModal: React.FC<AdminAutoPunchModalProps> = ({
  isOpen,
  onClose,
  employees,
  loggedAdmin,
  onSuccess
}) => {
  const [mode, setMode] = useState<'single' | 'range'>('range');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // 1º dia do mês atual
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [variationRange, setVariationRange] = useState<number>(5); // -5 a +5 min por padrão
  const [verificationMethod, setVerificationMethod] = useState<string>('Biometria');
  const [skipWeekends, setSkipWeekends] = useState<boolean>(true);
  const [skipHolidays, setSkipHolidays] = useState<boolean>(true);
  const [existingAction, setExistingAction] = useState<'replace' | 'skip'>('replace');

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [existingDatesSet, setExistingDatesSet] = useState<Set<string>>(new Set());
  const [dayPunchesList, setDayPunchesList] = useState<DayPunches[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Apenas role === 'total' pode acessar
  if (!isOpen || loggedAdmin.role !== 'total') return null;

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

  // Carregar feriados uma vez
  useEffect(() => {
    const fetchHolidays = async () => {
      const { data } = await supabase.from('holidays').select('*');
      if (data) setHolidays(data);
    };
    fetchHolidays();
  }, []);

  // Helper para formatar hora HH:mm somando minutos
  const addMinutesToTimeString = (timeStr: string, minutesToAdd: number): string => {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    date.setMinutes(date.getMinutes() + minutesToAdd);
    const finalH = String(date.getHours()).padStart(2, '0');
    const finalM = String(date.getMinutes()).padStart(2, '0');
    return `${finalH}:${finalM}`;
  };

  // Helper para gerar variação aleatória de minutos
  const getRandomOffset = (range: number): number => {
    const min = -range;
    const max = range + 2;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  // Checar quais datas já têm batidas no período
  useEffect(() => {
    const checkExistingDates = async () => {
      if (!selectedEmployeeId) {
        setExistingDatesSet(new Set());
        return;
      }

      const queryStart = mode === 'single' ? selectedDate : startDate;
      const queryEnd = mode === 'single' ? selectedDate : endDate;

      if (!queryStart || !queryEnd) {
        setExistingDatesSet(new Set());
        return;
      }

      const { data } = await supabase
        .from('time_logs')
        .select('timestamp')
        .eq('employee_id', selectedEmployeeId)
        .gte('timestamp', `${queryStart}T00:00:00`)
        .lte('timestamp', `${queryEnd}T23:59:59`);

      const setOfDates = new Set<string>();
      if (data) {
        data.forEach(l => {
          const d = l.timestamp.split('T')[0];
          setOfDates.add(d);
        });
      }
      setExistingDatesSet(setOfDates);
    };

    checkExistingDates();
  }, [selectedEmployeeId, selectedDate, startDate, endDate, mode]);

  // Função para gerar as batidas de 1 dia específico com base na escala do funcionário
  const generatePunchesForSingleDate = (targetDateStr: string): AutoPunchItem[] => {
    if (!selectedEmployee) return [];

    const targetDate = new Date(`${targetDateStr}T12:00:00`);
    const dayOfWeek = targetDate.getDay();

    let workStart = '';
    let breakStart = '';
    let breakEnd = '';
    let workEnd = '';

    if (selectedEmployee.schedule_type === 'custom' && selectedEmployee.custom_schedule) {
      const daySched = selectedEmployee.custom_schedule[dayOfWeek];
      if (daySched) {
        workStart = daySched.work_start || '';
        breakStart = daySched.break_start || '';
        breakEnd = daySched.break_end || '';
        workEnd = daySched.work_end || '';
      }
    } else {
      workStart = selectedEmployee.work_start ? selectedEmployee.work_start.substring(0, 5) : '';
      breakStart = selectedEmployee.break_start ? selectedEmployee.break_start.substring(0, 5) : '';
      breakEnd = selectedEmployee.break_end ? selectedEmployee.break_end.substring(0, 5) : '';
      workEnd = selectedEmployee.work_end ? selectedEmployee.work_end.substring(0, 5) : '';
    }

    if (!workStart) workStart = '08:00';
    if (!workEnd) workEnd = '18:00';
    if (!breakStart && breakEnd) breakStart = '12:00';
    if (breakStart && !breakEnd) breakEnd = '13:00';

    const items: AutoPunchItem[] = [];

    if (breakStart && breakEnd) {
      const diff1 = getRandomOffset(variationRange);
      const diff2 = getRandomOffset(variationRange);
      const diff3 = getRandomOffset(variationRange);
      const diff4 = getRandomOffset(variationRange);

      items.push(
        { type: 'Entrada Manhã', baseTime: workStart, adjustedTime: addMinutesToTimeString(workStart, diff1), minuteDiff: diff1 },
        { type: 'Saída Manhã', baseTime: breakStart, adjustedTime: addMinutesToTimeString(breakStart, diff2), minuteDiff: diff2 },
        { type: 'Entrada Tarde', baseTime: breakEnd, adjustedTime: addMinutesToTimeString(breakEnd, diff3), minuteDiff: diff3 },
        { type: 'Saída Tarde', baseTime: workEnd, adjustedTime: addMinutesToTimeString(workEnd, diff4), minuteDiff: diff4 }
      );
    } else {
      const diff1 = getRandomOffset(variationRange);
      const diff2 = getRandomOffset(variationRange);

      items.push(
        { type: 'Entrada Manhã', baseTime: workStart, adjustedTime: addMinutesToTimeString(workStart, diff1), minuteDiff: diff1 },
        { type: 'Saída Tarde', baseTime: workEnd, adjustedTime: addMinutesToTimeString(workEnd, diff2), minuteDiff: diff2 }
      );
    }

    return items;
  };

  // Calcula a lista de dias a serem processados
  const generateAllDaysPunches = () => {
    if (!selectedEmployee) {
      setDayPunchesList([]);
      return;
    }

    const startStr = mode === 'single' ? selectedDate : startDate;
    const endStr = mode === 'single' ? selectedDate : endDate;

    if (!startStr || !endStr || startStr > endStr) {
      setDayPunchesList([]);
      return;
    }

    const start = new Date(`${startStr}T12:00:00`);
    const end = new Date(`${endStr}T12:00:00`);
    const current = new Date(start);

    const list: DayPunches[] = [];

    while (current <= end) {
      const dateStr = current.getFullYear() + '-' + 
                      String(current.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(current.getDate()).padStart(2, '0');
      const dow = current.getDay();

      // Verificar se é feriado
      const isHoliday = holidays.some(h => h.date === dateStr);

      // Verificar se é dia ativo/útil na escala do funcionário
      let isDayActive = true;
      if (selectedEmployee.schedule_type === 'custom' && selectedEmployee.custom_schedule) {
        isDayActive = Boolean(selectedEmployee.custom_schedule[dow]?.active);
      } else {
        isDayActive = !selectedEmployee.work_days || selectedEmployee.work_days.includes(dow);
      }

      const isDayOff = !isDayActive;

      // Se for modo intervalo e configurado para pular feriados/folgas
      const shouldSkip = (skipHolidays && isHoliday) || (skipWeekends && isDayOff);

      if (!shouldSkip) {
        const punches = generatePunchesForSingleDate(dateStr);
        list.push({
          date: dateStr,
          dayOfWeekName: DOW_NAMES[dow],
          punches,
          hasExistingLogs: existingDatesSet.has(dateStr),
          isDayOff,
          isHoliday
        });
      }

      current.setDate(current.getDate() + 1);
    }

    setDayPunchesList(list);
  };

  // Recalcular quando mudar funcionário, datas, modo, variação ou filtros
  useEffect(() => {
    generateAllDaysPunches();
  }, [selectedEmployeeId, selectedDate, startDate, endDate, mode, variationRange, skipWeekends, skipHolidays, existingDatesSet]);

  const handleManualTimeChange = (dayIndex: number, punchIndex: number, newTime: string) => {
    setDayPunchesList(prev => {
      const next = [...prev];
      if (next[dayIndex] && next[dayIndex].punches[punchIndex]) {
        const p = next[dayIndex].punches[punchIndex];
        const [h1, m1] = p.baseTime.split(':').map(Number);
        const [h2, m2] = newTime.split(':').map(Number);
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);

        next[dayIndex].punches[punchIndex] = {
          ...p,
          adjustedTime: newTime,
          minuteDiff: diff
        };
      }
      return next;
    });
  };

  // Contagem de dias elegíveis
  const activeDaysToProcess = dayPunchesList.filter(d => {
    if (d.hasExistingLogs && existingAction === 'skip') return false;
    return true;
  });

  const totalPunchesToInsert = activeDaysToProcess.reduce((sum, d) => sum + d.punches.length, 0);
  const daysWithExistingLogsCount = dayPunchesList.filter(d => d.hasExistingLogs).length;

  const handleSaveAll = async () => {
    if (!selectedEmployee || dayPunchesList.length === 0) {
      alert('Nenhum dia elegível para gerar batidas.');
      return;
    }

    if (totalPunchesToInsert === 0) {
      alert('Todos os dias selecionados já possuem batidas e a opção escolhida foi "Pular dias que já possuem batidas".');
      return;
    }

    const confirmMsg = mode === 'single'
      ? `Confirma a gravação de ${totalPunchesToInsert} batida(s) para ${selectedEmployee.name}?`
      : `Confirma a gravação de ${totalPunchesToInsert} batidas em ${activeDaysToProcess.length} dias para ${selectedEmployee.name}?`;

    if (!confirm(confirmMsg)) return;

    setIsSaving(true);

    try {
      // 1. Apagar batidas anteriores dos dias substituídos se for 'replace'
      if (existingAction === 'replace') {
        const datesToReplace = activeDaysToProcess.filter(d => d.hasExistingLogs).map(d => d.date);
        for (const dStr of datesToReplace) {
          await supabase
            .from('time_logs')
            .delete()
            .eq('employee_id', selectedEmployee.id)
            .gte('timestamp', `${dStr}T00:00:00`)
            .lte('timestamp', `${dStr}T23:59:59`);
        }
      }

      // 2. Montar lote de batidas
      const baseLat = selectedEmployee.allowed_lat;
      const baseLng = selectedEmployee.allowed_lng;

      const allLogsToInsert: any[] = [];

      for (const day of activeDaysToProcess) {
        for (const p of day.punches) {
          const timestampIso = new Date(`${day.date}T${p.adjustedTime}:00`).toISOString();
          const hashStr = 'AUTO-' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

          let lat: number | null = null;
          let lng: number | null = null;
          let distance: number | null = null;

          if (baseLat && baseLng) {
            const latOffset = (Math.random() - 0.5) * 0.00015;
            const lngOffset = (Math.random() - 0.5) * 0.00015;
            lat = Number((baseLat + latOffset).toFixed(6));
            lng = Number((baseLng + lngOffset).toFixed(6));
            distance = Math.floor(Math.random() * 20) + 4;
          }

          allLogsToInsert.push({
            id: crypto.randomUUID(),
            employee_id: selectedEmployee.id,
            timestamp: timestampIso,
            type: p.type,
            verification_method: verificationMethod,
            distance,
            latitude: lat,
            longitude: lng,
            photo_evidence: null,
            hash_assinatura: hashStr,
            pis_pasep_trabalhador: selectedEmployee.pis || '',
            cpf_trabalhador: selectedEmployee.cpf || '',
            cnpj_empregador: selectedEmployee.companies?.cnpj || null,
            razao_social_empregador: selectedEmployee.companies?.name || null,
            is_edited: false,
            is_manual: false
          });
        }
      }

      // 3. Salvar em lotes de 100 para segurança
      const chunkSize = 100;
      for (let i = 0; i < allLogsToInsert.length; i += chunkSize) {
        const chunk = allLogsToInsert.slice(i, i + chunkSize);
        const { error } = await supabase.from('time_logs').insert(chunk);
        if (error) throw error;
      }

      alert(`Sucesso! ${allLogsToInsert.length} batidas foram registradas para ${selectedEmployee.name}!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar batidas:', err);
      alert('Erro ao salvar no banco de dados: ' + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-industrial-border w-full max-w-2xl overflow-hidden animate-fade-in flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-industrial-border bg-gradient-to-r from-emerald-50 to-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyber-emerald/10 flex items-center justify-center text-cyber-emerald">
              <Wand2 size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                Batidas Automáticas com Variação Natural
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Admin Master
                </span>
              </h3>
              <p className="text-xs text-industrial-muted">Gere batidas realistas por dia único ou intervalo de datas completo.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-industrial-muted hover:text-industrial-text p-1 rounded-lg hover:bg-industrial-bg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Alternador de Modo: Dia Único x Intervalo de Datas */}
          <div className="flex bg-industrial-bg p-1 rounded-xl border border-industrial-border">
            <button
              type="button"
              onClick={() => setMode('range')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === 'range' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'
              }`}
            >
              <Calendar size={14} /> Intervalo de Datas (Período)
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === 'single' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'
              }`}
            >
              <Clock size={14} /> Dia Único
            </button>
          </div>

          {/* Seleção de Funcionário */}
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">
              Colaborador
            </label>
            <select
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-industrial-bg border border-industrial-border rounded-xl p-2.5 text-sm focus:border-cyber-emerald focus:outline-none font-medium"
            >
              <option value="">Selecione o colaborador...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.companies?.name ? `(${emp.companies.name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Datas conforme o modo */}
          {mode === 'single' ? (
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1 flex items-center gap-1.5">
                <Calendar size={14} className="text-cyber-emerald" /> Data do Ponto
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full bg-industrial-bg border border-industrial-border rounded-xl p-2.5 text-sm focus:border-cyber-emerald focus:outline-none font-medium"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1 flex items-center gap-1.5">
                  <Calendar size={14} className="text-cyber-emerald" /> Data Inicial
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-xl p-2.5 text-sm focus:border-cyber-emerald focus:outline-none font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1 flex items-center gap-1.5">
                  <Calendar size={14} className="text-cyber-emerald" /> Data Final
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-xl p-2.5 text-sm focus:border-cyber-emerald focus:outline-none font-medium"
                />
              </div>
            </div>
          )}

          {/* Opções de Intervalo (apenas no modo range) */}
          {mode === 'range' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-industrial-bg/50 p-3 rounded-xl border border-industrial-border text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-industrial-text font-medium">
                <input
                  type="checkbox"
                  checked={skipWeekends}
                  onChange={e => setSkipWeekends(e.target.checked)}
                  className="rounded text-cyber-emerald focus:ring-cyber-emerald"
                />
                Pular dias de folga / finais de semana
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-industrial-text font-medium">
                <input
                  type="checkbox"
                  checked={skipHolidays}
                  onChange={e => setSkipHolidays(e.target.checked)}
                  className="rounded text-cyber-emerald focus:ring-cyber-emerald"
                />
                Pular feriados cadastrados
              </label>
            </div>
          )}

          {/* Configuração da Variação e Método */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-industrial-bg/40 p-4 rounded-xl border border-industrial-border">
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1 flex items-center justify-between">
                <span>Variação de Minutos</span>
                <span className="text-cyber-emerald font-bold">±{variationRange} min</span>
              </label>
              <input
                type="range"
                min={2}
                max={12}
                value={variationRange}
                onChange={e => setVariationRange(Number(e.target.value))}
                className="w-full accent-cyber-emerald cursor-pointer"
              />
              <span className="text-[10px] text-industrial-muted">Variação natural sorteada em cada batida</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">
                Método de Registro
              </label>
              <select
                value={verificationMethod}
                onChange={e => setVerificationMethod(e.target.value)}
                className="w-full bg-white border border-industrial-border rounded-lg p-2 text-xs focus:border-cyber-emerald focus:outline-none"
              >
                <option value="Biometria">Biometria (SecuGen / Passkey)</option>
                <option value="Reconhecimento Facial">Reconhecimento Facial</option>
                <option value="Sistema">Sistema (Automático)</option>
                <option value="Manual (Admin)">Manual (Admin)</option>
              </select>
            </div>
          </div>

          {/* Alerta de Dias com Batidas Existentes */}
          {daysWithExistingLogsCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3.5 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <ShieldAlert size={16} className="text-amber-600 shrink-0" />
                <span>
                  {mode === 'single'
                    ? 'Já existem batidas registradas para este colaborador nesta data.'
                    : `${daysWithExistingLogsCount} dia(s) neste intervalo já possuem batidas registradas.`}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-amber-900">
                  <input
                    type="radio"
                    name="existingAction"
                    checked={existingAction === 'replace'}
                    onChange={() => setExistingAction('replace')}
                    className="text-cyber-emerald focus:ring-cyber-emerald"
                  />
                  Substituir batidas anteriores desses dias
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-amber-900">
                  <input
                    type="radio"
                    name="existingAction"
                    checked={existingAction === 'skip'}
                    onChange={() => setExistingAction('skip')}
                    className="text-cyber-emerald focus:ring-cyber-emerald"
                  />
                  Pular dias já preenchidos (manter batidas atuais)
                </label>
              </div>
            </div>
          )}

          {/* Resumo do Período e Botão de Re-sorteio */}
          {selectedEmployee && dayPunchesList.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-industrial-muted flex items-center gap-1.5">
                    <Sparkles size={14} className="text-cyber-emerald" /> 
                    {mode === 'single' ? 'Prévia dos Horários' : `Prévia (${activeDaysToProcess.length} dias úteis • ${totalPunchesToInsert} batidas)`}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={generateAllDaysPunches}
                  className="text-xs font-semibold text-cyber-emerald hover:text-emerald-700 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                  title="Gera novos minutos aleatórios para todos os dias"
                >
                  <RefreshCw size={13} /> Sortear Novamente
                </button>
              </div>

              {/* Lista dos Dias Gerados */}
              <div className="space-y-2.5 border border-industrial-border rounded-xl p-3 bg-white max-h-[260px] overflow-y-auto custom-scrollbar">
                {dayPunchesList.map((day, dIdx) => {
                  const isSkipped = day.hasExistingLogs && existingAction === 'skip';
                  const isExpanded = expandedDay === day.date || mode === 'single';

                  return (
                    <div
                      key={day.date}
                      className={`p-3 rounded-xl border transition-all ${
                        isSkipped
                          ? 'bg-gray-50 border-gray-200 opacity-60'
                          : day.hasExistingLogs
                          ? 'bg-amber-50/40 border-amber-200'
                          : 'bg-industrial-bg/40 border-industrial-border'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-industrial-text">
                            {new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')} ({day.dayOfWeekName})
                          </span>
                          {day.hasExistingLogs && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.2 rounded">
                              {isSkipped ? 'Já preenchido (será pulado)' : 'Já preenchido (será substituído)'}
                            </span>
                          )}
                        </div>

                        {mode === 'range' && (
                          <div className="flex items-center gap-1.5 text-industrial-muted text-xs">
                            <span className="font-medium text-[11px]">
                              {day.punches.map(p => p.adjustedTime).join(' • ')}
                            </span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        )}
                      </div>

                      {/* Detalhamento das batidas do dia */}
                      {isExpanded && !isSkipped && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-industrial-border/60">
                          {day.punches.map((p, pIdx) => (
                            <div key={pIdx} className="bg-white p-2 rounded-lg border border-industrial-border shadow-xs">
                              <span className="text-[10px] font-bold text-industrial-muted block truncate">{p.type}</span>
                              <div className="flex items-center justify-between mt-1">
                                <input
                                  type="time"
                                  value={p.adjustedTime}
                                  onChange={e => handleManualTimeChange(dIdx, pIdx, e.target.value)}
                                  className="w-16 bg-white border border-industrial-border rounded px-1 text-xs font-mono font-bold focus:border-cyber-emerald focus:outline-none"
                                />
                                <span className={`text-[10px] font-bold px-1 rounded ${
                                  p.minuteDiff > 0 ? 'text-emerald-700 bg-emerald-50' :
                                  p.minuteDiff < 0 ? 'text-orange-700 bg-orange-50' : 'text-gray-500'
                                }`}>
                                  {p.minuteDiff > 0 ? `+${p.minuteDiff}m` : p.minuteDiff < 0 ? `${p.minuteDiff}m` : '0m'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-industrial-border bg-industrial-bg/30 flex justify-between items-center">
          <div className="text-xs text-industrial-muted font-medium">
            {totalPunchesToInsert > 0 && (
              <span>
                Total: <strong>{totalPunchesToInsert} batidas</strong> em <strong>{activeDaysToProcess.length} dia(s)</strong>
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 bg-white border border-industrial-border rounded-xl text-sm font-semibold hover:bg-industrial-bg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || !selectedEmployeeId || totalPunchesToInsert === 0}
              className="px-6 py-2.5 bg-cyber-emerald text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isSaving ? (
                <>Gravando...</>
              ) : (
                <>
                  <Save size={16} /> Gravar Batidas ({totalPunchesToInsert})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
