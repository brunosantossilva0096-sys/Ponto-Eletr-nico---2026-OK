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
  RefreshCw, 
  X, 
  Scan, 
  Compass, 
  Unlock, 
  Lock, 
  Sliders, 
  ArrowRight,
  Download,
  AlertTriangle,
  FileText,
  FileCode,
  ShieldCheck,
  Edit3,
  Calendar,
  Users,
  Shield,
  Check,
  Plus,
  Trash2,
  AlertOctagon,
  LogOut,
  KeyRound,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';

// --- CONFIGURAÇÕES DO SISTEMA (EDITÁVEIS) ---
const DEFAULT_COMPANY_COORDS = { lat: -23.55052, lng: -46.633308 }; // Praça da Sé, SP (Centro de São Paulo)
const DEFAULT_MAX_RADIUS = 100; // Raio padrão de 100 metros
const GEO_REFRESH_INTERVAL = 15000; // 15 segundos

// --- DADOS DO EMPREGADOR E DO EMPREGADO (CONFORMIDADE PORTARIA 671) ---
const EMPLOYER_DATA = {
  CNPJ: '12.345.678/0001-90',
  RazaoSocial: 'Indústrias Metalúrgicas Alfa S.A.',
  Endereco: 'Av. Paulista, 1000 - São Paulo/SP'
};

const EMPLOYEE_DATA = {
  CPF: '123.456.789-00',
  PIS: '120.34567.89-0',
  Nome: 'Bruno Santos Silva',
  Cargo: 'Desenvolvedor Pleno',
  IdFuncionario: '#8829-10'
};

type LogType = 'Entrada' | 'Intervalo Saída' | 'Intervalo Retorno' | 'Saída';

interface TimeLog {
  id: string;
  timestamp: string; // ISO string
  type: LogType;
  distance: number;
  latitude: number;
  longitude: number;
  verificationMethod: 'Biometria Nativa' | 'Biometria Secugen' | 'Captura Facial' | 'Simulado' | 'Retificação Administrativa';
  photoEvidence?: string;
  // --- CAMPOS REQUISITOS PORTARIA 671 ---
  hashAssinatura: string; // Assinatura digital simulated
  pisPasepTrabalhador: string;
  cpfTrabalhador: string;
  cnpjEmpregador: string;
  razaoSocialEmpregador: string;
  originalLogId?: string; // Vinculação com o original em caso de alteração/ajuste
  justificativaCorrecao?: string; // Para trilha de auditoria
  dataAlteracao?: string;
  alteradoPor?: string;
}

interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

interface Absence {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'Justificada' | 'Não Justificada';
  reason: string;
}

interface AdjustmentRequest {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  type: LogType;
  justification: string;
  status: 'Pendente' | 'Aprovado' | 'Rejeitado';
  targetLogId?: string; // Se for para alterar um ponto existente
  timestampCreated: string;
}

// --- AUXILIAR DE CRIPTOGRAFIA/OBFUSCATION PARA LGPD ---
const encryptSecure = (data: any): string => {
  const serialized = JSON.stringify(data);
  return btoa(unescape(encodeURIComponent(serialized)));
};

const decryptSecure = (encrypted: string): any => {
  try {
    const decrypted = decodeURIComponent(escape(atob(encrypted)));
    return JSON.parse(decrypted);
  } catch (e) {
    console.error("Erro ao descriptografar dados", e);
    return null;
  }
};

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

// --- GERAÇÃO DE ASSINATURA ELETRÔNICA SIMULADA ---
const generateHashSignature = (type: string, time: string, pis: string): string => {
  const payload = `${type}-${time}-${pis}-${EMPLOYER_DATA.CNPJ}-ICP-Brasil-PAdES-v2.0`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "ICP-BR-" + Math.abs(hash).toString(16).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
};

