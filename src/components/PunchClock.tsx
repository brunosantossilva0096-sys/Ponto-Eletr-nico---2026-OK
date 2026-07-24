import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, TimeLog } from '../types';
import { MapPin, Fingerprint, KeyRound, AlertTriangle, ArrowLeft, CheckCircle2, FileText, LogIn, LogOut, Coffee, Moon } from 'lucide-react';
import { motion } from 'motion/react';
import { EmployeeReports } from './EmployeeReports';

const PUNCH_TYPES = [
  { type: 'Entrada Manhã', label: 'Entrada Manhã', icon: LogIn, color: 'text-cyber-emerald', bg: 'bg-cyber-emerald/10' },
  { type: 'Saída Manhã', label: 'Saída Manhã', icon: Coffee, color: 'text-orange-500', bg: 'bg-orange-50' },
  { type: 'Entrada Tarde', label: 'Entrada Tarde', icon: LogIn, color: 'text-corporate-blue', bg: 'bg-blue-50' },
  { type: 'Saída Tarde', label: 'Saída Tarde', icon: Moon, color: 'text-purple-600', bg: 'bg-purple-50' },
];

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Raio da terra em metros
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(df / 2) * Math.sin(df / 2) +
            Math.cos(f1) * Math.cos(f2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; 
};

