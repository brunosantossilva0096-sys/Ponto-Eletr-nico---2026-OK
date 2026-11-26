import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, AdminUser, Holiday } from '../types';
import {
  Wand2,
  X,
  Calendar,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  buildLocalTimestampIso,
  getFirstDayOfMonthStr,
  getLocalDayBoundsIso,
  toLocalDateStr,
  toLocalTimeStr,
} from '../utils/dateUtils';
import { isEmployeeInactive, loadCompanyRules, resolveEmployeeDayFrom5x2 } from '../utils/companyRules';

interface AutoPunchItem {
  type: string;
  baseTime: string;
  adjustedTime: string;
  minuteDiff: number;
}

export interface ExistingPunch {
  id: string;
  timestamp: string;
  type: string;
  timeStr: string;
}

interface DayPunches {
  date: string;
  dayOfWeekName: string;
  punches: AutoPunchItem[];
  hasExistingLogs: boolean;
  existingLogs: ExistingPunch[];
  isDayOff: boolean;
  isHoliday: boolean;
  isComplete: boolean;
}

interface AdminAutoPunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  loggedAdmin: AdminUser;
  onSuccess: () => void;
}

interface EmployeeDayScheduleInfo {
  isActive: boolean;
  basePunches: { type: string; baseTime: string }[];
  workStart: string;
  breakStart: string;
  breakEnd: string;
  workEnd: string;
}

const DOW_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function buildBasePunchesFromTimes(ws: string, bs: string, be: string, we: string): { type: string; baseTime: string }[] {
  const basePunches: { type: string; baseTime: string }[] = [];
  if (ws && bs && be && we) {
    basePunches.push(
      { type: 'Entrada Manhã', baseTime: ws },
      { type: 'Saída Manhã', baseTime: bs },
      { type: 'Entrada Tarde', baseTime: be },
      { type: 'Saída Tarde', baseTime: we }
    );
  } else if (ws && bs && !be && !we) {
    basePunches.push(
      { type: 'Entrada Manhã', baseTime: ws },
      { type: 'Saída Manhã', baseTime: bs }
    );
  } else if (ws && we && !bs && !be) {
    basePunches.push(
      { type: 'Entrada Manhã', baseTime: ws },
      { type: 'Saída Tarde', baseTime: we }
    );
  } else if (ws && (we || bs || be)) {
    basePunches.push(
      { type: 'Entrada Manhã', baseTime: ws },
      { type: 'Saída Tarde', baseTime: we || bs || be }
    );
  } else if (ws) {
    basePunches.push(
      { type: 'Entrada Manhã', baseTime: ws },
      { type: 'Saída Tarde', baseTime: '17:00' }
    );
  }
  return basePunches;
}

