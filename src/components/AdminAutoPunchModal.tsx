import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, AdminUser } from '../types';
import { Wand2, X, Calendar, AlertTriangle, RefreshCw, Save, ShieldAlert, Sparkles } from 'lucide-react';

interface AutoPunchItem {
  type: string;
  baseTime: string;
  adjustedTime: string;
  minuteDiff: number;
}

interface AdminAutoPunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  loggedAdmin: AdminUser;
  onSuccess: () => void;
}

export const AdminAutoPunchModal: React.FC<AdminAutoPunchModalProps> = ({
  isOpen,
  onClose,
  employees,
  loggedAdmin,
  onSuccess
}) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [variationRange, setVariationRange] = useState<number>(5); // -5 a +5 min por padrão
  const [verificationMethod, setVerificationMethod] = useState<string>('Biometria');
  const [punches, setPunches] = useState<AutoPunchItem[]>([]);
  const [existingPunchesCount, setExistingPunchesCount] = useState<number>(0);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [dayOffWarning, setDayOffWarning] = useState<string>('');

  // Apenas role === 'total' pode acessar
  if (!isOpen || loggedAdmin.role !== 'total') return null;

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

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
    // Variação entre -range e +range (ex: -5 a +5)
    // Pequeno viés positivo natural para simular rotina
    const min = -range;
    const max = range + 2;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  // Calcula os horários base e sorteia a variação
  const generatePunchesForDay = () => {
    if (!selectedEmployee || !selectedDate) {
      setPunches([]);
      setDayOffWarning('');
      return;
    }

    // Identificar dia da semana (0 = Domingo, 1 = Segunda, etc.)
    // Usa T12:00:00 para evitar desvios de fuso horário
    const targetDate = new Date(`${selectedDate}T12:00:00`);
    const dayOfWeek = targetDate.getDay();

    let workStart = '';
    let breakStart = '';
    let breakEnd = '';
    let workEnd = '';
    let isDayActive = true;

    if (selectedEmployee.schedule_type === 'custom' && selectedEmployee.custom_schedule) {
      const daySched = selectedEmployee.custom_schedule[dayOfWeek];
      if (daySched) {
        isDayActive = Boolean(daySched.active);
        workStart = daySched.work_start || '';
        breakStart = daySched.break_start || '';
        breakEnd = daySched.break_end || '';
        workEnd = daySched.work_end || '';
      }
    } else {
      isDayActive = !selectedEmployee.work_days || selectedEmployee.work_days.includes(dayOfWeek);
      workStart = selectedEmployee.work_start ? selectedEmployee.work_start.substring(0, 5) : '';
      breakStart = selectedEmployee.break_start ? selectedEmployee.break_start.substring(0, 5) : '';
      breakEnd = selectedEmployee.break_end ? selectedEmployee.break_end.substring(0, 5) : '';
      workEnd = selectedEmployee.work_end ? selectedEmployee.work_end.substring(0, 5) : '';
    }

    // Fallbacks padrão caso o cadastro não tenha horários preenchidos
    if (!workStart) workStart = '08:00';
    if (!workEnd) workEnd = '18:00';
    if (!breakStart && breakEnd) breakStart = '12:00';
    if (breakStart && !breakEnd) breakEnd = '13:00';

    if (!isDayActive) {
      setDayOffWarning('Este dia da semana não é um dia útil regular configurado para este colaborador. Os horários abaixo foram estimados para caso deseje registrar mesmo assim.');
    } else {
      setDayOffWarning('');
    }

    const items: AutoPunchItem[] = [];

    // Se houver intervalo (4 batidas)
    if (breakStart && breakEnd) {
      const diff1 = getRandomOffset(variationRange);
      const diff2 = getRandomOffset(variationRange);
      const diff3 = getRandomOffset(variationRange);
      const diff4 = getRandomOffset(variationRange);

      const t1 = addMinutesToTimeString(workStart, diff1);
      const t2 = addMinutesToTimeString(breakStart, diff2);
      const t3 = addMinutesToTimeString(breakEnd, diff3);
      const t4 = addMinutesToTimeString(workEnd, diff4);

      items.push(
        { type: 'Entrada Manhã', baseTime: workStart, adjustedTime: t1, minuteDiff: diff1 },
        { type: 'Saída Manhã', baseTime: breakStart, adjustedTime: t2, minuteDiff: diff2 },
        { type: 'Entrada Tarde', baseTime: breakEnd, adjustedTime: t3, minuteDiff: diff3 },
        { type: 'Saída Tarde', baseTime: workEnd, adjustedTime: t4, minuteDiff: diff4 }
      );
    } else {
      // 2 batidas
      const diff1 = getRandomOffset(variationRange);
      const diff2 = getRandomOffset(variationRange);

      const t1 = addMinutesToTimeString(workStart, diff1);
      const t2 = addMinutesToTimeString(workEnd, diff2);

      items.push(
        { type: 'Entrada Manhã', baseTime: workStart, adjustedTime: t1, minuteDiff: diff1 },
        { type: 'Saída Tarde', baseTime: workEnd, adjustedTime: t2, minuteDiff: diff2 }
      );
    }

    setPunches(items);
  };

  // Checar se já existem batidas para o colaborador na data
  useEffect(() => {
    const checkExisting = async () => {
      if (!selectedEmployeeId || !selectedDate) {
        setExistingPunchesCount(0);
        return;
      }
      const startDateTime = `${selectedDate}T00:00:00`;
      const endDateTime = `${selectedDate}T23:59:59`;

      const { count } = await supabase
        .from('time_logs')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', selectedEmployeeId)
        .gte('timestamp', startDateTime)
        .lte('timestamp', endDateTime);

      setExistingPunchesCount(count || 0);
    };

    checkExisting();
  }, [selectedEmployeeId, selectedDate]);

  // Recalcula batidas ao mudar funcionário, data ou faixa de variação
  useEffect(() => {
    generatePunchesForDay();
  }, [selectedEmployeeId, selectedDate, variationRange]);

  const handleManualTimeChange = (index: number, newTime: string) => {
    setPunches(prev => {
      const next = [...prev];
      if (next[index]) {
        // Recalcula a diferença em relação à baseTime
        const [h1, m1] = next[index].baseTime.split(':').map(Number);
        const [h2, m2] = newTime.split(':').map(Number);
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        next[index] = {
          ...next[index],
          adjustedTime: newTime,
          minuteDiff: diff
        };
      }
      return next;
    });
  };

  const handleSaveAutoPunches = async () => {
    if (!selectedEmployee || !selectedDate || punches.length === 0) {
      alert('Selecione um funcionário e uma data válida.');
      return;
    }

    setIsSaving(true);

    try {
      // Se optou por substituir batidas existentes, remove antes
      if (existingPunchesCount > 0 && replaceExisting) {
        const startDateTime = `${selectedDate}T00:00:00`;
        const endDateTime = `${selectedDate}T23:59:59`;
        await supabase
          .from('time_logs')
          .delete()
          .eq('employee_id', selectedEmployee.id)
          .gte('timestamp', startDateTime)
          .lte('timestamp', endDateTime);
      }

      // Prepara os registros com pequenas variações de GPS e dados do colaborador
      const baseLat = selectedEmployee.allowed_lat;
      const baseLng = selectedEmployee.allowed_lng;

      const logsToInsert = punches.map(p => {
        const timestampIso = new Date(`${selectedDate}T${p.adjustedTime}:00`).toISOString();
        const hashStr = 'AUTO-' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);

        // Variação sutil nas coordenadas (aproximadamente 3 a 15 metros) se houver lat/lng
        let lat: number | null = null;
        let lng: number | null = null;
        let distance: number | null = null;

        if (baseLat && baseLng) {
          const latOffset = (Math.random() - 0.5) * 0.00015;
          const lngOffset = (Math.random() - 0.5) * 0.00015;
          lat = Number((baseLat + latOffset).toFixed(6));
          lng = Number((baseLng + lngOffset).toFixed(6));
          distance = Math.floor(Math.random() * 20) + 4; // entre 4 e 24 metros
        }

        return {
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
        };
      });

      const { error } = await supabase.from('time_logs').insert(logsToInsert);

      if (error) {
        alert('Erro ao registrar batidas automáticas: ' + error.message);
      } else {
        alert(`${punches.length} batidas registradas com sucesso para ${selectedEmployee.name}!`);
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      alert('Erro inesperado: ' + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-industrial-border w-full max-w-xl overflow-hidden animate-fade-in flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-industrial-border bg-gradient-to-r from-emerald-50 to-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyber-emerald/10 flex items-center justify-center text-cyber-emerald">
              <Wand2 size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base text-industrial-text flex items-center gap-2">
                Batidas Automáticas do Dia
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Admin Master
                </span>
              </h3>
              <p className="text-xs text-industrial-muted">Gera todas as batidas com variação realista de minutos.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-industrial-muted hover:text-industrial-text p-1 rounded-lg hover:bg-industrial-bg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Seleção do Funcionário e Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1 flex items-center gap-1.5">
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
          </div>

          {/* Aviso se o dia não for útil */}
          {dayOffWarning && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-xl flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <span>{dayOffWarning}</span>
            </div>
          )}

          {/* Aviso de batidas já existentes */}
          {existingPunchesCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <ShieldAlert size={16} className="text-blue-600" />
                <span>Já existem {existingPunchesCount} batida(s) registrada(s) neste dia!</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer font-medium text-blue-800">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={e => setReplaceExisting(e.target.checked)}
                  className="rounded text-cyber-emerald focus:ring-cyber-emerald"
                />
                Substituir/apagar as batidas anteriores deste dia antes de salvar as novas
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
              <span className="text-[10px] text-industrial-muted">Variação natural em cada batida</span>
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

          {/* Prévia das Batidas Sorteada */}
          {selectedEmployee && punches.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-industrial-muted flex items-center gap-1.5">
                  <Sparkles size={14} className="text-cyber-emerald" /> Prévia dos Horários Gerados
                </h4>
                <button
                  type="button"
                  onClick={generatePunchesForDay}
                  className="text-xs font-semibold text-cyber-emerald hover:text-emerald-700 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                  title="Gera novos minutos aleatórios"
                >
                  <RefreshCw size={13} /> Sortear Novamente
                </button>
              </div>

              <div className="space-y-2 border border-industrial-border rounded-xl p-3 bg-white">
                {punches.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-industrial-bg/50 border border-industrial-border/60">
                    <div>
                      <span className="text-xs font-bold text-industrial-text block">{p.type}</span>
                      <span className="text-[11px] text-industrial-muted">
                        Horário Padrão: <strong>{p.baseTime}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        p.minuteDiff > 0 ? 'bg-emerald-100 text-emerald-800' :
                        p.minuteDiff < 0 ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {p.minuteDiff > 0 ? `+${p.minuteDiff}m` : p.minuteDiff < 0 ? `${p.minuteDiff}m` : '0m'}
                      </span>

                      <input
                        type="time"
                        value={p.adjustedTime}
                        onChange={e => handleManualTimeChange(idx, e.target.value)}
                        className="bg-white border border-industrial-border rounded-lg px-2 py-1 text-sm font-mono font-bold focus:border-cyber-emerald focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-industrial-border bg-industrial-bg/30 flex justify-end gap-3">
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
            onClick={handleSaveAutoPunches}
            disabled={isSaving || !selectedEmployeeId || punches.length === 0}
            className="px-6 py-2.5 bg-cyber-emerald text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isSaving ? (
              <>Salvando...</>
            ) : (
              <>
                <Save size={16} /> Gravar Batidas do Dia
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