export default function App() {
  // --- ESTADO DE SESSÃO / LOGIN ---
  const [userSession, setUserSession] = useState<'colab' | 'admin' | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

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

  // --- FERIADOS, FALTAS E SOLICITAÇÕES DE AJUSTE (PORTARIA 671) ---
  const [holidays, setHolidays] = useState<Holiday[]>([
    { id: 'h-1', date: '2026-01-01', name: 'Confraternização Universal' },
    { id: 'h-2', date: '2026-05-01', name: 'Dia do Trabalho' },
    { id: 'h-3', date: '2026-09-07', name: 'Independência do Brasil' },
    { id: 'h-4', date: '2026-11-15', name: 'Proclamação da República' },
    { id: 'h-5', date: '2026-12-25', name: 'Natal' }
  ]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [adjustmentRequests, setAdjustmentRequests] = useState<AdjustmentRequest[]>([]);

  // --- ESTADOS DA VERIFICAÇÃO BIOMÉTRICA ---
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState<'verifying_gps' | 'biometric_native' | 'camera_capture' | 'success' | 'error'>('verifying_gps');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // --- LIGHTBOX DE FOTO ---
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // --- MODAIS DA UI ---
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [isNewHolidayModalOpen, setIsNewHolidayModalOpen] = useState(false);
  const [isNewAbsenceModalOpen, setIsNewAbsenceModalOpen] = useState(false);
  
  // Formulários de cadastro
  const [adjDate, setAdjDate] = useState('');
  const [adjTime, setAdjTime] = useState('');
  const [adjType, setAdjType] = useState<LogType>('Entrada');
  const [adjJustification, setAdjJustification] = useState('');
  const [adjTargetLogId, setAdjTargetLogId] = useState<string>('');

  const [newHoliDate, setNewHoliDate] = useState('');
  const [newHoliName, setNewHoliName] = useState('');

  const [newAbsDate, setNewAbsDate] = useState('');
  const [newAbsType, setNewAbsType] = useState<'Justificada' | 'Não Justificada'>('Não Justificada');
  const [newAbsReason, setNewAbsReason] = useState('');

  // Refs para Câmera
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- 1. ATUALIZAR RELÓGIO EM TEMPO REAL ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- 2. CARREGAR DADOS DO LOCAL STORAGE ---
  useEffect(() => {
    try {
      const savedLogs = localStorage.getItem('ponto_logs_secure');
      if (savedLogs) setLogs(decryptSecure(savedLogs) || []);

      const savedHolidays = localStorage.getItem('ponto_holidays_secure');
      if (savedHolidays) setHolidays(decryptSecure(savedHolidays) || []);

      const savedAbsences = localStorage.getItem('ponto_absences_secure');
      if (savedAbsences) setAbsences(decryptSecure(savedAbsences) || []);

      const savedRequests = localStorage.getItem('ponto_requests_secure');
      if (savedRequests) setAdjustmentRequests(decryptSecure(savedRequests) || []);

      // Carregar coordenadas da sede salvas
      const savedHqCoords = localStorage.getItem('ponto_hq_coords');
      if (savedHqCoords) {
        const parsedCoords = JSON.parse(savedHqCoords);
        setHqCoords(parsedCoords);
      }
    } catch (e) {
      console.error("Erro ao carregar dados", e);
    }
  }, []);

  // Persistir dados auxiliares
  const saveLogsSecurely = (updatedLogs: TimeLog[]) => {
    setLogs(updatedLogs);
    localStorage.setItem('ponto_logs_secure', encryptSecure(updatedLogs));
  };

  const saveHolidaysSecurely = (updatedHolidays: Holiday[]) => {
    setHolidays(updatedHolidays);
    localStorage.setItem('ponto_holidays_secure', encryptSecure(updatedHolidays));
  };

  const saveAbsencesSecurely = (updatedAbsences: Absence[]) => {
    setAbsences(updatedAbsences);
    localStorage.setItem('ponto_absences_secure', encryptSecure(updatedAbsences));
  };

  const saveRequestsSecurely = (updatedRequests: AdjustmentRequest[]) => {
    setAdjustmentRequests(updatedRequests);
    localStorage.setItem('ponto_requests_secure', encryptSecure(updatedRequests));
  };

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
        
        const dist = calculateDistance(latitude, longitude, hqCoords.lat, hqCoords.lng);
        setDistance(dist);
        setIsWithinRange(dist <= maxRadius);
        setLocationError(null);
        setGeoLoading(false);

        setSimulatedCoords({
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6)
        });
      },
      (err) => {
        console.error("Erro de Geolocalização:", err);
        let errorMsg = "Não foi possível obter a sua localização.";
        if (err.code === 1) errorMsg = "Permissão de localização negada.";
        else if (err.code === 2) errorMsg = "Localização indisponível.";
        else if (err.code === 3) errorMsg = "Tempo limite atingido.";
        setLocationError(errorMsg);
        setIsWithinRange(false);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    requestLocation();
    const interval = setInterval(requestLocation, GEO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [hqCoords, maxRadius]);

  const setHqHere = () => {
    if (userCoords) {
      const newHqCoords = { lat: userCoords.lat, lng: userCoords.lng };
      setHqCoords(newHqCoords);
      setDistance(0);
      setIsWithinRange(true);
      setLocationError(null);
      
      // Salvar no localStorage para persistência
      localStorage.setItem('ponto_hq_coords', JSON.stringify(newHqCoords));
      
      alert("Sede definida com sucesso! Esta localização será usada para validar os registros de ponto.");
    } else {
      alert("Aguarde a obtenção de sua coordenada atual.");
    }
  };

  const resetHqCoords = () => {
    if (confirm("Deseja resetar as coordenadas da sede para o padrão (Praça da Sé, SP)?")) {
      setHqCoords(DEFAULT_COMPANY_COORDS);
      localStorage.removeItem('ponto_hq_coords');
      alert("Coordenadas resetadas para o padrão.");
      requestLocation();
    }
  };

  // --- 5. DETECTAR PRÓXIMO REGISTRO RECOMENDADO ---
  const getNextRecommendedAction = (): LogType => {
    if (logs.length === 0) return 'Entrada';
    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr && !log.originalLogId);
    if (todayLogs.length === 0) return 'Entrada';
    const sortedToday = [...todayLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const lastAction = sortedToday[sortedToday.length - 1].type;

    if (lastAction === 'Entrada') return 'Intervalo Saída';
    if (lastAction === 'Intervalo Saída') return 'Intervalo Retorno';
    if (lastAction === 'Intervalo Retorno') return 'Saída';
    return 'Entrada';
  };

  const nextRecommended = getNextRecommendedAction();

  const isActionDisabled = (type: LogType): boolean => {
    if (bypassGeofence) {
      if (bypassSequence) return false;
    } else {
      if (!isWithinRange) return true;
    }
    if (bypassSequence) return false;

    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr && !log.originalLogId);

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

  const handleStartPoint = (type: LogType) => {
    if (!isWithinRange && !bypassGeofence) {
      alert("Acesso Negado: Fora do perímetro.");
      return;
    }
    setActiveAction(type);
    setIsVerifying(true);
    setVerificationError(null);
    setCapturedPhoto(null);
    setVerificationStep('verifying_gps');

    setTimeout(() => {
      triggerWebAuthnBiometric();
    }, 1200);
  };

  const triggerWebAuthnBiometric = async () => {
    setVerificationStep('biometric_native');
    setVerificationError(null);
    
    // Tentar usar Secugen WebAPI primeiro
    try {
      const secugenResponse = await captureSecugenFingerprint();
      if (secugenResponse) {
        finalizeRegistration('Biometria Secugen', secugenResponse);
        return;
      }
    } catch (err) {
      console.log("Secugen WebAPI não disponível, tentando WebAuthn nativo:", err);
    }
    
    // Fallback para WebAuthn nativo
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
            throw new Error("Falha na credencial.");
          }
        } else {
          setTimeout(() => switchToCameraFlow(), 1500);
        }
      } catch (err) {
        setTimeout(() => switchToCameraFlow(), 1500);
      }
    } else {
      setTimeout(() => switchToCameraFlow(), 1500);
    }
  };

  // Função para capturar impressão digital usando Secugen WebAPI
  const captureSecugenFingerprint = async (): Promise<string | null> => {
    try {
      const response = await fetch('http://localhost:8000/SGIFPCapture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeout: 10000,
          quality: 50,
          templateFormat: 'ISO'
        })
      });

      if (!response.ok) {
        throw new Error(`Secugen WebAPI error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.imageData) {
        // Converter base64 para data URL
        const imageData = `data:image/png;base64,${data.imageData}`;
        return imageData;
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao capturar impressão digital Secugen:', error);
      throw error;
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
          if (videoRef.current) videoRef.current.srcObject = stream;
        } else {
          setVerificationError("Câmera frontal indisponível.");
        }
      } catch (error) {
        setVerificationError("Permissão de câmera negada.");
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
    const timestamp = new Date().toISOString();
    const hashSig = generateHashSignature(activeAction, timestamp, EMPLOYEE_DATA.PIS);

    const newLog: TimeLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: timestamp,
      type: activeAction,
      distance: bypassGeofence ? 0 : (distance || 0),
      latitude: userCoords?.lat || hqCoords.lat,
      longitude: userCoords?.lng || hqCoords.lng,
      verificationMethod: method,
      photoEvidence: photoData,
      hashAssinatura: hashSig,
      pisPasepTrabalhador: EMPLOYEE_DATA.PIS,
      cpfTrabalhador: EMPLOYEE_DATA.CPF,
      cnpjEmpregador: EMPLOYER_DATA.CNPJ,
      razaoSocialEmpregador: EMPLOYER_DATA.RazaoSocial
    };

    const updatedLogs = [newLog, ...logs];
    saveLogsSecurely(updatedLogs);
    setVerificationStep('success');
    setTimeout(() => closeVerificationModal(), 2000);
  };

  const closeVerificationModal = () => {
    stopCamera();
    setIsVerifying(false);
    setVerificationStep('verifying_gps');
    setActiveAction(null);
    setCapturedPhoto(null);
    setVerificationError(null);
  };

  // --- SOLICITAÇÃO DE AJUSTE (PELO COLABORADOR) ---
  const handleRequestAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjDate || !adjTime || !adjJustification) {
      alert("Por favor, preencha todos os campos.");
      return;
    }

    const newRequest: AdjustmentRequest = {
      id: `req-${Date.now()}`,
      date: adjDate,
      time: adjTime,
      type: adjType,
      justification: adjJustification,
      status: 'Pendente',
      targetLogId: adjTargetLogId || undefined,
      timestampCreated: new Date().toISOString()
    };

    const updated = [newRequest, ...adjustmentRequests];
    saveRequestsSecurely(updated);
    
    setAdjDate('');
    setAdjTime('');
    setAdjJustification('');
    setAdjTargetLogId('');
    setIsAdjustmentModalOpen(false);
    alert("Solicitação de retificação enviada para aprovação do Administrador.");
  };

  // --- PROCESSAMENTO DE AJUSTE (PELO ADMIN) ---
  const handleProcessRequest = (reqId: string, action: 'Aprovar' | 'Rejeitar') => {
    const updatedRequests = adjustmentRequests.map(req => {
      if (req.id === reqId) {
        return { ...req, status: action === 'Aprovar' ? 'Aprovado' as const : 'Rejeitado' as const };
      }
      return req;
    });
    saveRequestsSecurely(updatedRequests);

    const targetReq = adjustmentRequests.find(r => r.id === reqId);
    if (action === 'Aprovar' && targetReq) {
      const timestamp = new Date(`${targetReq.date}T${targetReq.time}`).toISOString();
      const hashSig = generateHashSignature(targetReq.type, timestamp, EMPLOYEE_DATA.PIS);
      
      const retLog: TimeLog = {
        id: `log-${Date.now()}`,
        timestamp: timestamp,
        type: targetReq.type,
        distance: 0,
        latitude: hqCoords.lat,
        longitude: hqCoords.lng,
        verificationMethod: 'Retificação Administrativa',
        hashAssinatura: hashSig,
        pisPasepTrabalhador: EMPLOYEE_DATA.PIS,
        cpfTrabalhador: EMPLOYEE_DATA.CPF,
        cnpjEmpregador: EMPLOYER_DATA.CNPJ,
        razaoSocialEmpregador: EMPLOYER_DATA.RazaoSocial,
        originalLogId: targetReq.targetLogId,
        justificativaCorrecao: targetReq.justification,
        dataAlteracao: new Date().toISOString(),
        alteradoPor: "Administrador / Sistema"
      };

      const updatedLogs = [retLog, ...logs];
      saveLogsSecurely(updatedLogs);
    }
  };

  // --- CADASTRO DE FERIADOS ---
  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliDate || !newHoliName) return;
    const updated = [...holidays, { id: `hol-${Date.now()}`, date: newHoliDate, name: newHoliName }];
    saveHolidaysSecurely(updated);
    setNewHoliDate('');
    setNewHoliName('');
    setIsNewHolidayModalOpen(false);
  };

  const handleDeleteHoliday = (id: string) => {
    const updated = holidays.filter(h => h.id !== id);
    saveHolidaysSecurely(updated);
  };

  // --- CADASTRO DE FALTAS ---
  const handleAddAbsence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAbsDate || !newAbsReason) return;
    const updated = [...absences, { id: `abs-${Date.now()}`, date: newAbsDate, type: newAbsType, reason: newAbsReason }];
    saveAbsencesSecurely(updated);
    setNewAbsDate('');
    setNewAbsReason('');
    setIsNewAbsenceModalOpen(false);
  };

  const handleDeleteAbsence = (id: string) => {
    const updated = absences.filter(a => a.id !== id);
    saveAbsencesSecurely(updated);
  };

  // --- COMPROVANTE PDF ---
  const handleDownloadComprovantePDF = (log: TimeLog) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a6'
    });
    const primaryColor = '#10b981';
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(EMPLOYER_DATA.RazaoSocial, 10, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`CNPJ: ${EMPLOYER_DATA.CNPJ}`, 10, 20);
    doc.text(EMPLOYER_DATA.Endereco, 10, 24);
    doc.line(10, 28, 95, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("COMPROVANTE DE REGISTRO DE PONTO", 10, 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Emitido nos termos da Portaria MTP nº 671/2021", 10, 38);
    doc.setFont("helvetica", "bold");
    doc.text("Trabalhador:", 10, 45);
    doc.setFont("helvetica", "normal");
    doc.text(`${EMPLOYEE_DATA.Nome}`, 10, 49);
    doc.text(`CPF: ${EMPLOYEE_DATA.CPF}  |  PIS: ${EMPLOYEE_DATA.PIS}`, 10, 53);
    doc.setFont("helvetica", "bold");
    doc.text("Detalhes da Marcação:", 10, 60);
    doc.setFont("helvetica", "normal");
    const logDate = new Date(log.timestamp);
    doc.text(`Data: ${logDate.toLocaleDateString('pt-BR')}`, 10, 64);
    doc.text(`Hora: ${logDate.toLocaleTimeString('pt-BR')}`, 10, 68);
    doc.text(`Tipo de Registro: ${log.type}`, 10, 72);
    doc.text(`Método: ${log.verificationMethod}`, 10, 76);
    if (log.justificativaCorrecao) {
      doc.setFont("helvetica", "bold");
      doc.text("Nota de Ajuste/Justificativa:", 10, 81);
      doc.setFont("helvetica", "normal");
      doc.text(log.justificativaCorrecao.substring(0, 45), 10, 85);
    }
    doc.line(10, 90, 95, 90);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(primaryColor);
    doc.text("ASSINATURA QUALIFICADA ICP-BRASIL (SIMULADO)", 10, 95);
    doc.setFont("helvetica", "normal");
    doc.setTextColor('#555555');
    doc.setFontSize(6);
    doc.text(`Hash: ${log.hashAssinatura}`, 10, 99);
    doc.text(`Certificação: REP-P ID ${EMPLOYEE_DATA.IdFuncionario}`, 10, 103);
    doc.save(`Comprovante_Ponto_${log.type}_${logDate.toISOString().slice(0, 10)}.pdf`);
  };

  // --- ESPELHO DE PONTO MENSAL (PDF COMPLETO COM FERIADOS E FALTAS) ---
  const handleDownloadEspelhoPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("ESPELHO DE JORNADA - RELATÓRIO MENSAL", 15, 20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Emitido em conformidade com o Artigo 82 da Portaria MTP nº 671/2021", 15, 25);
    
    doc.rect(15, 30, 180, 20);
    doc.setFont("helvetica", "bold");
    doc.text("EMPREGADOR:", 18, 36);
    doc.setFont("helvetica", "normal");
    doc.text(`${EMPLOYER_DATA.RazaoSocial}  |  CNPJ: ${EMPLOYER_DATA.CNPJ}`, 18, 41);
    doc.text(`Endereço: ${EMPLOYER_DATA.Endereco}`, 18, 46);

    doc.rect(15, 55, 180, 20);
    doc.setFont("helvetica", "bold");
    doc.text("TRABALHADOR:", 18, 61);
    doc.setFont("helvetica", "normal");
    doc.text(`${EMPLOYEE_DATA.Nome}  |  Cargo: ${EMPLOYEE_DATA.Cargo}`, 18, 66);
    doc.text(`CPF: ${EMPLOYEE_DATA.CPF}  |  PIS/NIT: ${EMPLOYEE_DATA.PIS}`, 18, 71);

    doc.setFont("helvetica", "bold");
    doc.text("JORNADA MENSAL DETALHADA", 15, 83);
    doc.line(15, 85, 195, 85);
    
    let y = 92;
    doc.setFontSize(8.5);
    doc.text("Data", 15, 90);
    doc.text("Entrada", 45, 90);
    doc.text("Int. Saída", 75, 90);
    doc.text("Int. Retorno", 105, 90);
    doc.text("Saída", 135, 90);
    doc.text("Situação / Observação", 165, 90);
    doc.line(15, 92, 195, 92);
    y = 96;

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(now.getFullYear(), now.getMonth(), day);
      const dateStringISO = currentDate.toISOString().slice(0, 10);
      const dateStringPT = currentDate.toLocaleDateString('pt-BR');

      const holiday = holidays.find(h => h.date === dateStringISO);
      const absence = absences.find(a => a.date === dateStringISO);
      const dayLogs = logs.filter(log => new Date(log.timestamp).toISOString().slice(0, 10) === dateStringISO && !log.originalLogId);

      const entrada = dayLogs.find(l => l.type === 'Entrada');
      const intSaida = dayLogs.find(l => l.type === 'Intervalo Saída');
      const intRetorno = dayLogs.find(l => l.type === 'Intervalo Retorno');
      const saida = dayLogs.find(l => l.type === 'Saída');

      const formatTime = (log?: TimeLog) => log ? new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

      doc.setFont("helvetica", "normal");
      doc.text(dateStringPT, 15, y);

      if (holiday) {
        doc.text("Feriado", 45, y);
        doc.text(holiday.name.substring(0, 20), 165, y);
      } else if (absence) {
        doc.text("Abonado", 45, y);
        doc.text(`Falta ${absence.type}: ${absence.reason.substring(0, 20)}`, 165, y);
      } else if (dayLogs.length > 0) {
        doc.text(formatTime(entrada), 45, y);
        doc.text(formatTime(intSaida), 75, y);
        doc.text(formatTime(intRetorno), 105, y);
        doc.text(formatTime(saida), 135, y);
        doc.text("Normal", 165, y);
      } else {
        const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
        if (isWeekend) {
          doc.text("DSR", 45, y);
          doc.text("Final de Semana", 165, y);
        } else {
          doc.text("Ausente", 45, y);
          doc.setTextColor('#ef4444');
          doc.text("Falta Injustificada", 165, y);
          doc.setTextColor('#000000');
        }
      }

      y += 6;
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
    }

    doc.line(15, y + 10, 195, y + 10);
    doc.setFont("helvetica", "bold");
    doc.text("Declaração:", 15, y + 16);
    doc.setFont("helvetica", "normal");
    doc.text("Declaro a exatidão das marcações de ponto contidas neste espelho de ponto eletrônico.", 15, y + 21);
    doc.line(15, y + 40, 90, y + 40);
    doc.text("Assinatura do Trabalhador", 15, y + 44);
    doc.line(120, y + 40, 195, y + 40);
    doc.text("Assinatura do Empregador (REP-P)", 120, y + 44);
    doc.save(`Espelho_Ponto_Mensal_${EMPLOYEE_DATA.Nome.replace(/\s+/g, '_')}.pdf`);
  };

  // --- EXPORTAÇÃO AFD ---
  const handleExportAFD = () => {
    let afdContent = "";
    const reg1Header = "000000001" + "1" + "1" + EMPLOYER_DATA.CNPJ.replace(/\D/g, '').padEnd(14, ' ') + EMPLOYEE_DATA.PIS.replace(/\D/g, '').padEnd(11, ' ') + EMPLOYER_DATA.RazaoSocial.substring(0, 150).padEnd(150, ' ') + "REP-P".padEnd(40, ' ') + new Date().toLocaleDateString('pt-BR').replace(/\D/g, '') + "\r\n";
    afdContent += reg1Header;

    logs.forEach((log, index) => {
      const seq = (index + 2).toString().padStart(9, '0');
      const logDate = new Date(log.timestamp);
      const dateStr = logDate.toLocaleDateString('pt-BR').replace(/\D/g, '');
      const timeStr = logDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(/\D/g, '');
      const pisStr = EMPLOYEE_DATA.PIS.replace(/\D/g, '').padStart(11, '0');
      const line = `${seq}3${pisStr}${dateStr}${timeStr}${log.type.padEnd(20, ' ')}${log.hashAssinatura.substring(0, 40).padEnd(40, ' ')}\r\n`;
      afdContent += line;
    });

    const totalLines = (logs.length + 2).toString().padStart(9, '0');
    const trailer = `${totalLines}9` + "1".padStart(9, '0') + "0".padStart(9, '0') + "\r\n";
    afdContent += trailer;

    const blob = new Blob([afdContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `AFD_${EMPLOYER_DATA.CNPJ.replace(/\D/g, '')}_${Date.now()}.txt`;
    link.click();
  };

  // --- EXPORTAÇÃO AEJ ---
  const handleExportAEJ = () => {
    let aejContent = "";
    aejContent += `000000001|HEADER|AEJ|CNPJ:${EMPLOYER_DATA.CNPJ}|RAZAO:${EMPLOYER_DATA.RazaoSocial}\r\n`;
    aejContent += `000000002|EMPREGADO|NOME:${EMPLOYEE_DATA.Nome}|CPF:${EMPLOYEE_DATA.CPF}|PIS:${EMPLOYEE_DATA.PIS}\r\n`;
    logs.forEach((log, index) => {
      const seq = (index + 3).toString().padStart(9, '0');
      const logDate = new Date(log.timestamp);
      let line = `${seq}|MARCACAO|DATA:${logDate.toLocaleDateString('pt-BR')}|HORA:${logDate.toLocaleTimeString('pt-BR')}|TIPO:${log.type}|METODO:${log.verificationMethod}|HASH:${log.hashAssinatura}`;
      if (log.originalLogId) {
        line += `|AJUSTE_RETIFICACAO|JUSTIFICATIVA:${log.justificativaCorrecao}`;
      }
      aejContent += line + "\r\n";
    });
    const blob = new Blob([aejContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `AEJ_${EMPLOYEE_DATA.Nome.replace(/\s+/g, '_')}_${Date.now()}.txt`;
    link.click();
  };

  // --- CALCULAR TOTAL DE HORAS ---
  const calculateTotalHours = (): string => {
    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr && !log.originalLogId);
    if (todayLogs.length === 0) return '00h 00m';

    const sorted = [...todayLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let totalMs = 0;
    let entryTime: Date | null = null;
    let intervalOutTime: Date | null = null;
    let intervalInTime: Date | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const log = sorted[i];
      const logDate = new Date(log.timestamp);
      if (log.type === 'Entrada') entryTime = logDate;
      else if (log.type === 'Intervalo Saída') intervalOutTime = logDate;
      else if (log.type === 'Intervalo Retorno') intervalInTime = logDate;
      else if (log.type === 'Saída') {
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
    return `${Math.floor(totalMinutes / 60).toString().padStart(2, '0')}h ${(totalMinutes % 60).toString().padStart(2, '0')}m`;
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginUsername === '123' && loginPassword === '123') {
      setUserSession('colab');
      setLoginError(null);
    } else if (loginUsername === 'admin' && loginPassword === 'admin') {
      setUserSession('admin');
      setLoginError(null);
    } else {
      setLoginError("Credenciais inválidas. Use 123/123 para colaborador ou admin/admin para administrador.");
    }
  };

  const handleLogout = () => {
    setUserSession(null);
    setLoginUsername('');
    setLoginPassword('');
  };

  const checkJornadaAlerts = (): string[] => {
    const alerts: string[] = [];
    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === todayStr && !log.originalLogId);
    
    // Verificar se já passou do horário de entrada sem registro
    const now = new Date();
    const entryTime = new Date();
    entryTime.setHours(9, 0, 0, 0); // 9:00 AM
    
    if (now > entryTime && !todayLogs.some(l => l.type === 'Entrada')) {
      alerts.push('Atraso na entrada - Horário limite: 09:00');
    }
    
    // Verificar se está em horário de trabalho sem registro de entrada
    const workStart = new Date();
    workStart.setHours(9, 0, 0, 0);
    const workEnd = new Date();
    workEnd.setHours(18, 0, 0, 0);
    
    if (now > workStart && now < workEnd && todayLogs.length === 0) {
      alerts.push('Jornada em andamento - Nenhum registro realizado hoje');
    }
    
    return alerts;
  };

  const currentAlerts = checkJornadaAlerts();
  const hoursMinutes = currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const seconds = currentTime.toLocaleTimeString('pt-BR', { second: '2-digit' });

  // --- CASO NÃO AUTENTICADO: TELA DE LOGIN ---
  if (!userSession) {
    return (
      <div className="min-h-screen bg-industrial-bg text-industrial-text font-sans antialiased flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-industrial-card border border-industrial-border rounded-3xl p-8 shadow-2xl space-y-6 relative overflow-hidden"
        >
          <div className="absolute -right-10 -top-10 w-28 h-28 bg-cyber-emerald/15 rounded-full blur-2xl opacity-40"></div>
          
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-cyber-emerald/10 border border-cyber-emerald/20 text-cyber-emerald rounded-2xl mb-2">
              <ShieldCheck size={32} />
            </div>
            <h2 className="text-xl font-bold tracking-tight font-display">Ponto Digital</h2>
            <p className="text-xs text-industrial-muted">Entre com suas credenciais de acesso homologado</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="block text-industrial-muted font-semibold">Identificação (CPF / Usuário)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-industrial-muted">
                  <User size={15} />
                </span>
                <input 
                  type="text" 
                  required 
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Ex: 123 ou admin"
                  className="w-full pl-10 pr-3 py-3 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none focus:border-cyber-emerald font-semibold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-industrial-muted font-semibold">Senha de Acesso</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-industrial-muted">
                  <KeyRound size={15} />
                </span>
                <input 
                  type="password" 
                  required 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3 py-3 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none focus:border-cyber-emerald"
                />
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-hazard-amber-dim border border-hazard-amber/20 text-hazard-amber rounded-2xl leading-relaxed text-[10px]">
                {loginError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-3 rounded-xl bg-cyber-emerald text-industrial-bg font-extrabold transition-all hover:bg-emerald-400 text-center flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              AUTENTICAR NO SISTEMA <ArrowRight size={14} />
            </button>
          </form>

          <div className="p-4 bg-industrial-bg/60 border border-industrial-border/60 rounded-2xl text-[10px] text-industrial-muted space-y-1">
            <span className="font-bold text-industrial-text block mb-1">Acesso para Avaliação:</span>
            <p>• Colaborador: CPF <strong>123</strong> / Senha <strong>123</strong></p>
            <p>• Administrador: Usuário <strong>admin</strong> / Senha <strong>admin</strong></p>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- CASO AUTENTICADO: INTERFACE PRINCIPAL ---
  return (
    <div id="app_container" className="min-h-screen bg-industrial-bg text-industrial-text font-sans antialiased selection:bg-cyber-emerald selection:text-industrial-bg flex flex-col justify-between p-4 sm:p-8 md:p-10">
      
      {/* CORPO CENTRAL - BENTO GRID CONTAINER */}
      <div className="w-full max-w-5xl mx-auto space-y-6 flex-1 flex flex-col justify-between">
        
        {/* CABEÇALHO */}
        <header className="flex justify-between items-end pb-4 border-b border-industrial-border">
          <div className="space-y-1">
            <h1 className="text-xs font-bold uppercase tracking-[0.25em] text-industrial-muted flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-cyber-emerald" /> Registrador Homologado REP-P (Portaria 671/2021)
            </h1>
            <div className="text-2xl font-bold tracking-tight font-display">
              {userSession === 'admin' ? "Painel de Controle Administrativo" : EMPLOYER_DATA.RazaoSocial}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleLogout}
              className="px-3.5 py-2.5 rounded-2xl border border-industrial-border bg-industrial-card text-xs font-bold text-red-400 hover:bg-industrial-card-hover hover:text-white transition-all flex items-center gap-1.5"
            >
              <LogOut size={14} /> Sair
            </button>
            {userSession === 'admin' && (
              <button 
                onClick={() => setShowConfig(!showConfig)}
                className={`p-2.5 rounded-2xl border transition-all ${
                  showConfig 
                    ? 'bg-cyber-emerald border-cyber-emerald text-industrial-bg rotate-45' 
                    : 'bg-industrial-card border-industrial-border text-industrial-muted hover:text-industrial-text hover:bg-industrial-card-hover'
                }`}
                title="Ajustes de Simulação"
              >
                <Settings size={18} />
              </button>
            )}
          </div>
        </header>

        {/* PAINEL DE CONTROLE DE SIMULAÇÃO */}
        <AnimatePresence>
          {showConfig && userSession === 'admin' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden bg-industrial-card border border-industrial-border rounded-3xl p-6 shadow-2xl space-y-4 text-xs"
            >
              <div className="flex items-center justify-between pb-2 border-b border-industrial-border">
                <span className="font-bold text-industrial-text flex items-center gap-1.5 font-display">
                  <Sliders size={14} className="text-cyber-emerald" /> Painel de Controle de Simulação
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Distância Máxima (m)</label>
                  <input 
                    type="number" 
                    value={maxRadius} 
                    onChange={(e) => setMaxRadius(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none focus:border-cyber-emerald font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <button
                    onClick={setHqHere}
                    disabled={!userCoords}
                    className="w-full px-4 py-2 rounded-xl bg-industrial-text text-industrial-bg font-extrabold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-center transition-all flex items-center justify-center gap-1.5 text-xs shadow-sm font-sans"
                  >
                    <MapPin size={13} /> Definir Sede Aqui
                  </button>
                  <button
                    onClick={resetHqCoords}
                    className="w-full px-4 py-2 rounded-xl border border-industrial-border text-industrial-muted font-bold hover:bg-industrial-card-hover hover:text-industrial-text text-center transition-all text-xs"
                  >
                    Resetar para Padrão
                  </button>
                </div>
              </div>
              
              {/* Display das coordenadas */}
              <div className="p-3 bg-industrial-bg rounded-xl border border-industrial-border space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-industrial-muted">Sede Atual:</span>
                  <span className="font-mono text-cyber-emerald">
                    {hqCoords.lat.toFixed(6)}, {hqCoords.lng.toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-industrial-muted">Sua Localização:</span>
                  <span className="font-mono text-industrial-text">
                    {userCoords ? `${userCoords.lat.toFixed(6)}, ${userCoords.lng.toFixed(6)}` : 'Buscando...'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-industrial-muted">Distância:</span>
                  <span className={`font-mono ${isWithinRange ? 'text-cyber-emerald' : 'text-hazard-amber'}`}>
                    {distance !== null ? `${distance.toFixed(0)}m` : '--'}
                  </span>
                </div>
              </div>
              <div className="p-4 bg-industrial-bg rounded-2xl space-y-2.5 border border-industrial-border">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setBypassGeofence(!bypassGeofence)}
                    className={`px-3 py-1.5 rounded-xl border font-bold text-xs transition-all flex items-center gap-1.5 ${
                      bypassGeofence ? 'bg-cyber-emerald/10 text-cyber-emerald border-cyber-emerald/30 shadow-xs' : 'bg-industrial-card text-industrial-muted border-industrial-border'
                    }`}
                  >
                    {bypassGeofence ? "Bypass Perímetro: Ativo" : "Bypass Perímetro: Inativo"}
                  </button>
                  <button
                    onClick={() => setBypassSequence(!bypassSequence)}
                    className={`px-3 py-1.5 rounded-xl border font-bold text-xs transition-all flex items-center gap-1.5 ${
                      bypassSequence ? 'bg-cyber-emerald/10 text-cyber-emerald border-cyber-emerald/30 shadow-xs' : 'bg-industrial-card text-industrial-muted border-industrial-border'
                    }`}
                  >
                    {bypassSequence ? "Bypass Sequência: Ativo" : "Bypass Sequência: Inativo"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ALERTAS DE JORNADA */}
        {currentAlerts.length > 0 && userSession === 'colab' && (
          <div className="p-4 bg-hazard-amber-dim border border-hazard-amber/20 rounded-3xl space-y-2">
            <span className="text-xs font-bold text-hazard-amber flex items-center gap-1.5 font-display">
              <AlertTriangle size={14} /> ALERTAS DE CONFORMIDADE DE JORNADA
            </span>
            <div className="space-y-1">
              {currentAlerts.map((alert, idx) => (
                <p key={idx} className="text-[11px] text-industrial-text leading-tight font-sans">• {alert}</p>
              ))}
            </div>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL SEPARADO POR PERFIL */}
        {userSession === 'colab' ? (
          /* ==================== TELA DO COLABORADOR ==================== */
          <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-6 gap-6 flex-1 w-full font-sans">
            
            {/* RELÓGIO DIGITAL */}
            <div className="col-span-1 md:col-span-8 md:row-span-3 bg-industrial-card rounded-3xl border border-industrial-border shadow-sm flex flex-col items-center justify-center p-6 sm:p-8 relative overflow-hidden min-h-[220px]">
              <div className="absolute top-6 left-6 flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${isWithinRange || bypassGeofence ? 'bg-cyber-emerald' : 'bg-hazard-amber'} animate-pulse`}></div>
                <span className={`text-[10px] font-bold uppercase tracking-wider font-display ${isWithinRange || bypassGeofence ? 'text-cyber-emerald' : 'text-hazard-amber'}`}>
                  {isWithinRange || bypassGeofence ? 'Sincronizado' : 'Perímetro Bloqueado'}
                </span>
              </div>
              
              <div className="text-[64px] sm:text-[90px] md:text-[104px] font-light font-display tracking-tighter leading-none text-industrial-text tabular-nums select-none flex items-baseline mt-4">
                {hoursMinutes}
                <span className="text-xl sm:text-2xl md:text-3xl text-industrial-muted ml-2 font-mono tabular-nums">{seconds}</span>
              </div>
              
              <div className="text-industrial-muted font-mono tracking-wide text-[10px] mt-4 flex items-center gap-1.5 bg-industrial-bg px-3 py-1 rounded-full border border-industrial-border">
                <Compass size={11} className="text-cyber-emerald" /> GMT-3 São Paulo, Brasil
              </div>
            </div>

            {/* GPS STATUS */}
            <div className={`col-span-1 md:col-span-4 md:row-span-2 rounded-3xl p-5 border transition-all duration-500 flex flex-col justify-between shadow-xs relative overflow-hidden min-h-[190px] ${
              bypassGeofence || isWithinRange
                ? 'bg-cyber-emerald-dim border-cyber-emerald/10 text-industrial-text' 
                : 'bg-hazard-amber-dim border-hazard-amber/10 text-industrial-text'
            }`}>
              <div className="flex justify-between items-start z-10 w-full gap-2">
                <div className={`p-2 rounded-xl border ${bypassGeofence || isWithinRange ? 'bg-cyber-emerald/10 border-cyber-emerald/30 text-cyber-emerald' : 'bg-hazard-amber/10 border-hazard-amber/30 text-hazard-amber'}`}>
                  <MapPin size={18} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-4 z-10 w-full">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base font-display">
                    {bypassGeofence ? 'Sem Limites' : isWithinRange ? 'Perímetro OK' : 'Fora da Empresa'}
                  </h3>
                  <p className="text-[11px] text-industrial-muted leading-tight font-sans">
                    {locationError ? locationError : (
                      <>Distância: <span className="font-mono text-industrial-text bg-industrial-bg/60 border border-industrial-border px-1 py-0.5 rounded ml-1">{Math.round(distance || 0)}m</span></>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* MEUS PONTOS (LOGS) */}
            <div className="col-span-1 md:col-span-4 md:row-span-4 bg-industrial-card border border-industrial-border rounded-3xl p-5 flex flex-col justify-between shadow-xs min-h-[300px]">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-industrial-muted" />
                    <h2 className="text-xs font-bold uppercase tracking-wider font-display text-industrial-text">Meus Registros</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => setIsAdjustmentModalOpen(true)}
                      className="text-[9px] font-bold text-cyber-emerald hover:text-emerald-400 transition-all flex items-center gap-0.5 border border-cyber-emerald/20 px-2 py-1 rounded-lg"
                    >
                      <Edit3 size={10} /> Ajuste
                    </button>
                    <button 
                      onClick={() => setIsFiscalModalOpen(true)}
                      className="text-[9px] font-bold text-industrial-muted hover:text-white transition-all flex items-center gap-0.5 border border-industrial-border px-2 py-1 rounded-lg"
                    >
                      <FileText size={10} /> Espelho
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {logs.length === 0 ? (
                    <div className="text-center py-10 text-industrial-muted text-xs">Nenhuma marcação realizada.</div>
                  ) : (
                    logs.map((log) => {
                      const logTime = new Date(log.timestamp);
                      return (
                        <div key={log.id} className="flex flex-col p-2.5 bg-industrial-bg rounded-2xl border border-industrial-border">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-industrial-text">{log.type}</span>
                            <button
                              onClick={() => handleDownloadComprovantePDF(log)}
                              className="p-1 rounded bg-industrial-card border border-industrial-border text-industrial-muted hover:text-cyber-emerald transition-colors"
                            >
                              <Download size={11} />
                            </button>
                          </div>
                          <span className="text-[9px] text-industrial-muted font-mono mt-0.5">
                            {logTime.toLocaleDateString('pt-BR')} • {logTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-industrial-border">
                <div className="p-3 bg-industrial-bg border border-industrial-border text-industrial-text rounded-2xl flex items-center justify-between shadow-inner">
                  <span className="text-xs font-semibold text-industrial-muted">Total Hoje</span>
                  <span className="text-sm font-bold font-mono text-cyber-emerald">{calculateTotalHours()}</span>
                </div>
              </div>
            </div>

            {/* BOTÕES DE BATIDA */}
            <div className="col-span-1 md:col-span-8 md:row-span-3 grid grid-cols-2 gap-4">
              {(['Entrada', 'Intervalo Saída', 'Intervalo Retorno', 'Saída'] as LogType[]).map((type) => {
                const disabled = isActionDisabled(type);
                const isRecommended = type === nextRecommended && !disabled;
                return (
                  <button
                    key={type}
                    onClick={() => handleStartPoint(type)}
                    disabled={disabled}
                    className={`relative p-5 rounded-3xl flex flex-col justify-between items-start text-left h-auto min-h-[140px] md:min-h-[160px] transition-all duration-300 select-none group border
                      ${disabled 
                        ? 'bg-industrial-card/40 text-industrial-muted/40 cursor-not-allowed opacity-40 border-industrial-border/30' 
                        : isRecommended
                          ? 'bg-industrial-text text-industrial-bg border-industrial-text shadow-lg hover:bg-white active:scale-[0.98]'
                          : 'bg-industrial-card text-industrial-text border-industrial-border hover:border-industrial-muted hover:bg-industrial-card-hover active:scale-[0.98]'
                      }`}
                  >
                    <div className="flex w-full justify-between items-center">
                      <div className={`p-2.5 rounded-xl border ${
                        disabled ? 'bg-industrial-bg/50 border-industrial-border/30 text-industrial-muted/30' : 'bg-industrial-bg text-industrial-muted'
                      }`}>
                        <Clock size={18} />
                      </div>
                    </div>
                    <div className="space-y-1 w-full mt-4">
                      <span className="block text-lg font-bold font-display leading-none">{type}</span>
                    </div>
                  </button>
                );
              })}
            </div>

          </div>
        ) : (
          /* ==================== TELA DO ADMINISTRADOR ==================== */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full font-sans">
            
            {/* APROVAÇÃO DE SOLICITAÇÕES */}
            <div className="col-span-1 md:col-span-6 bg-industrial-card border border-industrial-border rounded-3xl p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-industrial-text flex items-center gap-1.5 font-display border-b border-industrial-border pb-3">
                <Edit3 size={14} className="text-cyber-emerald" /> Aprovação de Ajustes Retroativos
              </h3>
              
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {adjustmentRequests.filter(r => r.status === 'Pendente').length === 0 ? (
                  <div className="text-center py-10 text-industrial-muted text-xs">Nenhuma solicitação pendente.</div>
                ) : (
                  adjustmentRequests.filter(r => r.status === 'Pendente').map((req) => (
                    <div key={req.id} className="p-3 bg-industrial-bg rounded-2xl border border-industrial-border space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-bold text-industrial-text">{req.type}</span>
                          <p className="text-[10px] text-industrial-muted">{req.date} às {req.time}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-cyber-emerald/10 text-cyber-emerald text-[9px] font-bold">Pendente</span>
                      </div>
                      <p className="text-[10px] text-industrial-muted bg-industrial-card p-2 rounded-xl italic">
                        " {req.justification} "
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleProcessRequest(req.id, 'Aprovar')}
                          className="flex-1 py-1.5 rounded-lg bg-cyber-emerald text-industrial-bg font-extrabold text-[10px] hover:bg-emerald-400 transition-all flex items-center justify-center gap-1"
                        >
                          <Check size={11} /> Aprovar
                        </button>
                        <button
                          onClick={() => handleProcessRequest(req.id, 'Rejeitar')}
                          className="flex-1 py-1.5 rounded-lg border border-industrial-border text-hazard-amber hover:bg-industrial-card-hover font-extrabold text-[10px] transition-all flex items-center justify-center gap-1"
                        >
                          <X size={11} /> Rejeitar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* GERENCIAMENTO DE FERIADOS */}
            <div className="col-span-1 md:col-span-6 bg-industrial-card border border-industrial-border rounded-3xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-industrial-border pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-industrial-text flex items-center gap-1.5 font-display">
                  <Calendar size={14} className="text-cyber-emerald" /> Feriados da Empresa
                </h3>
                <button 
                  onClick={() => setIsNewHolidayModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-cyber-emerald text-industrial-bg text-[10px] font-extrabold flex items-center gap-0.5"
                >
                  <Plus size={12} /> Novo Feriado
                </button>
              </div>

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {holidays.map((holi) => (
                  <div key={holi.id} className="flex justify-between items-center p-2.5 bg-industrial-bg rounded-2xl border border-industrial-border">
                    <div>
                      <span className="text-xs font-bold text-industrial-text">{holi.name}</span>
                      <p className="text-[10px] text-industrial-muted font-mono">{new Date(holi.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                    <button 
                      onClick={() => handleDeleteHoliday(holi.id)}
                      className="p-1 rounded text-industrial-muted hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* HISTÓRICO DE AUSÊNCIAS */}
            <div className="col-span-1 md:col-span-12 bg-industrial-card border border-industrial-border rounded-3xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-industrial-border pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-industrial-text flex items-center gap-1.5 font-display">
                  <AlertOctagon size={14} className="text-cyber-emerald" /> Lançamentos de Ausências e Faltas (Abonos)
                </h3>
                <button 
                  onClick={() => setIsNewAbsenceModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-cyber-emerald text-industrial-bg text-[10px] font-extrabold flex items-center gap-0.5"
                >
                  <Plus size={12} /> Lançar Falta/Abono
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[250px] overflow-y-auto pr-1">
                {absences.length === 0 ? (
                  <div className="col-span-full text-center py-10 text-industrial-muted text-xs">Nenhuma falta cadastrada.</div>
                ) : (
                  absences.map((abs) => (
                    <div key={abs.id} className="p-3 bg-industrial-bg rounded-2xl border border-industrial-border flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            abs.type === 'Justificada' ? 'bg-cyber-emerald/10 text-cyber-emerald' : 'bg-red-400/10 text-red-400'
                          }`}>
                            Falta {abs.type}
                          </span>
                          <button 
                            onClick={() => handleDeleteAbsence(abs.id)}
                            className="text-industrial-muted hover:text-red-400 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <p className="text-[10px] text-industrial-muted font-mono mt-1">{new Date(abs.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                        <p className="text-[10px] text-industrial-text mt-2">{abs.reason}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* EXPORTAÇÕES FISCAIS DO ADMINISTRADOR */}
            <div className="col-span-1 md:col-span-12 bg-industrial-card border border-industrial-border rounded-3xl p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-industrial-text flex items-center gap-1.5 font-display border-b border-industrial-border pb-3">
                <FileText size={14} className="text-cyber-emerald" /> Extração de Relatórios Fiscais Obrigatórios (Portaria 671)
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button 
                  onClick={handleExportAFD}
                  className="p-4 bg-industrial-bg rounded-2xl border border-industrial-border flex flex-col items-center justify-center text-center gap-2 hover:bg-industrial-card-hover hover:border-cyber-emerald transition-all"
                >
                  <FileCode size={24} className="text-cyber-emerald" />
                  <span className="text-xs font-bold text-industrial-text">Baixar AFD (.txt)</span>
                  <span className="text-[9px] text-industrial-muted">Layout oficial do Anexo V</span>
                </button>

                <button 
                  onClick={handleExportAEJ}
                  className="p-4 bg-industrial-bg rounded-2xl border border-industrial-border flex flex-col items-center justify-center text-center gap-2 hover:bg-industrial-card-hover hover:border-cyber-emerald transition-all"
                >
                  <FileCode size={24} className="text-cyber-emerald" />
                  <span className="text-xs font-bold text-industrial-text">Baixar AEJ (.txt)</span>
                  <span className="text-[9px] text-industrial-muted">Arquivo de Jornada Tratada</span>
                </button>

                <button 
                  onClick={handleDownloadEspelhoPDF}
                  className="p-4 bg-industrial-bg rounded-2xl border border-industrial-border flex flex-col items-center justify-center text-center gap-2 hover:bg-industrial-card-hover hover:border-cyber-emerald transition-all"
                >
                  <FileText size={24} className="text-cyber-emerald" />
                  <span className="text-xs font-bold text-industrial-text">Gerar Espelho de Ponto (PDF)</span>
                  <span className="text-[9px] text-industrial-muted">Relatório de Jornada Mensal</span>
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* RODAPÉ */}
      <footer className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-6 border-t border-industrial-border text-industrial-muted text-[10px] font-mono w-full">
        <div>REGISTRADOR HOMOLOGADO PORTARIA 671 • CERTIFICADO ICP-BRASIL PADRÃO REP-P</div>
        <div className="flex items-center gap-4">
          <span>CPF COLABORADOR: {EMPLOYEE_DATA.CPF}</span>
          <span className="sm:inline hidden">• IDENTIFICAÇÃO DO PROVEDOR: {EMPLOYEE_DATA.IdFuncionario}</span>
        </div>
      </footer>

      {/* MODAL SOLICITAÇÃO AJUSTE (COLABORADOR) */}
      <AnimatePresence>
        {isAdjustmentModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsAdjustmentModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-industrial-card w-full max-w-md rounded-3xl p-6 border border-industrial-border space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-industrial-border pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-industrial-text flex items-center gap-1.5 font-display">
                  <Edit3 size={15} className="text-cyber-emerald" /> Solicitar Ajuste / Retificação
                </h3>
                <button onClick={() => setIsAdjustmentModalOpen(false)} className="text-industrial-muted hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleRequestAdjustment} className="space-y-3 text-xs">
                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Tipo de Marcação</label>
                  <select 
                    value={adjType} 
                    onChange={(e) => setAdjType(e.target.value as LogType)}
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none focus:border-cyber-emerald"
                  >
                    <option value="Entrada">Entrada</option>
                    <option value="Intervalo Saída">Intervalo Saída</option>
                    <option value="Intervalo Retorno">Intervalo Retorno</option>
                    <option value="Saída">Saída</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-industrial-muted mb-1 font-semibold">Data</label>
                    <input 
                      type="date" 
                      required 
                      value={adjDate}
                      onChange={(e) => setAdjDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-industrial-muted mb-1 font-semibold">Horário</label>
                    <input 
                      type="time" 
                      required 
                      value={adjTime}
                      onChange={(e) => setAdjTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Marcação Anterior para Vincular (Opcional)</label>
                  <select 
                    value={adjTargetLogId} 
                    onChange={(e) => setAdjTargetLogId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none"
                  >
                    <option value="">Nenhum - Nova Inclusão</option>
                    {logs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.type} - {new Date(l.timestamp).toLocaleDateString('pt-BR')} {new Date(l.timestamp).toLocaleTimeString('pt-BR')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Justificativa Detalhada (Obrigatório)</label>
                  <textarea 
                    required 
                    rows={3} 
                    value={adjJustification}
                    onChange={(e) => setAdjJustification(e.target.value)}
                    placeholder="Descreva o motivo do ajuste para a administração..."
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none resize-none"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-cyber-emerald text-industrial-bg font-extrabold text-xs transition-all hover:bg-emerald-400 text-center"
                >
                  ENVIAR SOLICITAÇÃO
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COMPROVANTES / ESPELHO (COLABORADOR) */}
      <AnimatePresence>
        {isFiscalModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsFiscalModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-industrial-card w-full max-w-md rounded-3xl p-6 border border-industrial-border space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-industrial-border pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-industrial-text flex items-center gap-1.5 font-display">
                  <FileText size={15} className="text-cyber-emerald" /> Meu Espelho de Ponto
                </h3>
                <button onClick={() => setIsFiscalModalOpen(false)} className="text-industrial-muted hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <div className="p-3 bg-industrial-bg rounded-2xl border border-industrial-border flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-industrial-text flex items-center gap-1">
                    <FileText size={12} className="text-cyber-emerald" /> Espelho de Ponto Mensal
                  </span>
                  <p className="text-[10px] text-industrial-muted leading-tight">Consulte e extraia seu relatório mensal em PDF.</p>
                </div>
                <button 
                  onClick={handleDownloadEspelhoPDF}
                  className="p-2 rounded-xl bg-industrial-card border border-industrial-border hover:bg-industrial-card-hover text-cyber-emerald hover:text-white transition-colors"
                >
                  <Download size={14} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL NOVO FERIADO (ADMIN) */}
      <AnimatePresence>
        {isNewHolidayModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsNewHolidayModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-industrial-card w-full max-w-sm rounded-3xl p-6 border border-industrial-border space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-industrial-border pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-industrial-text flex items-center gap-1.5 font-display">
                  <Calendar size={15} className="text-cyber-emerald" /> Adicionar Feriado
                </h3>
                <button onClick={() => setIsNewHolidayModalOpen(false)} className="text-industrial-muted hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAddHoliday} className="space-y-3 text-xs">
                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Nome do Feriado</label>
                  <input 
                    type="text" 
                    required 
                    value={newHoliName}
                    onChange={(e) => setNewHoliName(e.target.value)}
                    placeholder="Ex: Natal"
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Data</label>
                  <input 
                    type="date" 
                    required 
                    value={newHoliDate}
                    onChange={(e) => setNewHoliDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none"
                  />
                </div>
                <button type="submit" className="w-full py-2 rounded-xl bg-cyber-emerald text-industrial-bg font-extrabold text-xs transition-all hover:bg-emerald-400 text-center">
                  CADASTRAR
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL NOVA FALTA (ADMIN) */}
      <AnimatePresence>
        {isNewAbsenceModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsNewAbsenceModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-industrial-card w-full max-w-sm rounded-3xl p-6 border border-industrial-border space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-industrial-border pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-industrial-text flex items-center gap-1.5 font-display">
                  <AlertOctagon size={15} className="text-cyber-emerald" /> Lançar Falta ou Abono
                </h3>
                <button onClick={() => setIsNewAbsenceModalOpen(false)} className="text-industrial-muted hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAddAbsence} className="space-y-3 text-xs">
                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Data da Falta</label>
                  <input 
                    type="date" 
                    required 
                    value={newAbsDate}
                    onChange={(e) => setNewAbsDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Tipo de Falta</label>
                  <select 
                    value={newAbsType} 
                    onChange={(e) => setNewAbsType(e.target.value as 'Justificada' | 'Não Justificada')}
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none"
                  >
                    <option value="Não Justificada">Não Justificada (Desconto)</option>
                    <option value="Justificada">Justificada (Abonada / Atestado)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-industrial-muted mb-1 font-semibold">Motivo / Justificativa</label>
                  <textarea 
                    required 
                    rows={3} 
                    value={newAbsReason}
                    onChange={(e) => setNewAbsReason(e.target.value)}
                    placeholder="Ex: Atestado Médico"
                    className="w-full px-3 py-2 rounded-xl bg-industrial-bg border border-industrial-border text-industrial-text focus:outline-none resize-none"
                  />
                </div>
                <button type="submit" className="w-full py-2 rounded-xl bg-cyber-emerald text-industrial-bg font-extrabold text-xs transition-all hover:bg-emerald-400 text-center">
                  LANÇAR AUSÊNCIA
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE VERIFICAÇÃO BIOMÉTRICA */}
      <AnimatePresence>
        {isVerifying && (
          <motion.div 
            id="verification_modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={closeVerificationModal}
          >
            <motion.div 
              initial={{ y: '100%', scale: 1 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: '100%', scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-industrial-card w-full max-w-[400px] rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-8 space-y-6 border-t border-x sm:border border-industrial-border shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center justify-center space-y-6">
                
                <div className="relative">
                  {verificationStep === 'verifying_gps' && (
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-2 border-cyber-emerald/10 border-t-cyber-emerald animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <MapPin size={28} className="text-cyber-emerald animate-pulse" />
                      </div>
                    </div>
                  )}

                  {verificationStep === 'biometric_native' && (
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-2 border-cyber-emerald/10 border-t-cyber-emerald animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Fingerprint size={28} className="text-cyber-emerald animate-pulse" />
                      </div>
                    </div>
                  )}

                  {verificationStep === 'camera_capture' && (
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-2 border-cyber-emerald/10 border-t-cyber-emerald animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Camera size={28} className="text-cyber-emerald animate-pulse" />
                      </div>
                    </div>
                  )}

                  {verificationStep === 'success' && (
                    <div className="w-20 h-20 rounded-full bg-cyber-emerald/5 border border-cyber-emerald/20 flex items-center justify-center text-cyber-emerald shadow-lg shadow-cyber-emerald/5">
                      <CheckCircle2 size={36} className="animate-bounce" />
                    </div>
                  )}
                </div>

                <div className="text-center space-y-1">
                  <h2 className="text-base font-bold font-display text-industrial-text">
                    {verificationStep === 'verifying_gps' && 'Validando Localização'}
                    {verificationStep === 'biometric_native' && 'Leitor Secugen Pro'}
                    {verificationStep === 'camera_capture' && 'Evidência Facial'}
                    {verificationStep === 'success' && 'Ponto Confirmado!'}
                  </h2>
                  <p className="text-industrial-muted text-[11px] px-2 leading-snug">
                    {verificationStep === 'verifying_gps' && 'Validando proximidade...'}
                    {verificationStep === 'biometric_native' && (
                      <>Coloque seu dedo no leitor Secugen Pro para registrar a <strong>{activeAction}</strong>.</>
                    )}
                    {verificationStep === 'camera_capture' && (
                      <>Olhe para a câmera frontal para confirmar seu registro de <strong>{activeAction}</strong>.</>
                    )}
                    {verificationStep === 'success' && 'Registro assinado com sucesso.'}
                  </p>
                </div>

                {verificationStep === 'camera_capture' && (
                  <div className="relative w-40 h-40 rounded-full overflow-hidden border-4 border-industrial-border shadow-2xl bg-industrial-bg mx-auto">
                    {isCameraActive && !capturedPhoto ? (
                      <>
                        <video 
                          ref={videoRef} 
                          autoPlay 
                          playsInline 
                          className="w-full h-full object-cover scale-x-[-1]" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                      </>
                    ) : capturedPhoto ? (
                      <img 
                        src={capturedPhoto} 
                        alt="Evidência Capturada" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-industrial-muted">
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
                        onClick={() => finalizeRegistration('Simulado')}
                        className="w-full py-3 px-4 rounded-xl bg-industrial-text text-industrial-bg font-extrabold text-xs transition-all hover:bg-white flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <UserCheck size={16} /> CONFIRMAR BIOMETRIA
                      </button>
                      <button
                        onClick={switchToCameraFlow}
                        className="w-full py-3 px-4 rounded-xl border border-industrial-border text-industrial-text font-bold text-xs transition-all hover:bg-industrial-card-hover flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Camera size={14} /> CÂMERA (FALLBACK REGISTRO)
                      </button>
                    </>
                  )}

                  {verificationStep === 'camera_capture' && (
                    <>
                      {isCameraActive && !capturedPhoto ? (
                        <button
                          onClick={capturePhotoEvidence}
                          className="w-full py-3 px-4 rounded-xl bg-industrial-text text-industrial-bg font-extrabold text-xs hover:bg-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Scan size={16} /> CAPTURAR FOTO AGORA
                        </button>
                      ) : (
                        <button
                          onClick={switchToCameraFlow}
                          className="w-full py-3 px-4 rounded-xl bg-industrial-text text-industrial-bg font-extrabold text-xs hover:bg-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          TENTAR NOVAMENTE
                        </button>
                      )}
                      <button
                        onClick={() => finalizeRegistration('Simulado')}
                        className="w-full py-2 px-4 rounded-xl border border-industrial-border text-industrial-muted font-bold text-[10px] hover:bg-industrial-card-hover transition-all cursor-pointer"
                      >
                        CONFIRMAÇÃO MANUAL SELETIVA
                      </button>
                    </>
                  )}

                  {verificationError && (
                    <div className="bg-hazard-amber-dim text-hazard-amber p-3 rounded-2xl text-[10px] leading-relaxed flex items-start gap-2 border border-hazard-amber/10 w-full text-left">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{verificationError}</span>
                    </div>
                  )}
                </div>

              </div>

              {verificationStep !== 'success' && (
                <div className="w-full pt-4 border-t border-industrial-border">
                  <button 
                    onClick={closeVerificationModal}
                    className="w-full text-center py-2 text-xs font-bold text-industrial-muted hover:text-industrial-text transition-colors uppercase tracking-widest cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX */}
      <AnimatePresence>
        {lightboxPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxPhoto(null)}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div 
              className="relative max-w-sm w-full bg-industrial-card p-3 rounded-[32px] border border-industrial-border"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-5 right-5 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors z-10 cursor-pointer"
              >
                <X size={14} />
              </button>
              <img 
                src={lightboxPhoto} 
                alt="Foto Ampliada" 
                referrerPolicy="no-referrer"
                className="w-full aspect-square object-cover rounded-2xl border border-industrial-border" 
              />
              <div className="p-3 text-center text-industrial-muted text-[10px] font-mono">
                Evidência Facial • ID {EMPLOYEE_DATA.IdFuncionario}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