export const PunchClock = ({ employee, onBack }: { employee: Employee, onBack: () => void }) => {
  const [time, setTime] = useState(new Date());
  const [status, setStatus] = useState<'idle' | 'locating' | 'ready' | 'verifying' | 'success' | 'error'>('locating');
  const [message, setMessage] = useState('Obtendo localização...');
  const [currentCoords, setCurrentCoords] = useState<{lat: number, lng: number} | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  
  const authMethod = employee.auth_method || 'both';
  const [usePin, setUsePin] = useState(authMethod === 'pin');
  const [pinInput, setPinInput] = useState('');
  const [strictPinVerified, setStrictPinVerified] = useState(false);
  
  const [showReports, setShowReports] = useState(false);
  const [viewReportsAuth, setViewReportsAuth] = useState(false);
  const [reportsPinInput, setReportsPinInput] = useState('');
  
  // Punch type detection
  const [todayLogs, setTodayLogs] = useState<TimeLog[]>([]);
  const [punchIndex, setPunchIndex] = useState(0);

  const currentPunch = punchIndex < PUNCH_TYPES.length ? PUNCH_TYPES[punchIndex] : { type: `Batida Extra #${punchIndex - 3}`, label: `Batida Extra #${punchIndex - 3}`, icon: LogIn, color: 'text-industrial-muted', bg: 'bg-industrial-bg' };
  const PunchIcon = currentPunch.icon;

  // Fetch today's punches to determine next type
  useEffect(() => {
    const fetchTodayLogs = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      let todayOnline: TimeLog[] = [];
      if (navigator.onLine) {
        try {
          const { data } = await supabase
            .from('time_logs')
            .select('*')
            .eq('employee_id', employee.id)
            .gte('timestamp', todayStart.toISOString())
            .lte('timestamp', todayEnd.toISOString())
            .order('timestamp', { ascending: true });
          if (data) todayOnline = data;
        } catch (e) {
          // ignore
        }
      }

      // Merge with offline logs
      const offlineLogs: TimeLog[] = JSON.parse(localStorage.getItem('offline_punches') || '[]')
        .filter((l: TimeLog) => l.employee_id === employee.id && l.timestamp >= todayStart.toISOString() && l.timestamp <= todayEnd.toISOString());

      // Distinct IDs to avoid duplicates if sync just happened
      const allLogs = [...todayOnline, ...offlineLogs];
      const uniqueLogs = Array.from(new Map(allLogs.map(l => [l.id, l])).values());
      uniqueLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      setTodayLogs(uniqueLogs);
      setPunchIndex(uniqueLogs.length);
    };
    fetchTodayLogs();
  }, [employee.id]);

  // Atualizar relógio
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getAuthInstruction = () => {
    return 'Coloque o dedo no leitor ou digite sua senha.';
  };

  // Pegar GPS
  useEffect(() => {
    if (status !== 'locating') return;
    
    const instruction = getAuthInstruction();
    
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (!isMobile) {
      // Ignora GPS no PC (usa apenas o leitor biométrico ou senha)
      setStatus('ready');
      setMessage(instruction);
      return;
    }

    if (!employee.allowed_lat || !employee.allowed_lng) {
      // Se o admin não configurou, permite de qualquer lugar (fallback)
      setStatus('ready');
      setMessage(instruction);
      return;
    }

    const fetchAddressAndCheck = async (lat: number, lng: number, accuracy: number) => {
      let resolvedAddress = 'Endereço não identificado';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        if (data && data.display_name) {
          resolvedAddress = data.display_name;
        }
      } catch (err) {
        console.error('Erro na geocodificação reversa:', err);
      }
      setCurrentAddress(resolvedAddress);

      const dist = calculateDistance(lat, lng, employee.allowed_lat!, employee.allowed_lng!);
      setCurrentCoords({ lat, lng });
      
      if (employee.allowed_radius === 0 || dist <= employee.allowed_radius) {
        setStatus('ready');
        setMessage(`Localização confirmada!\nEndereço: ${resolvedAddress}\n\n${instruction}`);
      } else {
        setStatus('error');
        setMessage(`Você está fora da área de localização permitida para bater o ponto.\nDistância atual: ${Math.round(dist)}m (Máximo: ${employee.allowed_radius}m).`);
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchAddressAndCheck(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        setStatus('error');
        setMessage('Falha ao obter GPS. Permissão negada ou tempo limite excedido.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [status, employee]);

  // Verificar MAC Address se necessário
  useEffect(() => {
    if (status !== 'locating' && status !== 'ready') return;
    
    if (employee.allowed_mac_address) {
      const checkMac = async () => {
        try {
          const res = await fetch('http://127.0.0.1:8000/mac-address');
          const data = await res.json();
          if (!data.success || !data.macAddress) {
             setStatus('error');
             setMessage('Este funcionário tem restrição de computador (MAC Address), mas não foi possível ler o MAC. (Servidor biométrico local rodando?)');
             return;
          }
          if (data.macAddress.toUpperCase() !== employee.allowed_mac_address!.toUpperCase()) {
             setStatus('error');
             setMessage(`Acesso negado: Você só pode bater ponto no computador autorizado.\n(MAC lido: ${data.macAddress})`);
             return;
          }
        } catch (err) {
           setStatus('error');
           setMessage('Restrição de MAC ativa, mas o serviço local de leitura de MAC (server.js) está offline.');
        }
      };
      checkMac();
    }
  }, [status, employee]);

  const recordTimeLog = async (method: string) => {
    setStatus('verifying');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${employee.id}-${Date.now()}`));
    const hashStr = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');

    let finalMethod = method;
    if (authMethod === 'strict') finalMethod = 'Biometria + Senha';

    const log = {
      id: crypto.randomUUID(),
      employee_id: employee.id,
      timestamp: new Date().toISOString(),
      type: currentPunch.type,
      distance: currentCoords && employee.allowed_lat ? calculateDistance(currentCoords.lat, currentCoords.lng, employee.allowed_lat, employee.allowed_lng) : null,
      latitude: currentCoords?.lat || null,
      longitude: currentCoords?.lng || null,
      verification_method: finalMethod,
      hash_assinatura: hashStr,
      pis_pasep_trabalhador: employee.pis,
      cpf_trabalhador: employee.cpf
    };

    if (!navigator.onLine) {
      // Salvar offline
      const offlineLogs = JSON.parse(localStorage.getItem('offline_punches') || '[]');
      offlineLogs.push(log);
      localStorage.setItem('offline_punches', JSON.stringify(offlineLogs));
      setStatus('success');
      setMessage(`${currentPunch.label} salvo OFFLINE! (Será sincronizado quando houver internet)`);
      setTimeout(() => onBack(), 4000);
      return;
    }

    const { error } = await supabase.from('time_logs').insert([log]);
    
    if (error) {
      // Falhou o insert por rede mesmo estando online?
      if (error.message && error.message.toLowerCase().includes('fetch')) {
        const offlineLogs = JSON.parse(localStorage.getItem('offline_punches') || '[]');
        offlineLogs.push(log);
        localStorage.setItem('offline_punches', JSON.stringify(offlineLogs));
        setStatus('success');
        setMessage(`${currentPunch.label} salvo OFFLINE (Erro de rede).`);
        setTimeout(() => onBack(), 4000);
      } else {
        setStatus('error');
        setMessage('Erro ao salvar no servidor.');
      }
    } else {
      setStatus('success');
      setMessage(`${currentPunch.label} registrado com sucesso!`);
      setTimeout(() => onBack(), 3000);
    }
  };

  const handleFingerprint = async () => {
    if (status !== 'ready') return;
    setStatus('verifying');
    setMessage('Escaneando digital...');
    
    try {
      // 1. Pegar digital cadastrada (banco ou cache)
      let templateStr = null;
      if (navigator.onLine) {
        const { data: dbData } = await supabase.from('biometric_templates').select('template').eq('employee_id', employee.id).maybeSingle();
        if (dbData) templateStr = dbData.template;
      } else {
        const cachedBio = JSON.parse(localStorage.getItem('offline_templates') || '[]');
        const userBio = cachedBio.find((b: any) => b.employee_id === employee.id);
        if (userBio) templateStr = userBio.template;
      }

      if (!templateStr) {
        throw new Error("Sua digital não está cadastrada no sistema (ou não está no cache offline).");
      }

      // 2. Capturar digital do sensor local
      const capRes = await fetch('http://127.0.0.1:8000/SGIFPCapture', { method: 'POST' });
      if (!capRes.ok) throw new Error("Leitor não conectado ou falhou.");
      const capData = await capRes.json();
      if (!capData.success) throw new Error("Falha ao ler o dedo.");

      // 3. Comparar
      const matchRes = await fetch('http://127.0.0.1:8000/SGIFPMatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template1: capData.template, template2: templateStr })
      });
      const matchData = await matchRes.json();
      
      if (matchData.matched) {
        await recordTimeLog('Biometria SecuGen');
      } else {
        setStatus('error');
        setMessage('Digital não confere.');
      }
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || "Erro de comunicação com o leitor.");
    }
  };

  const handlePinAuth = () => {
    if (pinInput !== employee.pin) {
      alert('Senha incorreta!');
      return;
    }
    
    if (authMethod === 'strict') {
      setStrictPinVerified(true);
      setUsePin(false);
      setPinInput('');
      setMessage('Senha validada! Agora coloque seu dedo no leitor.');
      return;
    }
    
    recordTimeLog('Senha PIN');
  };

  const handleReportsPinAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (reportsPinInput === employee.pin) {
      setViewReportsAuth(false);
      setReportsPinInput('');
      setShowReports(true);
    } else {
      alert('Senha incorreta.');
    }
  };

  if (showReports) {
    return <EmployeeReports employee={employee} onBack={() => setShowReports(false)} />;
  }

  return (
    <div className="min-h-screen bg-industrial-bg flex flex-col items-center justify-center p-4">
      <button onClick={onBack} className="absolute top-6 left-6 text-industrial-muted hover:text-industrial-text flex items-center gap-2">
        <ArrowLeft size={16} /> Cancelar
      </button>

      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-industrial-border"
      >
        <div className="p-8 text-center bg-industrial-bg border-b border-industrial-border">
          <p className="text-industrial-muted font-semibold uppercase tracking-wider text-xs mb-2">Olá, {employee.name}</p>
          <div className="text-5xl font-bold font-mono tracking-tighter text-industrial-text">
            {time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <p className="text-sm text-industrial-muted mt-2">{time.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          
          {/* Punch type indicator */}
          <div className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full ${currentPunch.bg} ${currentPunch.color} font-bold text-sm`}>
            <PunchIcon size={16} />
            {currentPunch.label}
          </div>
          
          {/* Today's punches summary */}
          {todayLogs.length > 0 && (
            <div className="mt-3 flex justify-center gap-2 flex-wrap">
              {todayLogs.map((log, idx) => {
                const punchInfo = idx < PUNCH_TYPES.length ? PUNCH_TYPES[idx] : null;
                return (
                  <span key={log.id} className="text-[10px] bg-white border border-industrial-border px-2 py-1 rounded-md text-industrial-muted">
                    {punchInfo ? punchInfo.label : `Extra #${idx - 3}`}: {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-8 flex flex-col items-center justify-center min-h-[250px]">
          {status === 'locating' && (
            <div className="animate-pulse flex flex-col items-center text-cyber-emerald">
              <MapPin size={48} className="mb-4" />
              <p>{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center text-cyber-emerald">
              <CheckCircle2 size={64} className="mb-4" />
              <p className="font-bold text-lg">{message}</p>
            </div>
          )}

          {(status === 'error' || status === 'ready' || status === 'verifying') && (
            <div className="w-full text-center">
              {status === 'error' && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 flex flex-col items-center">
                  <AlertTriangle size={32} className="mb-2" />
                  <p className="font-semibold whitespace-pre-line">{message}</p>
                  <button onClick={() => setStatus('locating')} className="mt-4 underline text-sm">Tentar Novamente GPS</button>
                </div>
              )}

              {status !== 'error' && status !== 'success' && (
                <p className="text-industrial-muted mb-6 whitespace-pre-line">{message}</p>
              )}

              {status === 'ready' && (!usePin || strictPinVerified) && authMethod !== 'pin' && (
                <button 
                  onClick={handleFingerprint}
                  className="w-full py-4 rounded-2xl bg-cyber-emerald text-white font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all shadow-lg shadow-cyber-emerald/20"
                >
                  <Fingerprint size={24} /> Registrar {currentPunch.label}
                </button>
              )}
              
              {status === 'ready' && (usePin || authMethod === 'strict' && !strictPinVerified) && (
                <div className="space-y-4">
                  <input 
                    type="password" 
                    value={pinInput} 
                    onChange={e => setPinInput(e.target.value)} 
                    placeholder="Digite sua senha" 
                    className="w-full bg-industrial-bg border border-industrial-border rounded-xl p-3 text-center tracking-[0.25em] text-lg focus:border-cyber-emerald focus:outline-none"
                  />
                  <button onClick={handlePinAuth} className="w-full py-4 rounded-2xl bg-industrial-text text-white font-bold">
                    {authMethod === 'strict' ? 'Próximo Passo (Biometria)' : 'Confirmar Senha'}
                  </button>
                </div>
              )}

              {status === 'ready' && authMethod === 'both' && (
                <button onClick={() => setUsePin(!usePin)} className="mt-6 text-sm text-industrial-muted hover:text-industrial-text flex items-center justify-center gap-2 w-full">
                  <KeyRound size={16} /> {usePin ? 'Usar Digital' : 'Digital não funcionou? Usar Senha'}
                </button>
              )}

              <button 
                onClick={() => setViewReportsAuth(true)} 
                className="mt-4 text-xs font-semibold text-industrial-muted hover:text-cyber-emerald flex items-center justify-center gap-1.5 w-full pt-4 border-t border-industrial-border/50"
              >
                <FileText size={14} /> Ver Meu Espelho e Banco de Horas (PDF)
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {viewReportsAuth && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[1000] animate-fade-in">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center space-y-4">
            <h3 className="font-bold text-lg flex items-center justify-center gap-2 text-industrial-text"><KeyRound size={20} className="text-cyber-emerald" /> Confirmar Senha</h3>
            <p className="text-xs text-industrial-muted">Para acessar seu espelho de ponto, digite sua senha de acesso.</p>
            <form onSubmit={handleReportsPinAuth} className="space-y-4">
              <input 
                type="password" 
                required
                value={reportsPinInput} 
                onChange={e => setReportsPinInput(e.target.value)} 
                placeholder="Senha de Acesso" 
                className="w-full bg-industrial-bg border border-industrial-border rounded-xl p-3 text-center tracking-[0.25em] text-lg focus:border-cyber-emerald focus:outline-none"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setViewReportsAuth(false); setReportsPinInput(''); }} className="flex-1 py-2.5 rounded-xl border border-industrial-border text-sm font-semibold hover:bg-industrial-bg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-cyber-emerald text-white text-sm font-bold hover:bg-opacity-90 transition-colors">
                  Acessar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
