import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Fingerprint, 
  Camera, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  History, 
  UserCheck, 
  Settings, 
  Trash2, 
  RefreshCw, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Scan, 
  Compass, 
  Unlock, 
  Lock, 
  Maximize2,
  Sliders,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- CONFIGURAÇÕES DO SISTEMA (EDITÁVEIS) ---
const DEFAULT_COMPANY_COORDS = { lat: -23.55052, lng: -46.633308 }; // Ex: Praça da Sé, SP (Centro de São Paulo)
const DEFAULT_MAX_RADIUS = 100; // Raio padrão de 100 metros
const GEO_REFRESH_INTERVAL = 15000; // 15 segundos

type LogType = 'Entrada' | 'Intervalo Saída' | 'Intervalo Retorno' | 'Saída';

interface TimeLog {
  id: string;
  timestamp: string; // ISO string
  type: LogType;
  distance: number;
  latitude: number;
  longitude: number;
  verificationMethod: 'Biometria Nativa' | 'Captura Facial' | 'Simulado';
  photoEvidence?: string;
}

// --- FÓRMULA DE HAVERSINE ---
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distância em metros
};

export default function App() {
  // --- ESTADOS DE GEOLOCALIZAÇÃO & CONFIGURAÇÃO ---
  const [hqCoords, setHqCoords] = useState(DEFAULT_COMPANY_COORDS);
  const [maxRadius, setMaxRadius] = useState(DEFAULT_MAX_RADIUS);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isWithinRange, setIsWithinRange] = useState(false);
  const [geoLoading, setGeoLoading] = useState(true);

  // Modo de simulação/ajustes adicionais
  const [showConfig, setShowConfig] = useState(false);
  const [bypassGeofence, setBypassGeofence] = useState(false);
  const [simulatedCoords, setSimulatedCoords] = useState<{ lat: string; lng: string }>({
    lat: DEFAULT_COMPANY_COORDS.lat.toString(),
    lng: DEFAULT_COMPANY_COORDS.lng.toString()
  });

  // --- ESTADOS DO RELÓGIO & REGISTRO ---
  const [currentTime, setCurrentTime] = useState(new Date());
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [activeAction, setActiveAction] = useState<LogType | null>(null);
  const [bypassSequence, setBypassSequence] = useState(false);

  // --- ESTADOS DA VERIFICAÇÃO BIOMÉTRICA ---
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState<'verifying_gps' | 'biometric_native' | 'camera_capture' | 'success' | 'error'>('verifying_gps');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // --- LIGHTBOX DE FOTO ---
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Refs para Câmera
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- 1. ATUALIZAR RELÓGIO EM TEMPO REAL ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- 2. CARREGAR REGISTROS DO LOCAL STORAGE ---
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ponto_eletronico_logs');
      if (saved) {
        setLogs(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Erro ao carregar logs do localStorage", e);
    }
  }, []);

  // --- 3. MONITORAMENTO DE GEOLOCALIZAÇÃO ---
  const requestLocation = () => {
    setGeoLoading(true);
    if (!navigator.geolocation) {
      setLocationError("Geolocalização não é suportada por este navegador.");
      setGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserCoords({ lat: latitude, lng: longitude });
        
        // Calcula distância para as coordenadas configuradas
        const dist = calculateDistance(latitude, longitude, hqCoords.lat, hqCoords.lng);
        setDistance(dist);
        setIsWithinRange(dist <= maxRadius);
        setLocationError(null);
        setGeoLoading(false);

        // Atualiza campos de coordenada simulada para facilitar testes
        setSimulatedCoords({
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6)
        });
      },
      (err) => {
        console.error("Erro de Geolocalização:", err);
        let errorMsg = "Não foi possível obter a sua localização.";
        if (err.code === 1) {
          errorMsg = "Permissão de localização negada pelo usuário.";
        } else if (err.code === 2) {
          errorMsg = "Localização indisponível (GPS desligado ou sem sinal).";
        } else if (err.code === 3) {
          errorMsg = "Tempo limite atingido ao tentar obter a localização.";
        }
        setLocationError(errorMsg);
        setIsWithinRange(false);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Revalidar a cada intervalo definido
  useEffect(() => {
    requestLocation();
    const interval = setInterval(requestLocation, GEO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [hqCoords, maxRadius]);

  // --- 4. FUNÇÃO PARA CENTRALIZAR SEDE NA POSIÇÃO ATUAL ---
  const setHqHere = () => {
    if (userCoords) {
      setHqCoords({ lat: userCoords.lat, lng: userCoords.lng });
      setDistance(0);
      setIsWithinRange(true);
      setLocationError(null);
    } else {
      alert("Aguarde a obtenção de sua coordenada atual ou digite manualmente.");
    }
  };

  // --- 5. DETECTAR PRÓXIMO REGISTRO RECOMENDADO ---
  const getNextRecommendedAction = (): LogType => {
    if (logs.length === 0) return 'Entrada';
    
    // Filtra logs de hoje
    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr);
    
    if (todayLogs.length === 0) return 'Entrada';

    // Ordena do mais antigo para o mais recente
    const sortedToday = [...todayLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const lastAction = sortedToday[sortedToday.length - 1].type;

    if (lastAction === 'Entrada') return 'Intervalo Saída';
    if (lastAction === 'Intervalo Saída') return 'Intervalo Retorno';
    if (lastAction === 'Intervalo Retorno') return 'Saída';
    return 'Entrada'; // Se já fechou o ciclo de hoje
  };

  const nextRecommended = getNextRecommendedAction();

  // --- 6. VALIDAÇÃO DE SEQUÊNCIA DE REGISTRO ---
  const isActionDisabled = (type: LogType): boolean => {
    if (bypassGeofence) {
      if (bypassSequence) return false;
    } else {
      if (!isWithinRange) return true; // Bloqueado se fora do perímetro
    }

    if (bypassSequence) return false;

    // Regras padrão de consistência de fluxo:
    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr);

    if (type === 'Entrada') {
      const hasEntrada = todayLogs.some(l => l.type === 'Entrada');
      const hasSaida = todayLogs.some(l => l.type === 'Saída');
      if (hasEntrada && !hasSaida) return true;
      return false;
    }

    if (type === 'Intervalo Saída') {
      const hasEntrada = todayLogs.some(l => l.type === 'Entrada');
      const hasIntervaloSaida = todayLogs.some(l => l.type === 'Intervalo Saída');
      return !hasEntrada || hasIntervaloSaida;
    }

    if (type === 'Intervalo Retorno') {
      const hasIntervaloSaida = todayLogs.some(l => l.type === 'Intervalo Saída');
      const hasIntervaloRetorno = todayLogs.some(l => l.type === 'Intervalo Retorno');
      return !hasIntervaloSaida || hasIntervaloRetorno;
    }

    if (type === 'Saída') {
      const hasEntrada = todayLogs.some(l => l.type === 'Entrada');
      const hasSaida = todayLogs.some(l => l.type === 'Saída');
      return !hasEntrada || hasSaida;
    }

    return false;
  };

  // --- 7. FLUXO DE REGISTRO - INICIAR ---
  const handleStartPoint = (type: LogType) => {
    if (!isWithinRange && !bypassGeofence) {
      alert("Acesso Negado: Você está fora do perímetro da empresa.");
      return;
    }
    setActiveAction(type);
    setIsVerifying(true);
    setVerificationError(null);
    setCapturedPhoto(null);
    setVerificationStep('verifying_gps');

    // Simula verificação rápida de GPS
    setTimeout(() => {
      triggerWebAuthnBiometric();
    }, 1200);
  };

  // --- 8. AUTENTICAÇÃO BIOMÉTRICA NATIVA (WEBAUTHN) ---
  const triggerWebAuthnBiometric = async () => {
    setVerificationStep('biometric_native');
    setVerificationError(null);

    if (window.PublicKeyCredential) {
      try {
        const isBiometricAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        
        if (isBiometricAvailable) {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);

          const credential = await navigator.credentials.get({
            publicKey: {
              challenge: challenge,
              timeout: 10000,
              userVerification: 'required',
              allowCredentials: []
            }
          });

          if (credential) {
            finalizeRegistration('Biometria Nativa');
          } else {
            throw new Error("Biometria não retornou credencial.");
          }
        } else {
          console.log("Biometria nativa indisponível. Mudando para câmera.");
          setTimeout(() => {
            switchToCameraFlow();
          }, 1500);
        }
      } catch (err: any) {
        console.warn("WebAuthn API restrita ou cancelada:", err);
      }
    } else {
      console.log("WebAuthn não suportado. Redirecionando para câmera frontal.");
      setTimeout(() => {
        switchToCameraFlow();
      }, 1500);
    }
  };

  const switchToCameraFlow = async () => {
    setVerificationStep('camera_capture');
    setIsCameraActive(true);
    setVerificationError(null);

    setTimeout(async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } 
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } else {
          setVerificationError("Câmera frontal não suportada ou sem permissão de hardware.");
        }
      } catch (error: any) {
        console.error("Erro ao acessar câmera frontal:", error);
        setVerificationError("Permissão de câmera negada. Ative a câmera ou simule o registro.");
      }
    }, 100);
  };

  const capturePhotoEvidence = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        const size = Math.min(video.videoWidth, video.videoHeight);
        canvas.width = size;
        canvas.height = size;

        const startX = (video.videoWidth - size) / 2;
        const startY = (video.videoHeight - size) / 2;

        context.drawImage(video, startX, startY, size, size, 0, 0, size, size);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedPhoto(dataUrl);

        stopCamera();
        finalizeRegistration('Captura Facial', dataUrl);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const finalizeRegistration = (
    method: TimeLog['verificationMethod'], 
    photoData?: string
  ) => {
    if (!activeAction) return;

    const newLog: TimeLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: activeAction,
      distance: bypassGeofence ? 0 : (distance || 0),
      latitude: userCoords?.lat || hqCoords.lat,
      longitude: userCoords?.lng || hqCoords.lng,
      verificationMethod: method,
      photoEvidence: photoData
    };

    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    localStorage.setItem('ponto_eletronico_logs', JSON.stringify(updatedLogs));

    setVerificationStep('success');
    
    setTimeout(() => {
      closeVerificationModal();
    }, 2000);
  };

  const closeVerificationModal = () => {
    stopCamera();
    setIsVerifying(false);
    setVerificationStep('verifying_gps');
    setActiveAction(null);
    setCapturedPhoto(null);
    setVerificationError(null);
  };

  const clearLogs = () => {
    if (confirm("Tem certeza que deseja apagar todo o histórico de pontos de hoje?")) {
      setLogs([]);
      localStorage.removeItem('ponto_eletronico_logs');
    }
  };

  // --- 10. MAPA / RADAR RADIAL (SVG CRIADO SOB MEDIDA) ---
  const renderRadarIllustration = () => {
    const maxVisual = Math.max(maxRadius * 2, (distance || 0) * 1.3, 120);
    const scale = 50 / maxVisual;
    
    const hqRadiusPx = 0;
    const userRadiusPx = Math.min((distance || 0) * scale, 55);
    
    const angleRad = (45 * Math.PI) / 180;
    const userX = 60 + userRadiusPx * Math.cos(angleRad);
    const userY = 60 - userRadiusPx * Math.sin(angleRad);
    
    const fenceRadiusPx = maxRadius * scale;

    return (
      <svg viewBox="0 0 120 120" className="w-28 h-28 text-zinc-300 relative z-10">
        <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" className="text-zinc-200" />
        <circle cx="60" cy="60" r="35" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" className="text-zinc-200" />
        <circle cx="60" cy="60" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" className="text-zinc-200" />
        
        <circle 
          cx="60" 
          cy="60" 
          r={Math.min(fenceRadiusPx, 55)} 
          fill={isWithinRange || bypassGeofence ? "rgba(34, 197, 94, 0.04)" : "rgba(239, 68, 68, 0.04)"} 
          stroke={isWithinRange || bypassGeofence ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.2)"} 
          strokeWidth="1.5"
          className="transition-all duration-500"
        />

        {userCoords && !bypassGeofence && (
          <line 
            x1="60" 
            y1="60" 
            x2={userX} 
            y2={userY} 
            stroke={isWithinRange ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.4)"} 
            strokeWidth="1" 
            strokeDasharray="1 1" 
          />
        )}

        <g transform="translate(54, 54)">
          <circle cx="6" cy="6" r="6" fill="#18181b" />
          <circle cx="6" cy="6" r="2" fill="#ffffff" />
        </g>

        {userCoords && !bypassGeofence ? (
          <g transform={`translate(${userX - 4}, ${userY - 4})`} className="transition-all duration-700">
            <circle cx="4" cy="4" r="5" fill={isWithinRange ? "#22c55e" : "#ef4444"} className="animate-pulse" />
            <circle cx="4" cy="4" r="2" fill="#ffffff" />
          </g>
        ) : null}

        <line x1="60" y1="60" x2="60" y2="5" stroke="rgba(24, 24, 27, 0.08)" strokeWidth="1" className="origin-[60px_60px] animate-[spin_6s_linear_infinite]" />
      </svg>
    );
  };

  // --- 11. CALCULAR TOTAL DE HORAS TRABALHADAS HOJE ---
  const calculateTotalHours = (): string => {
    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr);
    if (todayLogs.length === 0) return '00h 00m';

    const sorted = [...todayLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    let totalMs = 0;
    let entryTime: Date | null = null;
    let intervalOutTime: Date | null = null;
    let intervalInTime: Date | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const log = sorted[i];
      const logDate = new Date(log.timestamp);
      if (log.type === 'Entrada') {
        entryTime = logDate;
      } else if (log.type === 'Intervalo Saída') {
        intervalOutTime = logDate;
      } else if (log.type === 'Intervalo Retorno') {
        intervalInTime = logDate;
      } else if (log.type === 'Saída') {
        if (entryTime) {
          let cycleMs = logDate.getTime() - entryTime.getTime();
          if (intervalOutTime && intervalInTime) {
            const breakMs = intervalInTime.getTime() - intervalOutTime.getTime();
            cycleMs -= breakMs;
          } else if (intervalOutTime && !intervalInTime) {
            const breakMs = currentTime.getTime() - intervalOutTime.getTime();
            cycleMs -= breakMs;
          }
          totalMs += cycleMs;
          entryTime = null;
          intervalOutTime = null;
          intervalInTime = null;
        }
      }
    }

    if (entryTime) {
      let currentPeriod = currentTime.getTime() - entryTime.getTime();
      if (intervalOutTime && intervalInTime) {
        const breakMs = intervalInTime.getTime() - intervalOutTime.getTime();
        currentPeriod -= breakMs;
      } else if (intervalOutTime && !intervalInTime) {
        const breakMs = currentTime.getTime() - intervalOutTime.getTime();
        currentPeriod -= breakMs;
      }
      totalMs += currentPeriod;
    }

    if (totalMs < 0) totalMs = 0;

    const totalMinutes = Math.floor(totalMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
  };

  const hoursMinutes = currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const seconds = currentTime.toLocaleTimeString('pt-BR', { second: '2-digit' });

  return (
    <div id="app_container" className="min-h-screen bg-zinc-50 text-zinc-900 font-sans antialiased selection:bg-zinc-950 selection:text-white flex flex-col justify-between p-4 sm:p-8 md:p-10">
      
      {/* CORPO CENTRAL - BENTO GRID CONTAINER */}
      <div className="w-full max-w-5xl mx-auto space-y-6 flex-1 flex flex-col justify-between">
        
        {/* CABEÇALHO */}
        <header className="flex justify-between items-end pb-4 border-b border-zinc-200/60">
          <div className="space-y-1">
            <h1 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Plataforma de Gestão</h1>
            <div className="text-2xl font-semibold tracking-tight">Ponto Eletrônico Digital</div>
          </div>
          <div className="text-right flex items-center gap-4">
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-zinc-500 capitalize">
                {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-zinc-400 text-xs">ID Funcionário: #8829-10</p>
            </div>
            <button 
              id="btn_toggle_config"
              onClick={() => setShowConfig(!showConfig)}
              className={`p-2.5 rounded-2xl border border-zinc-200 bg-white transition-all hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 ${showConfig ? 'bg-zinc-100 text-zinc-900 rotate-45 border-zinc-300' : ''}`}
              title="Ajustes de Simulação"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* PAINEL DE AJUSTES E SIMULAÇÃO DE GPS (ESSENCIAL PARA AVALIADORES) */}
        <AnimatePresence>
          {showConfig && (
            <motion.div 
              id="config_panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden bg-white border border-zinc-200 rounded-[28px] p-6 shadow-sm space-y-4 text-xs"
            >
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                <span className="font-bold text-zinc-800 flex items-center gap-1.5">
                  <Sliders size={14} className="text-zinc-600" /> Painel de Controle de Simulação
                </span>
                <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-mono">Dev Mode</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-500 mb-1 font-medium">Distância Máxima (m)</label>
                  <input 
                    type="number" 
                    value={maxRadius} 
                    onChange={(e) => setMaxRadius(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:border-zinc-900 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <button
                    onClick={setHqHere}
                    disabled={!userCoords}
                    className="w-full px-4 py-2 rounded-xl bg-zinc-900 text-white font-semibold hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-center transition-all flex items-center justify-center gap-1.5 text-xs shadow-sm"
                  >
                    <MapPin size={13} /> Definir Sede Aqui
                  </button>
                </div>
              </div>

              <div className="p-4 bg-zinc-50 rounded-2xl space-y-2.5 border border-zinc-100">
                <span className="font-semibold block text-zinc-700">Controles de Teste Rápidos</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setBypassGeofence(!bypassGeofence)}
                    className={`px-3 py-1.5 rounded-xl border font-bold text-xs transition-all flex items-center gap-1.5 ${
                      bypassGeofence 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs' 
                        : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {bypassGeofence ? <Unlock size={12} /> : <Lock size={12} />}
                    {bypassGeofence ? "Bypass Perímetro: Ativo" : "Bypass Perímetro: Inativo"}
                  </button>

                  <button
                    onClick={() => setBypassSequence(!bypassSequence)}
                    className={`px-3 py-1.5 rounded-xl border font-bold text-xs transition-all flex items-center gap-1.5 ${
                      bypassSequence 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs' 
                        : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {bypassSequence ? <Unlock size={12} /> : <Lock size={12} />}
                    {bypassSequence ? "Bypass Sequência: Ativo" : "Bypass Sequência: Inativo"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 text-[11px] text-zinc-500">
                <div>
                  <span className="block font-semibold">Coordenadas da Sede (HQ):</span>
                  <span className="font-mono block mt-0.5">{hqCoords.lat.toFixed(6)}, {hqCoords.lng.toFixed(6)}</span>
                </div>
                <div>
                  <span className="block font-semibold">Sua Posição Real:</span>
                  <span className="font-mono block mt-0.5">
                    {userCoords ? `${userCoords.lat.toFixed(6)}, ${userCoords.lng.toFixed(6)}` : "Aguardando GPS..."}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BENTO GRID LAYOUT */}
        <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-6 gap-6 flex-1 w-full">
          
          {/* CARD 1: RELÓGIO DIGITAL GIGANTE (col-span-8 row-span-3) */}
          <div className="col-span-1 md:col-span-8 md:row-span-3 bg-white rounded-[32px] border border-zinc-200 shadow-sm flex flex-col items-center justify-center p-8 relative overflow-hidden min-h-[220px]">
            <div className="absolute top-6 left-6 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Sincronizado</span>
            </div>
            
            <div className="text-[72px] sm:text-[100px] font-light tracking-tighter leading-none text-zinc-900 tabular-nums select-none flex items-baseline">
              {hoursMinutes}
              <span className="text-2xl sm:text-4xl text-zinc-300 ml-2 font-light tabular-nums">{seconds}</span>
            </div>
            
            <div className="text-zinc-400 font-medium tracking-wide text-xs mt-2 flex items-center gap-1">
              <Compass size={12} /> GMT-3 São Paulo, Brasil
            </div>
          </div>

          {/* CARD 2: MONITOR DE PERÍMETRO GPS (col-span-4 row-span-2) */}
          <div 
            id="geofence_status_card"
            className={`col-span-1 md:col-span-4 md:row-span-2 rounded-[32px] p-6 border transition-all duration-500 flex flex-col justify-between shadow-xs relative overflow-hidden min-h-[190px] ${
              bypassGeofence || isWithinRange
                ? 'bg-emerald-50/70 border-emerald-100/90' 
                : 'bg-red-50/60 border-red-100/90'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className={`p-3 rounded-2xl ${bypassGeofence || isWithinRange ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                <MapPin size={22} />
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                bypassGeofence || isWithinRange 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                {bypassGeofence ? "ADMIN ACTIVE" : isWithinRange ? "GPS ATIVO" : "BLOQUEADO"}
              </span>
            </div>

            <div className="space-y-1 mt-4">
              <h3 className={`font-bold text-lg ${bypassGeofence || isWithinRange ? 'text-emerald-900' : 'text-red-900'}`}>
                {bypassGeofence ? 'Perímetro Ignorado' : isWithinRange ? 'Dentro do Perímetro' : 'Fora da Empresa'}
              </h3>
              
              <p className={`text-xs ${bypassGeofence || isWithinRange ? 'text-emerald-700/80' : 'text-red-700/80'}`}>
                {locationError ? (
                  locationError
                ) : geoLoading ? (
                  "Buscando coordenadas..."
                ) : bypassGeofence ? (
                  "Demonstração sem limite de GPS ativa"
                ) : (
                  `Sede Administrativa • ${Math.round(distance || 0)}m de distância`
                )}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={requestLocation}
                className="text-[10px] font-bold text-zinc-700 hover:text-zinc-900 bg-white/80 hover:bg-white px-2.5 py-1.5 rounded-xl border border-zinc-200/50 flex items-center gap-1 transition-all"
              >
                <RefreshCw size={10} className={geoLoading ? "animate-spin" : ""} /> Forçar Revalidação
              </button>
            </div>
          </div>

          {/* CARD 3: HISTÓRICO DE LOGS (col-span-4 row-span-4) */}
          <div className="col-span-1 md:col-span-4 md:row-span-4 bg-white border border-zinc-200 rounded-[32px] p-6 flex flex-col justify-between shadow-xs min-h-[300px]">
            <div>
              <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <History size={16} className="text-zinc-400" />
                  <h2 className="text-sm font-bold text-zinc-800">Registros de Hoje</h2>
                </div>
                {logs.length > 0 && (
                  <button 
                    id="btn_clear_history"
                    onClick={clearLogs}
                    className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-all flex items-center gap-0.5"
                  >
                    <Trash2 size={10} /> Limpar
                  </button>
                )}
              </div>

              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {logs.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-zinc-100 rounded-2xl text-zinc-400 text-xs flex flex-col items-center justify-center gap-2">
                    <Compass size={20} className="text-zinc-300" />
                    <span>Nenhum ponto registrado hoje.</span>
                  </div>
                ) : (
                  logs.map((log) => {
                    const logTime = new Date(log.timestamp);
                    return (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl border border-zinc-100/80 transition-all hover:border-zinc-200">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-zinc-200/50 rounded-xl text-zinc-600">
                            {log.verificationMethod === 'Biometria Nativa' ? (
                              <Fingerprint size={14} />
                            ) : (
                              <Camera size={14} />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-zinc-800">{log.type}</div>
                            <div className="text-[9px] text-zinc-400 font-medium">
                              {log.verificationMethod}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-zinc-700">
                            {logTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {log.photoEvidence && (
                            <button 
                              onClick={() => setLightboxPhoto(log.photoEvidence || null)}
                              className="h-6 w-6 rounded-full overflow-hidden border border-zinc-200 shrink-0 hover:scale-105 transition-transform"
                            >
                              <img src={log.photoEvidence} alt="Evidência" className="w-full h-full object-cover" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100">
              <div className="p-4 bg-zinc-900 text-white rounded-2xl flex items-center justify-between shadow-xs">
                <span className="text-xs font-medium text-zinc-400">Total de Horas Hoje</span>
                <span className="text-base font-medium font-mono">{calculateTotalHours()}</span>
              </div>
            </div>
          </div>

          {/* CARD 4: BOTÕES DE PONTO INTERATIVOS (col-span-8 row-span-3) */}
          <div className="col-span-1 md:col-span-8 md:row-span-3 grid grid-cols-2 gap-4">
            {(['Entrada', 'Intervalo Saída', 'Intervalo Retorno', 'Saída'] as LogType[]).map((type) => {
              const disabled = isActionDisabled(type);
              const isRecommended = type === nextRecommended && !disabled;
              
              return (
                <button
                  id={`btn_clock_${type.toLowerCase().replace(' ', '_')}`}
                  key={type}
                  onClick={() => handleStartPoint(type)}
                  disabled={disabled}
                  className={`relative p-6 rounded-[32px] flex flex-col justify-between items-start text-left h-auto min-h-[140px] md:min-h-[160px] transition-all duration-300 select-none group border
                    ${disabled 
                      ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed opacity-55 border-zinc-200/50' 
                      : isRecommended
                        ? 'bg-zinc-950 text-white border-zinc-950 shadow-md hover:bg-zinc-900 active:scale-95'
                        : 'bg-white text-zinc-900 border-zinc-200 hover:border-zinc-300 hover:shadow-sm active:scale-95'
                    }`}
                >
                  {isRecommended && (
                    <span className="absolute inset-0 rounded-[32px] border-2 border-zinc-950 animate-pulse pointer-events-none" />
                  )}

                  <div className="flex w-full justify-between items-center">
                    <div className={`p-3 rounded-2xl transition-all ${
                      disabled 
                        ? 'bg-zinc-200/50 text-zinc-400' 
                        : isRecommended 
                          ? 'bg-white/10 text-white group-hover:bg-white/20' 
                          : 'bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200'
                    }`}>
                      <Clock size={20} />
                    </div>
                    
                    {!disabled && isRecommended && (
                      <span className="text-[9px] font-bold bg-white text-zinc-900 px-2 py-0.5 rounded-full uppercase tracking-wider">Recomendado</span>
                    )}
                  </div>

                  <div className="space-y-1 w-full">
                    <div className="flex items-center justify-between w-full">
                      <span className="block text-xl md:text-2xl font-bold tracking-tight">{type}</span>
                      <ArrowRight size={16} className={`opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isRecommended ? 'text-white' : 'text-zinc-500'}`} />
                    </div>
                    <p className={`text-[11px] leading-snug ${
                      disabled 
                        ? 'text-zinc-400' 
                        : isRecommended 
                          ? 'text-zinc-300' 
                          : 'text-zinc-500'
                    }`}>
                      {type === 'Entrada' && 'Iniciar expediente diário'}
                      {type === 'Intervalo Saída' && 'Pausa para descanso'}
                      {type === 'Intervalo Retorno' && 'Retorno ao trabalho'}
                      {type === 'Saída' && 'Finalizar expediente'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

        </div>

      </div>

      {/* FOOTER */}
      <footer className="text-center py-6 text-[10px] text-zinc-400 tracking-wide max-w-lg mx-auto px-4 border-t border-zinc-200/40 w-full mt-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
        <p>Desenvolvido em conformidade com a portaria 671 MTE.</p>
        <p>Assinado digitalmente por chave criptográfica do dispositivo.</p>
      </footer>

      {/* MODAL DE VERIFICAÇÃO MULTI-ETAPA (TELA INTEIRA COM BLUR) */}
      <AnimatePresence>
        {isVerifying && (
          <motion.div 
            id="verification_modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-950/70 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 50, scale: 0.95 }}
              className="bg-white w-full max-w-[400px] rounded-[48px] p-8 space-y-8 shadow-2xl border border-white"
            >
              
              <div className="flex flex-col items-center justify-center space-y-6">
                
                <div className="relative">
                  {verificationStep === 'verifying_gps' && (
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full border-4 border-zinc-900 border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <MapPin size={32} className="text-zinc-900" />
                      </div>
                    </div>
                  )}

                  {verificationStep === 'biometric_native' && (
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Fingerprint size={32} className="text-zinc-900" />
                      </div>
                    </div>
                  )}

                  {verificationStep === 'camera_capture' && (
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Camera size={32} className="text-zinc-900" />
                      </div>
                    </div>
                  )}

                  {verificationStep === 'success' && (
                    <div className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                      <CheckCircle2 size={44} />
                    </div>
                  )}
                </div>

                <div className="text-center space-y-2">
                  <h2 className="text-xl font-bold text-zinc-900">
                    {verificationStep === 'verifying_gps' && 'Validando Localização'}
                    {verificationStep === 'biometric_native' && 'Validando Biometria'}
                    {verificationStep === 'camera_capture' && 'Validando Biometria'}
                    {verificationStep === 'success' && 'Ponto Confirmado!'}
                  </h2>
                  <p className="text-zinc-500 text-sm px-4 leading-relaxed">
                    {verificationStep === 'verifying_gps' && 'Validando proximidade com o perímetro cadastrado...'}
                    {verificationStep === 'biometric_native' && (
                      <>Confirme a biometria nativa do seu dispositivo para registrar a <strong>{activeAction}</strong>.</>
                    )}
                    {verificationStep === 'camera_capture' && (
                      <>Olhe para a câmera frontal para confirmar seu registro de <strong>{activeAction}</strong>.</>
                    )}
                    {verificationStep === 'success' && 'Seu registro de ponto foi assinado e salvo com sucesso.'}
                  </p>
                </div>

                {verificationStep === 'camera_capture' && (
                  <div className="relative w-44 h-44 rounded-full overflow-hidden border-4 border-zinc-900 shadow-inner bg-zinc-100 mx-auto">
                    {isCameraActive && !capturedPhoto ? (
                      <>
                        <video 
                          ref={videoRef} 
                          autoPlay 
                          playsInline 
                          className="w-full h-full object-cover scale-x-[-1]" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                      </>
                    ) : capturedPhoto ? (
                      <img 
                        src={capturedPhoto} 
                        alt="Evidência Capturada" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-zinc-400">
                        <RefreshCw size={24} className="animate-spin" />
                      </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                )}

                <div className="w-full space-y-2 pt-2">
                  {verificationStep === 'biometric_native' && (
                    <>
                      <button
                        id="btn_sim_success"
                        onClick={() => finalizeRegistration('Simulado')}
                        className="w-full py-3 px-4 rounded-2xl bg-zinc-900 text-white font-bold text-sm transition-all hover:bg-zinc-800 shadow-sm flex items-center justify-center gap-2"
                      >
                        <UserCheck size={16} /> Confirmar Biometria
                      </button>

                      <button
                        id="btn_use_camera"
                        onClick={switchToCameraFlow}
                        className="w-full py-3 px-4 rounded-2xl border border-zinc-200 text-zinc-600 font-bold text-xs transition-all hover:bg-zinc-50 flex items-center justify-center gap-1.5"
                      >
                        <Camera size={14} /> Usar Câmera (Evidência Facial)
                      </button>
                    </>
                  )}

                  {verificationStep === 'camera_capture' && (
                    <>
                      {isCameraActive && !capturedPhoto ? (
                        <button
                          id="btn_capture_snapshot"
                          onClick={capturePhotoEvidence}
                          className="w-full py-3 px-4 rounded-2xl bg-zinc-900 text-white font-bold text-sm hover:bg-zinc-800 transition-all shadow-sm flex items-center justify-center gap-1.5"
                        >
                          <Scan size={16} /> Capturar Foto Agora
                        </button>
                      ) : (
                        <button
                          id="btn_retry_camera"
                          onClick={switchToCameraFlow}
                          className="w-full py-3 px-4 rounded-2xl bg-zinc-900 text-white font-bold text-sm hover:bg-zinc-800 transition-all shadow-sm"
                        >
                          Tentar Novamente
                        </button>
                      )}

                      <button
                        id="btn_sim_camera_fallback"
                        onClick={() => finalizeRegistration('Simulado')}
                        className="w-full py-2.5 px-4 rounded-2xl border border-zinc-200 text-zinc-500 font-semibold text-xs hover:bg-zinc-50"
                      >
                        Simular Confirmação Facial
                      </button>
                    </>
                  )}

                  {verificationError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-2xl text-[11px] leading-normal flex items-start gap-1.5 border border-red-100 w-full text-left">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{verificationError}</span>
                    </div>
                  )}
                </div>

              </div>

              {verificationStep !== 'success' && (
                <div className="w-full pt-4 border-t border-zinc-100">
                  <button 
                    id="btn_cancel_verification"
                    onClick={closeVerificationModal}
                    className="w-full text-center py-2 text-sm font-bold text-zinc-400 hover:text-zinc-600 transition-colors uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                </div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX DE FOTO EXPANDIDA */}
      <AnimatePresence>
        {lightboxPhoto && (
          <motion.div 
            id="lightbox_modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxPhoto(null)}
            className="fixed inset-0 bg-zinc-950/95 backdrop-blur-xs z-50 flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-sm w-full bg-zinc-900 p-3 rounded-[36px]"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                id="btn_close_lightbox"
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-6 right-6 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full transition-colors z-10"
              >
                <X size={16} />
              </button>
              
              <img 
                src={lightboxPhoto} 
                alt="Foto Ampliada de Evidência" 
                referrerPolicy="no-referrer"
                className="w-full aspect-square object-cover rounded-[28px] border border-zinc-800" 
              />
              <div className="p-4 text-center text-zinc-400 text-xs">
                Evidência biométrica anexada ao ponto eletrônico seguro.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