// Resolve a jornada exata do colaborador na data (usando Escala 5x2 se ativada, ou o perfil cadastrado)
const getEmployeeDaySchedule = (
  emp: Employee,
  dateStr: string,
  dow: number,
  use5x2: boolean
): EmployeeDayScheduleInfo => {
  if (use5x2) {
    const resolved5x2 = resolveEmployeeDayFrom5x2(emp, dateStr, true);
    if (resolved5x2 && resolved5x2.foundIn5x2) {
      if (!resolved5x2.isWorkDay) {
        // Caso o admin force dia único em uma folga, mantém fallback para batidas se necessário
        return {
          isActive: false,
          basePunches: buildBasePunchesFromTimes('08:00', '12:00', '13:00', '17:00'),
          workStart: '',
          breakStart: '',
          breakEnd: '',
          workEnd: '',
        };
      }
      return {
        isActive: true,
        basePunches: buildBasePunchesFromTimes(
          resolved5x2.workStart,
          resolved5x2.breakStart,
          resolved5x2.breakEnd,
          resolved5x2.workEnd
        ),
        workStart: resolved5x2.workStart,
        breakStart: resolved5x2.breakStart,
        breakEnd: resolved5x2.breakEnd,
        workEnd: resolved5x2.workEnd,
      };
    }
  }

  let ws = '';
  let bs = '';
  let be = '';
  let we = '';
  let isActive = true;

  if (emp.custom_schedule && emp.custom_schedule[dow]) {
    const sc = emp.custom_schedule[dow];
    isActive = Boolean(sc.active);
    ws = (sc.work_start || '').trim().substring(0, 5);
    bs = (sc.break_start || '').trim().substring(0, 5);
    be = (sc.break_end || '').trim().substring(0, 5);
    we = (sc.work_end || '').trim().substring(0, 5);
  } else {
    ws = (emp.work_start || '').trim().substring(0, 5);
    bs = (emp.break_start || '').trim().substring(0, 5);
    be = (emp.break_end || '').trim().substring(0, 5);
    we = (emp.work_end || '').trim().substring(0, 5);
    isActive = !emp.work_days || emp.work_days.includes(dow);
  }

  if (!ws && !we && emp.custom_schedule) {
    const daySched =
      emp.custom_schedule[dow] ||
      emp.custom_schedule[1] ||
      Object.values(emp.custom_schedule).find((s: any) => s.active && s.work_start);
    if (daySched) {
      if (emp.custom_schedule[dow]) {
        isActive = Boolean(daySched.active);
      }
      ws = (daySched.work_start || '').trim().substring(0, 5);
      bs = (daySched.break_start || '').trim().substring(0, 5);
      be = (daySched.break_end || '').trim().substring(0, 5);
      we = (daySched.work_end || '').trim().substring(0, 5);
    }
  }

  if (isActive && !ws) {
    ws = '08:00';
    we = '17:00';
  }

  const basePunches = isActive
    ? buildBasePunchesFromTimes(ws, bs, be, we)
    : buildBasePunchesFromTimes('08:00', '12:00', '13:00', '17:00');

  return {
    isActive,
    basePunches,
    workStart: ws,
    breakStart: bs,
    breakEnd: be,
    workEnd: we,
  };
};

const getEmployeeScheduleSummary = (emp: Employee): string => {
  if (emp.custom_schedule) {
    const daysWithSched = Object.entries(emp.custom_schedule)
      .filter(([_, s]: any) => s && s.active && s.work_start)
      .map(([dow, s]: any) => {
        const dName = DOW_NAMES[Number(dow)].slice(0, 3);
        const punches = [s.work_start, s.break_start, s.break_end, s.work_end]
          .filter(Boolean)
          .map((t: string) => t.substring(0, 5));
        return `${dName}: ${punches.join(' - ')}`;
      });
    if (daysWithSched.length > 0) {
      return daysWithSched.join(' | ');
    }
  }
  const std = [emp.work_start, emp.break_start, emp.break_end, emp.work_end]
    .filter(Boolean)
    .map((t: string) => t!.substring(0, 5));
  if (std.length > 0) {
    return `Seg a Sex: ${std.join(' - ')}`;
  }
  return 'Horário padrão (08:00 - 12:00 - 13:00 - 17:00)';
};

const toMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const normalizeType = (s: string) =>
  (s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isEntryType = (t: string) => normalizeType(t).includes('entrada');
const isExitType = (t: string) => normalizeType(t).includes('saida');

const getPunchCost = (existing: ExistingPunch, bp: { type: string; baseTime: string }): number => {
  const exM = toMinutes(existing.timeStr);
  const bpM = toMinutes(bp.baseTime);
  const diffM = Math.abs(exM - bpM);

  const normEx = normalizeType(existing.type);
  const normBp = normalizeType(bp.type);
  const exactType = normEx === normBp;

  const exEntry = isEntryType(existing.type);
  const bpEntry = isEntryType(bp.type);
  const exExit = isExitType(existing.type);
  const bpExit = isExitType(bp.type);
  const sameCategory = (exEntry && bpEntry) || (exExit && bpExit);

  if (exactType) {
    return diffM <= 180 ? diffM : diffM + 300;
  }
  if (sameCategory) {
    return diffM + 100;
  }
  return diffM + 1000;
};

export const getMissingBasePunches = (
  basePunches: { type: string; baseTime: string }[],
  existingPunches: ExistingPunch[]
): { type: string; baseTime: string }[] => {
  if (!existingPunches || existingPunches.length === 0) {
    return [...basePunches];
  }

  if (existingPunches.length >= basePunches.length) {
    return [];
  }

  const n = basePunches.length;
  const m = existingPunches.length;

  let bestCost = Infinity;
  let bestMatchedBpIndices = new Set<number>();

  const generatePermutations = (currentIndices: number[], usedBase: boolean[]) => {
    if (currentIndices.length === m) {
      let cost = 0;
      for (let i = 0; i < m; i++) {
        cost += getPunchCost(existingPunches[i], basePunches[currentIndices[i]]);
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestMatchedBpIndices = new Set(currentIndices);
      }
      return;
    }

    for (let j = 0; j < n; j++) {
      if (!usedBase[j]) {
        usedBase[j] = true;
        currentIndices.push(j);
        generatePermutations(currentIndices, usedBase);
        currentIndices.pop();
        usedBase[j] = false;
      }
    }
  };

  generatePermutations([], new Array(n).fill(false));

  return basePunches.filter((_, idx) => !bestMatchedBpIndices.has(idx));
};

export const AdminAutoPunchModal: React.FC<AdminAutoPunchModalProps> = ({
  isOpen,
  onClose,
  employees,
  loggedAdmin,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'single' | 'range'>('range');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateStr());
  const [startDate, setStartDate] = useState<string>(() => getFirstDayOfMonthStr());
  const [endDate, setEndDate] = useState<string>(() => toLocalDateStr());

  const [variationRange, setVariationRange] = useState<number>(5);
  const [verificationMethod, setVerificationMethod] = useState<string>('Biometria');
  const [skipWeekends, setSkipWeekends] = useState<boolean>(true);
  const [skipHolidays, setSkipHolidays] = useState<boolean>(true);
  const [useSchedule5x2, setUseSchedule5x2] = useState<boolean>(
    () => loadCompanyRules(loggedAdmin.company_id || '').useSchedule5x2InReportsAndTimeBank
  );
  const [existingAction, setExistingAction] = useState<'replace' | 'skip' | 'missing'>('missing');

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [existingDatesSet, setExistingDatesSet] = useState<Set<string>>(new Set());
  const [existingLogsByDate, setExistingLogsByDate] = useState<Record<string, ExistingPunch[]>>({});
  const [dayPunchesList, setDayPunchesList] = useState<DayPunches[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen || loggedAdmin.role !== 'total') return null;

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  useEffect(() => {
    const fetchHolidays = async () => {
      const { data } = await supabase.from('holidays').select('*');
      if (data) setHolidays(data);
    };
    fetchHolidays();
  }, []);

  const addMinutesToTimeString = (timeStr: string, minutesToAdd: number): string => {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    date.setMinutes(date.getMinutes() + minutesToAdd);
    const finalH = String(date.getHours()).padStart(2, '0');
    const finalM = String(date.getMinutes()).padStart(2, '0');
    return `${finalH}:${finalM}`;
  };

  const getRandomOffset = (range: number): number => {
    if (range <= 0) return 0;
    const min = -range;
    const max = range;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  useEffect(() => {
    const checkExistingDates = async () => {
      if (!selectedEmployeeId) {
        setExistingDatesSet(new Set());
        setExistingLogsByDate({});
        return;
      }

      const queryStart = mode === 'single' ? selectedDate : startDate;
      const queryEnd = mode === 'single' ? selectedDate : endDate;

      if (!queryStart || !queryEnd || queryStart > queryEnd) {
        setExistingDatesSet(new Set());
        setExistingLogsByDate({});
        return;
      }

      const { startIso, endIso } = getLocalDayBoundsIso(queryStart, queryEnd);

      const { data } = await supabase
        .from('time_logs')
        .select('id, timestamp, type')
        .eq('employee_id', selectedEmployeeId)
        .gte('timestamp', startIso)
        .lte('timestamp', endIso)
        .order('timestamp', { ascending: true });

      const setOfDates = new Set<string>();
      const logsByDate: Record<string, ExistingPunch[]> = {};

      if (data) {
        data.forEach((l) => {
          if (l.type === 'Falta' || l.type === 'Falta Meio Expediente') return;
          const dateStr = toLocalDateStr(l.timestamp);
          const timeStr = toLocalTimeStr(l.timestamp);

          setOfDates.add(dateStr);

          if (!logsByDate[dateStr]) {
            logsByDate[dateStr] = [];
          }
          logsByDate[dateStr].push({
            id: l.id,
            timestamp: l.timestamp,
            type: l.type || 'Batida',
            timeStr,
          });
        });
      }

      setExistingDatesSet(setOfDates);
      setExistingLogsByDate(logsByDate);
    };

    checkExistingDates();
  }, [selectedEmployeeId, selectedDate, startDate, endDate, mode]);

  const generatePunchesForBaseList = (
    baseList: { type: string; baseTime: string }[]
  ): AutoPunchItem[] => {
    return baseList.map((bp) => {
      const diff = getRandomOffset(variationRange);
      const adjusted = addMinutesToTimeString(bp.baseTime, diff);
      return {
        type: bp.type,
        baseTime: bp.baseTime,
        adjustedTime: adjusted,
        minuteDiff: diff,
      };
    });
  };

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

    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const current = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    const list: DayPunches[] = [];

    while (current <= end) {
      const dateStr = toLocalDateStr(current);
      const dow = current.getDay();

      const isHoliday = holidays.some((h) => h.date === dateStr);
      const schedInfo = getEmployeeDaySchedule(selectedEmployee, dateStr, dow, useSchedule5x2);
      const isDayOff = !schedInfo.isActive;

      const shouldSkip =
        mode === 'range' && ((skipHolidays && isHoliday) || (skipWeekends && isDayOff));

      if (!shouldSkip) {
        const existingForDay = existingLogsByDate[dateStr] || [];
        const hasExisting = existingForDay.length > 0;

        let basePunchesToUse = schedInfo.basePunches;
        let isComplete = false;

        if (existingAction === 'missing' && hasExisting) {
          basePunchesToUse = getMissingBasePunches(schedInfo.basePunches, existingForDay);
          if (basePunchesToUse.length === 0) {
            isComplete = true;
          }
        }

        const punches = generatePunchesForBaseList(basePunchesToUse);

        list.push({
          date: dateStr,
          dayOfWeekName: DOW_NAMES[dow],
          punches,
          hasExistingLogs: hasExisting,
          existingLogs: existingForDay,
          isDayOff,
          isHoliday,
          isComplete,
        });
      }

      current.setDate(current.getDate() + 1);
    }

    setDayPunchesList(list);
  };

  useEffect(() => {
    generateAllDaysPunches();
  }, [
    selectedEmployeeId,
    selectedDate,
    startDate,
    endDate,
    mode,
    variationRange,
    skipWeekends,
    skipHolidays,
    useSchedule5x2,
    existingDatesSet,
    existingLogsByDate,
    existingAction,
  ]);

  const handleManualTimeChange = (dayIndex: number, punchIndex: number, newTime: string) => {
    setDayPunchesList((prev) => {
      const next = [...prev];
      if (next[dayIndex] && next[dayIndex].punches[punchIndex]) {
        const p = next[dayIndex].punches[punchIndex];
        const [h1, m1] = p.baseTime.split(':').map(Number);
        const [h2, m2] = newTime.split(':').map(Number);
        const diff = h2 * 60 + m2 - (h1 * 60 + m1);

        next[dayIndex].punches[punchIndex] = {
          ...p,
          adjustedTime: newTime,
          minuteDiff: diff,
        };
      }
      return next;
    });
  };

  const activeDaysToProcess = dayPunchesList.filter((d) => {
    if (d.hasExistingLogs && existingAction === 'skip') return false;
    if (existingAction === 'missing' && d.punches.length === 0) return false;
    return true;
  });

  const totalPunchesToInsert = activeDaysToProcess.reduce((sum, d) => sum + d.punches.length, 0);
  const daysWithExistingLogsCount = dayPunchesList.filter((d) => d.hasExistingLogs).length;

  const handleSaveAll = async () => {
    if (!selectedEmployee || dayPunchesList.length === 0) {
      alert('Nenhum dia elegível para gerar batidas.');
      return;
    }

    if (totalPunchesToInsert === 0) {
      const msg =
        existingAction === 'skip'
          ? 'Todos os dias selecionados já possuem batidas e a opção escolhida foi "Pular dias que já possuem batidas".'
          : 'Todos os dias selecionados já possuem todas as batidas previstas na escala (nada a incluir).';
      alert(msg);
      return;
    }

    const confirmMsg =
      existingAction === 'missing'
        ? `Confirma a inclusão de ${totalPunchesToInsert} batida(s) faltante(s) para ${selectedEmployee.name}? (As batidas já existentes serão mantidas intactas)`
        : `Confirma a gravação de ${totalPunchesToInsert} batidas em ${activeDaysToProcess.length} dia(s) para ${selectedEmployee.name}?`;

    if (!confirm(confirmMsg)) return;

    setIsSaving(true);

    try {
      if (existingAction === 'replace') {
        const datesToReplace = activeDaysToProcess.filter((d) => d.hasExistingLogs).map((d) => d.date);
        for (const dStr of datesToReplace) {
          const { startIso, endIso } = getLocalDayBoundsIso(dStr, dStr);
          await supabase
            .from('time_logs')
            .delete()
            .eq('employee_id', selectedEmployee.id)
            .gte('timestamp', startIso)
            .lte('timestamp', endIso);
        }
      }

      const baseLat = selectedEmployee.allowed_lat;
      const baseLng = selectedEmployee.allowed_lng;
      const allLogsToInsert: any[] = [];

      for (const day of activeDaysToProcess) {
        for (const p of day.punches) {
          const timestampIso = buildLocalTimestampIso(day.date, p.adjustedTime);
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
            is_manual: false,
          });
        }
      }

      const chunkSize = 100;
      for (let i = 0; i < allLogsToInsert.length; i += chunkSize) {
        const chunk = allLogsToInsert.slice(i, i + chunkSize);
        const { error } = await supabase.from('time_logs').insert(chunk);
        if (error) throw error;
      }

      alert(
        `Sucesso! ${allLogsToInsert.length} batida(s) foram registradas para ${selectedEmployee.name}!`
      );
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
              <p className="text-xs text-industrial-muted">
                Gere batidas por dia único ou período, respeitando a Escala 5x2 ou o cadastro.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-industrial-muted hover:text-industrial-text p-1 rounded-lg hover:bg-industrial-bg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          <div className="flex bg-industrial-bg p-1 rounded-xl border border-industrial-border">
            <button
              type="button"
              onClick={() => setMode('range')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === 'range'
                  ? 'bg-white shadow-sm text-cyber-emerald'
                  : 'text-industrial-muted hover:text-industrial-text'
              }`}
            >
              <Calendar size={14} /> Intervalo de Datas (Período)
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === 'single'
                  ? 'bg-white shadow-sm text-cyber-emerald'
                  : 'text-industrial-muted hover:text-industrial-text'
              }`}
            >
              <Clock size={14} /> Dia Único
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Colaborador</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-industrial-bg border border-industrial-border rounded-xl p-2.5 text-sm focus:border-cyber-emerald focus:outline-none font-medium"
            >
              <option value="">Selecione o colaborador...</option>
              {employees
                .filter((emp) => !isEmployeeInactive(emp))
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.companies?.name ? `(${emp.companies.name})` : ''}
                  </option>
                ))}
            </select>

            {selectedEmployee && (
              <div className="mt-2.5 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1.5 animate-fade-in">
                <div className="font-bold flex items-center justify-between text-emerald-900">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-cyber-emerald" />
                    <span>
                      {useSchedule5x2
                        ? 'Usando folgas e horários da Escala 5x2 (com fallback p/ perfil):'
                        : 'Horários Base no Perfil:'}
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-emerald-950 font-medium bg-white/80 p-2 rounded-lg border border-emerald-100 flex flex-wrap gap-x-3 gap-y-1">
                  {getEmployeeScheduleSummary(selectedEmployee)
                    .split(' | ')
                    .map((part, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyber-emerald"></span>
                        {part}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          {mode === 'single' ? (
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1 flex items-center gap-1.5">
                <Calendar size={14} className="text-cyber-emerald" /> Data do Ponto
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
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
                  onChange={(e) => setStartDate(e.target.value)}
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
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-xl p-2.5 text-sm focus:border-cyber-emerald focus:outline-none font-medium"
                />
              </div>
            </div>
          )}

          {/* Opções de Escala e Feriados */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-industrial-bg/50 p-3 rounded-xl border border-industrial-border text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-industrial-text font-medium">
              <input
                type="checkbox"
                checked={useSchedule5x2}
                onChange={(e) => setUseSchedule5x2(e.target.checked)}
                className="rounded text-cyber-emerald focus:ring-cyber-emerald"
              />
              Seguir Escala 5x2 ativa
            </label>
            {mode === 'range' && (
              <>
                <label className="flex items-center gap-2 cursor-pointer text-industrial-text font-medium">
                  <input
                    type="checkbox"
                    checked={skipWeekends}
                    onChange={(e) => setSkipWeekends(e.target.checked)}
                    className="rounded text-cyber-emerald focus:ring-cyber-emerald"
                  />
                  Pular folgas / domingos
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-industrial-text font-medium">
                  <input
                    type="checkbox"
                    checked={skipHolidays}
                    onChange={(e) => setSkipHolidays(e.target.checked)}
                    className="rounded text-cyber-emerald focus:ring-cyber-emerald"
                  />
                  Pular feriados
                </label>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-industrial-bg/40 p-4 rounded-xl border border-industrial-border">
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1 flex items-center justify-between">
                <span>Variação de Minutos</span>
                <span className="text-cyber-emerald font-bold">±{variationRange} min</span>
              </label>
              <input
                type="range"
                min={0}
                max={15}
                value={variationRange}
                onChange={(e) => setVariationRange(Number(e.target.value))}
                className="w-full accent-cyber-emerald cursor-pointer"
              />
              <span className="text-[10px] text-industrial-muted">
                0 = horário cravado; 1 a 15 = variação natural
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">
                Método de Registro
              </label>
              <select
                value={verificationMethod}
                onChange={(e) => setVerificationMethod(e.target.value)}
                className="w-full bg-white border border-industrial-border rounded-lg p-2 text-xs focus:border-cyber-emerald focus:outline-none"
              >
                <option value="Biometria">Biometria (SecuGen / Passkey)</option>
                <option value="Reconhecimento Facial">Reconhecimento Facial</option>
                <option value="Sistema">Sistema (Automático)</option>
                <option value="Manual (Admin)">Manual (Admin)</option>
              </select>
            </div>
          </div>

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
              <div className="flex flex-col sm:flex-row flex-wrap gap-x-4 gap-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-amber-900">
                  <input
                    type="radio"
                    name="existingAction"
                    checked={existingAction === 'missing'}
                    onChange={() => setExistingAction('missing')}
                    className="text-cyber-emerald focus:ring-cyber-emerald"
                  />
                  <span>
                    <strong>Apenas incluir as que faltam</strong> (mantém as atuais)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-amber-900">
                  <input
                    type="radio"
                    name="existingAction"
                    checked={existingAction === 'replace'}
                    onChange={() => setExistingAction('replace')}
                    className="text-cyber-emerald focus:ring-cyber-emerald"
                  />
                  <span>Substituir batidas anteriores desses dias</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-amber-900">
                  <input
                    type="radio"
                    name="existingAction"
                    checked={existingAction === 'skip'}
                    onChange={() => setExistingAction('skip')}
                    className="text-cyber-emerald focus:ring-cyber-emerald"
                  />
                  <span>Pular dias já preenchidos</span>
                </label>
              </div>
            </div>
          )}

          {selectedEmployee && dayPunchesList.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-industrial-muted flex items-center gap-1.5">
                  <Sparkles size={14} className="text-cyber-emerald" />
                  {mode === 'single'
                    ? 'Prévia dos Horários'
                    : `Prévia (${activeDaysToProcess.length} dias • ${totalPunchesToInsert} batidas)`}
                </h4>
                <button
                  type="button"
                  onClick={generateAllDaysPunches}
                  className="text-xs font-semibold text-cyber-emerald hover:text-emerald-700 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                >
                  <RefreshCw size={13} /> Sortear Novamente
                </button>
              </div>

              <div className="space-y-2.5 border border-industrial-border rounded-xl p-3 bg-white max-h-[260px] overflow-y-auto custom-scrollbar">
                {dayPunchesList.map((day, dIdx) => {
                  const isSkipped = day.hasExistingLogs && existingAction === 'skip';
                  const isComplete =
                    day.hasExistingLogs && existingAction === 'missing' && day.punches.length === 0;
                  const isExpanded = expandedDay === day.date || mode === 'single';

                  return (
                    <div
                      key={day.date}
                      className={`p-3 rounded-xl border transition-all ${
                        isSkipped || isComplete
                          ? 'bg-gray-50 border-gray-200 opacity-75'
                          : day.hasExistingLogs && existingAction === 'missing'
                          ? 'bg-blue-50/50 border-blue-200'
                          : day.hasExistingLogs
                          ? 'bg-amber-50/40 border-amber-200'
                          : 'bg-industrial-bg/40 border-industrial-border'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-industrial-text">
                            {new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')} ({day.dayOfWeekName})
                          </span>
                          {day.hasExistingLogs && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                isSkipped
                                  ? 'bg-gray-200 text-gray-700'
                                  : isComplete
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : existingAction === 'missing'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isSkipped
                                ? 'Já preenchido (será pulado)'
                                : isComplete
                                ? `Completo (${day.existingLogs?.length || 0} batidas)`
                                : existingAction === 'missing'
                                ? `Possui ${day.existingLogs?.length || 0} (+${day.punches.length})`
                                : 'Será substituído'}
                            </span>
                          )}
                        </div>

                        {mode === 'range' && (
                          <div className="flex items-center gap-1.5 text-industrial-muted text-xs">
                            <span className="font-medium text-[11px]">
                              {day.punches.length > 0
                                ? day.punches.map((p) => p.adjustedTime).join(' • ')
                                : isComplete
                                ? 'Dia completo'
                                : 'Nenhuma batida'}
                            </span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        )}
                      </div>

                      {isExpanded && !isSkipped && (
                        <div className="mt-3 pt-2.5 border-t border-industrial-border/60 space-y-2.5">
                          {day.hasExistingLogs && day.existingLogs && day.existingLogs.length > 0 && (
                            <div className="bg-white/90 p-2.5 rounded-lg border border-industrial-border/60 text-xs">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-industrial-muted block mb-1.5">
                                Batidas já registradas ({day.existingLogs.length}):
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {day.existingLogs.map((ex, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-[10px] font-medium px-2 py-0.5 rounded border border-gray-200"
                                  >
                                    <Clock size={10} className="text-gray-500" />
                                    <strong>{ex.timeStr}</strong> ({ex.type})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {day.punches.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {day.punches.map((p, pIdx) => (
                                <div
                                  key={pIdx}
                                  className="bg-white p-2.5 rounded-lg border border-industrial-border shadow-xs"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-[10px] font-bold text-industrial-muted block truncate">
                                      {p.type}
                                    </span>
                                    <span className="text-[9px] text-industrial-muted font-mono bg-industrial-bg px-1 py-0.5 rounded">
                                      Base: {p.baseTime}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between mt-1.5">
                                    <input
                                      type="time"
                                      value={p.adjustedTime}
                                      onChange={(e) => handleManualTimeChange(dIdx, pIdx, e.target.value)}
                                      className="w-16 bg-white border border-industrial-border rounded px-1 text-xs font-mono font-bold focus:border-cyber-emerald focus:outline-none"
                                    />
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        p.minuteDiff > 0
                                          ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                          : p.minuteDiff < 0
                                          ? 'text-amber-700 bg-amber-50 border border-amber-200'
                                          : 'text-gray-500 bg-gray-50'
                                      }`}
                                    >
                                      {p.minuteDiff > 0
                                        ? `+${p.minuteDiff}m`
                                        : p.minuteDiff < 0
                                        ? `${p.minuteDiff}m`
                                        : '0m'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
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
                Total: <strong>{totalPunchesToInsert} batidas</strong> em{' '}
                <strong>{activeDaysToProcess.length} dia(s)</strong>
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
