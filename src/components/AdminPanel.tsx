import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, Company, AdminUser } from '../types';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Fingerprint,
  MapPin,
  Search,
  Plus,
  Trash2,
  Edit2,
  Navigation,
  Smartphone,
  Users,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Save,
  Camera,
  Building2,
  Sliders,
  X,
  Power,
} from 'lucide-react';
import { registerWebAuthn } from '../utils/webauthn';
import { loadModels, getFaceDescriptor } from '../utils/faceApi';
import { isEmployeeInactive } from '../utils/companyRules';
import { AdminReports } from './AdminReports';
import { AdminCompanies } from './AdminCompanies';
import { AdminHolidays } from './AdminHolidays';
import { AdminAbsences } from './AdminAbsences';
import { EmployeeReports } from './EmployeeReports';
import { AdminTimeBank } from './AdminTimeBank';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminSchedule5x2 } from './AdminSchedule5x2';

// Fix Leaflet default marker icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationPickerProps {
  position: [number, number] | null;
  radius: number;
  setPosition: (pos: [number, number]) => void;
}

const LocationPicker = ({ position, radius, setPosition }: LocationPickerProps) => {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position === null ? null : (
    <>
      <Marker position={position} />
      <Circle
        center={position}
        radius={Math.max(0, radius)}
        pathOptions={{ color: '#e11d48', fillColor: '#e11d48' }}
      />
    </>
  );
};

// Centraliza automaticamente o mapa quando `position` muda (editar funcionário, link Google Maps ou GPS)
const MapRecenter = ({ position }: { position: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (position && !isNaN(position[0]) && !isNaN(position[1])) {
      map.setView(position, Math.max(map.getZoom(), 15));
    }
  }, [position?.[0], position?.[1]]);
  return null;
};

const MapFeatures = ({ setPosition }: { setPosition: (p: [number, number]) => void }) => {
  const map = useMap();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        map.flyTo([lat, lon], 16);
        setPosition([lat, lon]);
      } else {
        alert('Local não encontrado.');
      }
    } catch {
      alert('Erro ao buscar local.');
    }
  };

  const handleMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        map.flyTo([lat, lon], 16);
        setPosition([lat, lon]);

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`
          );
          const data = await res.json();
          if (data && data.display_name) {
            setSearchQuery(data.display_name);
          }
        } catch (err) {
          console.error('Erro na geocodificação reversa:', err);
        }
      },
      () => alert('Erro ao obter localização. Verifique as permissões.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="absolute top-3 left-12 right-3 z-[1000] flex gap-2">
      <form
        onSubmit={handleSearch}
        className="flex-1 flex bg-white p-1 rounded-lg shadow-sm border border-industrial-border"
      >
        <input
          type="text"
          placeholder="Buscar local (ex: Av Paulista, 1000)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-1 outline-none text-sm text-industrial-text bg-transparent"
        />
        <button
          type="submit"
          className="bg-industrial-bg p-1.5 rounded-md hover:bg-industrial-border transition-colors text-industrial-muted"
        >
          <Search size={16} />
        </button>
      </form>
      <button
        type="button"
        onClick={handleMyLocation}
        className="bg-white p-2 rounded-lg shadow-sm border border-industrial-border hover:bg-industrial-bg transition-colors flex items-center justify-center text-cyber-emerald"
        title="Meu Local Atual"
      >
        <Navigation size={18} />
      </button>
    </div>
  );
};

export const AdminPanel = ({
  loggedAdmin,
  onLogout,
}: {
  loggedAdmin: AdminUser;
  onLogout: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'employees'
    | 'companies'
    | 'reports'
    | 'holidays'
    | 'absences'
    | 'timebank'
    | 'schedule5x2'
    | 'admins'
  >(loggedAdmin.role === 'convencional' ? 'reports' : 'employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [espelhoEmployee, setEspelhoEmployee] = useState<Employee | null>(null);

  // Filtros da lista lateral de funcionários
  const [empSearchFilter, setEmpSearchFilter] = useState('');
  const [empCompanyFilter, setEmpCompanyFilter] = useState<string>(loggedAdmin.company_id || '');
  const [showInactiveEmployees, setShowInactiveEmployees] = useState<boolean>(true);

  // Form state
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [pis, setPis] = useState('');
  const [role, setRole] = useState('');
  const [pin, setPin] = useState('');
  const [authMethod, setAuthMethod] = useState('both');
  const [companyId, setCompanyId] = useState(loggedAdmin.company_id || '');
  const [googleMapsInput, setGoogleMapsInput] = useState('');
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [allowedMac, setAllowedMac] = useState('');
  const [ignoreGpsOnPc, setIgnoreGpsOnPc] = useState(false);
  const [macRestrictionEnabled, setMacRestrictionEnabled] = useState(false);
  const [blockMobileAccess, setBlockMobileAccess] = useState(false);

  const handleImportGoogleMaps = (val: string) => {
    setGoogleMapsInput(val);
    if (!val) return;

    const directMatch = val.trim().match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
    if (directMatch) {
      setPosition([parseFloat(directMatch[1]), parseFloat(directMatch[2])]);
      return;
    }

    const atMatch = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      setPosition([parseFloat(atMatch[1]), parseFloat(atMatch[2])]);
      return;
    }

    const qMatch = val.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      setPosition([parseFloat(qMatch[1]), parseFloat(qMatch[2])]);
      return;
    }
  };

  const [radius, setRadius] = useState(100);
  const [biometricTemplate, setBiometricTemplate] = useState<string | null>(null);
  const [hasWebAuthn, setHasWebAuthn] = useState<boolean>(false);
  const [pendingWebAuthn, setPendingWebAuthn] = useState<{
    credentialId: string;
    publicKey: string;
  } | null>(null);

  // Facial Biometry states
  const [hasFacialTemplate, setHasFacialTemplate] = useState<boolean>(false);
  const [pendingFacialDescriptor, setPendingFacialDescriptor] = useState<Float32Array | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCapturingFace, setIsCapturingFace] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [workStart, setWorkStart] = useState('');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [workEnd, setWorkEnd] = useState('');
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [weeklyHours, setWeeklyHours] = useState<number>(44);

  const DEFAULT_CUSTOM = {
    0: { active: false, work_start: '', break_start: '', break_end: '', work_end: '' },
    1: { active: true, work_start: '08:00', break_start: '12:00', break_end: '13:00', work_end: '18:00' },
    2: { active: true, work_start: '08:00', break_start: '12:00', break_end: '13:00', work_end: '18:00' },
    3: { active: true, work_start: '08:00', break_start: '12:00', break_end: '13:00', work_end: '18:00' },
    4: { active: true, work_start: '08:00', break_start: '12:00', break_end: '13:00', work_end: '18:00' },
    5: { active: true, work_start: '08:00', break_start: '12:00', break_end: '13:00', work_end: '18:00' },
    6: { active: false, work_start: '', break_start: '', break_end: '', work_end: '' },
  };

  const [scheduleType, setScheduleType] = useState<'standard' | 'custom'>('standard');
  const [customSchedule, setCustomSchedule] = useState<any>(DEFAULT_CUSTOM);

  // Modal de Edição de Condições em Lote
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkCompanyFilter, setBulkCompanyFilter] = useState<string>(loggedAdmin.company_id || '');
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkApplyAuth, setBulkApplyAuth] = useState(false);
  const [bulkAuthVal, setBulkAuthVal] = useState('both');
  const [bulkApplyIgnoreGpsPc, setBulkApplyIgnoreGpsPc] = useState(false);
  const [bulkIgnoreGpsPcVal, setBulkIgnoreGpsPcVal] = useState(true);
  const [bulkApplyBlockMobile, setBulkApplyBlockMobile] = useState(false);
  const [bulkBlockMobileVal, setBulkBlockMobileVal] = useState(false);
  const [bulkApplyMac, setBulkApplyMac] = useState(false);
  const [bulkMacEnabledVal, setBulkMacEnabledVal] = useState(false);
  const [bulkApplyRadius, setBulkApplyRadius] = useState(false);
  const [bulkRadiusVal, setBulkRadiusVal] = useState(100);
  const [bulkApplyCoords, setBulkApplyCoords] = useState(false);
  const [bulkLatVal, setBulkLatVal] = useState('');
  const [bulkLngVal, setBulkLngVal] = useState('');
  const [bulkApplySchedule, setBulkApplySchedule] = useState(false);
  const [bulkWeeklyHours, setBulkWeeklyHours] = useState(44);
  const [bulkWs, setBulkWs] = useState('08:00');
  const [bulkBs, setBulkBs] = useState('12:00');
  const [bulkBe, setBulkBe] = useState('13:00');
  const [bulkWe, setBulkWe] = useState('18:00');
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const fetchEmployees = async () => {
    let query = supabase.from('employees').select('*, companies(*)').order('name');
    if (loggedAdmin.company_id) {
      query = query.eq('company_id', loggedAdmin.company_id);
    }
    const { data } = await query;
    if (data) setEmployees(data);
  };

  const fetchCompanies = async () => {
    let query = supabase.from('companies').select('*').order('name');
    if (loggedAdmin.company_id) {
      query = query.eq('id', loggedAdmin.company_id);
    }
    const { data } = await query;
    if (data) setAllCompanies(data);
  };

  useEffect(() => {
    fetchEmployees();
    fetchCompanies();
    loadModels();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [loggedAdmin.company_id]);

  const filteredSidebarEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!showInactiveEmployees && isEmployeeInactive(emp)) return false;
      if (empCompanyFilter && emp.company_id !== empCompanyFilter) return false;
      if (!empSearchFilter) return true;
      const s = empSearchFilter.toLowerCase();
      return (
        emp.name.toLowerCase().includes(s) ||
        emp.role.toLowerCase().includes(s) ||
        (emp.cpf || '').includes(empSearchFilter)
      );
    });
  }, [employees, empCompanyFilter, empSearchFilter, showInactiveEmployees]);

  const bulkCandidateEmployees = useMemo(() => {
    return employees
      .filter((e) => e.role !== 'Admin')
      .filter((e) => (!bulkCompanyFilter ? true : e.company_id === bulkCompanyFilter));
  }, [employees, bulkCompanyFilter]);

  const fetchBiometric = async (empId: string) => {
    const { data: secugenData } = await supabase
      .from('biometric_templates')
      .select('template')
      .eq('employee_id', empId)
      .maybeSingle();
    if (secugenData) setBiometricTemplate(secugenData.template);
    else setBiometricTemplate(null);

    const { data: webauthnData } = await supabase
      .from('webauthn_credentials')
      .select('id')
      .eq('employee_id', empId)
      .maybeSingle();
    setHasWebAuthn(!!webauthnData);

    const { data: facialData } = await supabase
      .from('facial_templates')
      .select('id')
      .eq('employee_id', empId)
      .maybeSingle();
    setHasFacialTemplate(!!facialData);
  };

  const resetForm = () => {
    setSelectedEmployee(null);
    setName('');
    setCpf('');
    setPis('');
    setRole('');
    setPin('');
    setAuthMethod('both');
    setCompanyId(loggedAdmin.company_id || '');
    setPosition(null);
    setGoogleMapsInput('');
    setAllowedMac('');
    setIgnoreGpsOnPc(false);
    setMacRestrictionEnabled(false);
    setBlockMobileAccess(false);
    setBiometricTemplate(null);
    setHasWebAuthn(false);
    setPendingWebAuthn(null);
    setHasFacialTemplate(false);
    setPendingFacialDescriptor(null);
    setWorkStart('');
    setBreakStart('');
    setBreakEnd('');
    setWorkEnd('');
    setWorkDays([1, 2, 3, 4, 5]);
    setWeeklyHours(44);
    setScheduleType('standard');
    setCustomSchedule(DEFAULT_CUSTOM);
    setRadius(100);
  };

  const handleEdit = (emp: Employee) => {
    setSelectedEmployee(emp);
    setName(emp.name);
    setCpf(emp.cpf || '');
    setPis(emp.pis || '');
    setRole(emp.role || '');
    setPin(emp.pin || '');
    setAuthMethod(emp.auth_method || 'both');
    setCompanyId(emp.company_id || '');
    setRadius(emp.allowed_radius !== null && emp.allowed_radius !== undefined ? emp.allowed_radius : 100);
    setAllowedMac(emp.allowed_mac_address || '');
    setIgnoreGpsOnPc(emp.ignore_gps_on_pc || false);
    setMacRestrictionEnabled(emp.mac_restriction_enabled || false);
    setBlockMobileAccess(emp.block_mobile_access || false);
    setWorkStart(emp.work_start || '');
    setBreakStart(emp.break_start || '');
    setBreakEnd(emp.break_end || '');
    setWorkEnd(emp.work_end || '');
    setWorkDays(emp.work_days || [1, 2, 3, 4, 5]);
    setWeeklyHours(emp.weekly_hours || 44);
    setScheduleType(emp.schedule_type || 'standard');
    setCustomSchedule(
      emp.custom_schedule && Object.keys(emp.custom_schedule).length > 0
        ? emp.custom_schedule
        : DEFAULT_CUSTOM
    );
    setBiometricTemplate(null);
    setPendingWebAuthn(null);
    setHasFacialTemplate(false);
    setPendingFacialDescriptor(null);
    if (isCameraOpen) closeCamera();
    fetchBiometric(emp.id);
    setGoogleMapsInput('');

    if (emp.allowed_lat && emp.allowed_lng) {
      setPosition([emp.allowed_lat, emp.allowed_lng]);
    } else {
      setPosition(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Informe o nome completo do funcionário.');
      return;
    }
    if (!companyId) {
      alert('Selecione uma Empresa para o funcionário.');
      return;
    }
    if (!role.trim()) {
      alert('Informe o cargo do funcionário.');
      return;
    }

    const cleanCpf = cpf.trim() || `SEM-CPF-${Date.now()}`;
    const cleanPis = pis.trim() || cleanCpf;

    const empData = {
      name: name.trim(),
      cpf: cleanCpf,
      pis: cleanPis,
      role: role.trim(),
      pin: pin.trim() || null,
      auth_method: authMethod,
      allowed_lat: position ? position[0] : null,
      allowed_lng: position ? position[1] : null,
      allowed_radius: radius,
      allowed_mac_address: allowedMac.trim() || null,
      ignore_gps_on_pc: ignoreGpsOnPc,
      mac_restriction_enabled: macRestrictionEnabled,
      block_mobile_access: blockMobileAccess,
      company_id: companyId,
      work_start: workStart || null,
      break_start: breakStart || null,
      break_end: breakEnd || null,
      work_end: workEnd || null,
      work_days: workDays,
      weekly_hours: weeklyHours,
      schedule_type: scheduleType,
      custom_schedule: customSchedule,
    };

    let empId = null;

    if (selectedEmployee) {
      const { error } = await supabase.from('employees').update(empData).eq('id', selectedEmployee.id);
      if (error) {
        alert('Erro ao atualizar funcionário:\n' + error.message);
        return;
      }
      empId = selectedEmployee.id;
    } else {
      const { data, error } = await supabase.from('employees').insert([empData]).select().single();
      if (error) {
        alert('Erro ao cadastrar funcionário:\n' + error.message);
        return;
      }
      if (data) empId = data.id;
    }

    if (empId && biometricTemplate) {
      const { data: existingBio } = await supabase
        .from('biometric_templates')
        .select('user_id')
        .eq('employee_id', empId)
        .maybeSingle();
      if (existingBio) {
        await supabase
          .from('biometric_templates')
          .update({ template: biometricTemplate })
          .eq('employee_id', empId);
      } else {
        await supabase
          .from('biometric_templates')
          .insert([{ employee_id: empId, user_id: cleanPis, template: biometricTemplate }]);
      }
    }

    if (empId && pendingWebAuthn) {
      await supabase.from('webauthn_credentials').delete().eq('employee_id', empId);
      const { error: webauthnError } = await supabase.from('webauthn_credentials').insert([
        {
          employee_id: empId,
          credential_id: pendingWebAuthn.credentialId,
          public_key: pendingWebAuthn.publicKey,
        },
      ]);
      if (webauthnError) {
        alert('Erro ao salvar biometria web no banco:\n' + webauthnError.message);
        return;
      }
    }

    if (empId && pendingFacialDescriptor) {
      await supabase.from('facial_templates').delete().eq('employee_id', empId);
      const { error: facialError } = await supabase.from('facial_templates').insert([
        {
          employee_id: empId,
          descriptor: JSON.stringify(Array.from(pendingFacialDescriptor)),
        },
      ]);
      if (facialError) {
        alert('Erro ao salvar biometria facial:\n' + facialError.message);
        return;
      }
    }

    alert('Funcionário salvo com sucesso!');
    resetForm();
    fetchEmployees();
  };

  const handleSaveBulkConditions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkSelectedIds.length === 0) {
      alert('Selecione pelo menos 1 funcionário na lista.');
      return;
    }

    const patch: Record<string, any> = {};
    if (bulkApplyAuth) patch.auth_method = bulkAuthVal;
    if (bulkApplyIgnoreGpsPc) patch.ignore_gps_on_pc = bulkIgnoreGpsPcVal;
    if (bulkApplyBlockMobile) patch.block_mobile_access = bulkBlockMobileVal;
    if (bulkApplyMac) patch.mac_restriction_enabled = bulkMacEnabledVal;
    if (bulkApplyRadius) patch.allowed_radius = Math.max(0, bulkRadiusVal);
    if (bulkApplyCoords) {
      patch.allowed_lat = bulkLatVal !== '' ? Number(bulkLatVal) : null;
      patch.allowed_lng = bulkLngVal !== '' ? Number(bulkLngVal) : null;
    }
    if (bulkApplySchedule) {
      patch.weekly_hours = bulkWeeklyHours;
      patch.schedule_type = 'standard';
      patch.work_start = bulkWs || null;
      patch.break_start = bulkBs || null;
      patch.break_end = bulkBe || null;
      patch.work_end = bulkWe || null;
    }

    if (Object.keys(patch).length === 0) {
      alert('Marque pelo menos uma condição para aplicar aos funcionários selecionados.');
      return;
    }

    if (!confirm(`Aplicar as condições marcadas para ${bulkSelectedIds.length} funcionário(s)?`)) {
      return;
    }

    setIsSavingBulk(true);
    try {
      const { error } = await supabase.from('employees').update(patch).in('id', bulkSelectedIds);
      if (error) {
        alert('Erro ao aplicar condições em lote: ' + error.message);
      } else {
        alert(`Condições atualizadas com sucesso para ${bulkSelectedIds.length} funcionário(s)!`);
        setShowBulkModal(false);
        fetchEmployees();
      }
    } finally {
      setIsSavingBulk(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setIsCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      alert('Erro ao acessar câmera: ' + err);
    }
  };

  const closeCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const captureFace = async () => {
    if (!videoRef.current) return;
    setIsCapturingFace(true);
    const descriptor = await getFaceDescriptor(videoRef.current);
    setIsCapturingFace(false);
    if (descriptor) {
      setPendingFacialDescriptor(descriptor);
      closeCamera();
      alert('Rosto capturado com sucesso! Salve o funcionário para finalizar.');
    } else {
      alert('Não foi possível detectar um rosto na imagem. Melhore a iluminação e olhe para a câmera.');
    }
  };

  const handleToggleEmployeeActive = async (emp: Employee) => {
    const currentlyInactive = isEmployeeInactive(emp);
    const actionLabel = currentlyInactive ? 'reativar' : 'desativar';
    if (
      !confirm(
        currentlyInactive
          ? `Deseja REATIVAR o funcionário "${emp.name}"? Ele voltará a aparecer na tela de ponto, na Escala 5x2 e nos relatórios automáticos.`
          : `Deseja DESATIVAR o funcionário "${emp.name}" de forma geral? Ele não aparecerá mais para bater ponto, na Escala 5x2 nem gerará faltas automáticas (o histórico de batidas é preservado).`
      )
    ) {
      return;
    }

    const updatedCustomSchedule = {
      ...(emp.custom_schedule || {}),
      _inactive: !currentlyInactive,
    };

    const { error } = await supabase
      .from('employees')
      .update({ custom_schedule: updatedCustomSchedule })
      .eq('id', emp.id);

    if (error) {
      alert(`Erro ao ${actionLabel} funcionário: ` + error.message);
      return;
    }

    alert(
      currentlyInactive
        ? `Funcionário "${emp.name}" reativado com sucesso!`
        : `Funcionário "${emp.name}" desativado de forma geral com sucesso!`
    );
    if (selectedEmployee?.id === emp.id) {
      setSelectedEmployee({ ...emp, custom_schedule: updatedCustomSchedule as any });
      setCustomSchedule(updatedCustomSchedule);
    }
    fetchEmployees();
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    if (
      confirm(
        `Tem certeza que deseja excluir o funcionário "${selectedEmployee.name}"? Todos os pontos, abonos e biometrias associadas serão excluídos permanentemente.`
      )
    ) {
      try {
        await supabase.from('absences').delete().eq('employee_id', selectedEmployee.id);
        await supabase.from('webauthn_credentials').delete().eq('employee_id', selectedEmployee.id);
        await supabase.from('facial_templates').delete().eq('employee_id', selectedEmployee.id);
        await supabase.from('biometric_templates').delete().eq('employee_id', selectedEmployee.id);
        await supabase.from('adjustment_requests').delete().eq('employee_id', selectedEmployee.id);
        await supabase.from('time_logs').delete().eq('employee_id', selectedEmployee.id);
        const { error } = await supabase.from('employees').delete().eq('id', selectedEmployee.id);

        if (error) {
          alert('Erro ao excluir funcionário: ' + error.message);
        } else {
          alert('Funcionário excluído com sucesso!');
          resetForm();
          fetchEmployees();
        }
      } catch (err: any) {
        alert('Erro inesperado: ' + err.message);
      }
    }
  };

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-text p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {espelhoEmployee ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-industrial-border relative">
            <EmployeeReports
              employee={espelhoEmployee}
              onBack={() => setEspelhoEmployee(null)}
              isAdmin={true}
            />
          </div>
        ) : (
          <>
            <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-industrial-border">
              <div>
                <h1 className="text-2xl font-bold text-industrial-text flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span>Gestão Corporativa</span>
                    {loggedAdmin.company_id ? (
                      <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg flex items-center gap-1.5">
                        <Building2 size={13} /> {loggedAdmin.companies?.name || 'Empresa Vinculada'}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">
                        Visão Global (Todas as Empresas)
                      </span>
                    )}
                  </div>
                  <div className="flex bg-industrial-bg rounded-lg p-1 overflow-x-auto max-w-full">
                    {loggedAdmin.role !== 'convencional' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveTab('employees')}
                          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                            activeTab === 'employees'
                              ? 'bg-white shadow-sm text-cyber-emerald'
                              : 'text-industrial-muted hover:text-industrial-text'
                          }`}
                        >
                          Funcionários
                        </button>
                        {!loggedAdmin.company_id && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('companies')}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                              activeTab === 'companies'
                                ? 'bg-white shadow-sm text-cyber-emerald'
                                : 'text-industrial-muted hover:text-industrial-text'
                            }`}
                          >
                            Empresas
                          </button>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveTab('reports')}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                        activeTab === 'reports'
                          ? 'bg-white shadow-sm text-cyber-emerald'
                          : 'text-industrial-muted hover:text-industrial-text'
                      }`}
                    >
                      Relatórios
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('holidays')}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                        activeTab === 'holidays'
                          ? 'bg-white shadow-sm text-cyber-emerald'
                          : 'text-industrial-muted hover:text-industrial-text'
                      }`}
                    >
                      Feriados
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('absences')}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                        activeTab === 'absences'
                          ? 'bg-white shadow-sm text-cyber-emerald'
                          : 'text-industrial-muted hover:text-industrial-text'
                      }`}
                    >
                      Abonos
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('timebank')}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                        activeTab === 'timebank'
                          ? 'bg-white shadow-sm text-cyber-emerald'
                          : 'text-industrial-muted hover:text-industrial-text'
                      }`}
                    >
                      Banco de Horas
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('schedule5x2')}
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                        activeTab === 'schedule5x2'
                          ? 'bg-white shadow-sm text-cyber-emerald'
                          : 'text-industrial-muted hover:text-industrial-text'
                      }`}
                    >
                      Escala 5x2
                    </button>
                    {loggedAdmin.role === 'total' && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('admins')}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                          activeTab === 'admins'
                            ? 'bg-white shadow-sm text-cyber-emerald'
                            : 'text-industrial-muted hover:text-industrial-text'
                        }`}
                      >
                        Administradores
                      </button>
                    )}
                  </div>
                </h1>
                <p className="text-sm text-industrial-muted mt-2">
                  Gerencie acessos, condições individuais ou em lote, escalas e relatórios pelo próprio painel.
                </p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="text-sm font-medium text-industrial-muted hover:text-cyber-emerald flex items-center gap-2"
              >
                <ArrowLeft size={16} /> Sair
              </button>
            </header>

            {activeTab === 'companies' && !loggedAdmin.company_id && <AdminCompanies />}
            {activeTab === 'reports' && <AdminReports loggedAdmin={loggedAdmin} />}
            {activeTab === 'holidays' && <AdminHolidays />}
            {activeTab === 'absences' && <AdminAbsences loggedAdmin={loggedAdmin} />}
            {activeTab === 'timebank' && <AdminTimeBank loggedAdmin={loggedAdmin} />}
            {activeTab === 'schedule5x2' && <AdminSchedule5x2 loggedAdmin={loggedAdmin} />}
            {activeTab === 'admins' && <AdminUsersTab loggedAdmin={loggedAdmin} />}
            {activeTab === 'employees' && loggedAdmin.role !== 'convencional' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-industrial-border p-4 flex flex-col h-[640px]">
                  <div className="flex justify-between items-center mb-3 gap-2">
                    <h2 className="font-bold flex items-center gap-2">
                      <Users size={18} className="text-cyber-emerald" /> Equipe ({filteredSidebarEmployees.length})
                    </h2>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBulkSelectedIds(
                            employees
                              .filter((e) => e.role !== 'Admin')
                              .filter((e) => (!empCompanyFilter ? true : e.company_id === empCompanyFilter))
                              .map((e) => e.id)
                          );
                          setBulkCompanyFilter(empCompanyFilter);
                          if (position) {
                            setBulkLatVal(String(position[0]));
                            setBulkLngVal(String(position[1]));
                          }
                          setShowBulkModal(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 flex items-center gap-1"
                        title="Alterar condições (GPS, Celular, Senha, Horário) de vários funcionários de uma só vez"
                      >
                        <Sliders size={13} /> Lote
                      </button>
                      <button
                        type="button"
                        onClick={resetForm}
                        className="bg-cyber-emerald text-white p-2 rounded-full hover:bg-opacity-90 transition-all"
                        title="Novo Funcionário"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Busca e Filtro por Empresa na Equipe */}
                  <div className="space-y-2 mb-3">
                    {!loggedAdmin.company_id && allCompanies.length > 0 && (
                      <select
                        value={empCompanyFilter}
                        onChange={(e) => setEmpCompanyFilter(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-industrial-bg border border-industrial-border rounded-lg text-xs font-semibold outline-none focus:border-cyber-emerald"
                      >
                        <option value="">Todas as Empresas</option>
                        {allCompanies.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-2 text-industrial-muted" />
                      <input
                        type="text"
                        placeholder="Buscar por nome, cargo ou CPF..."
                        value={empSearchFilter}
                        onChange={(e) => setEmpSearchFilter(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-industrial-bg border border-industrial-border rounded-lg text-xs outline-none focus:border-cyber-emerald"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-industrial-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showInactiveEmployees}
                        onChange={(e) => setShowInactiveEmployees(e.target.checked)}
                        className="w-3.5 h-3.5 accent-emerald-600"
                      />
                      <span>Mostrar funcionários desativados</span>
                    </label>
                  </div>

                  <div className="overflow-y-auto flex-1 space-y-2">
                    {filteredSidebarEmployees.map((emp) => {
                      const inactive = isEmployeeInactive(emp);
                      return (
                      <div
                        key={emp.id}
                        className={`p-3 rounded-xl border transition-all ${
                          selectedEmployee?.id === emp.id
                            ? 'border-cyber-emerald bg-cyber-emerald/5'
                            : inactive
                            ? 'border-red-200 bg-red-50/40 opacity-75'
                            : 'border-industrial-border hover:bg-industrial-card-hover'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="cursor-pointer flex-1 pr-2" onClick={() => handleEdit(emp)}>
                            <p className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                              <span>{emp.name}</span>
                              {inactive && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                                  Inativo
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-industrial-muted">
                              {emp.role} • {emp.companies?.name || 'Sem Empresa'}
                            </p>
                          </div>
                          <div className="flex gap-1.5 items-center">
                            <button
                              type="button"
                              onClick={() => handleToggleEmployeeActive(emp)}
                              className={`transition-colors p-1 ${
                                inactive
                                  ? 'text-emerald-600 hover:text-emerald-800'
                                  : 'text-industrial-muted hover:text-amber-600'
                              }`}
                              title={inactive ? 'Reativar Funcionário' : 'Desativar Funcionário (Geral)'}
                            >
                              <Power size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEspelhoEmployee(emp)}
                              className="text-industrial-muted hover:text-cyber-emerald transition-colors"
                              title="Ver Espelho Individual"
                            >
                              <FileText size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(emp)}
                              className="text-industrial-muted hover:text-cyber-emerald transition-colors"
                              title="Editar Funcionário"
                            >
                              <Edit2 size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[640px] flex flex-col overflow-y-auto">
                  <h2 className="font-bold text-lg mb-4">
                    {selectedEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}
                  </h2>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1 flex items-center gap-1">
                        <Building2 size={13} /> Empresa
                      </label>
                      <select
                        value={companyId}
                        onChange={(e) => setCompanyId(e.target.value)}
                        disabled={Boolean(loggedAdmin.company_id)}
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
                      >
                        <option value="">Selecione...</option>
                        {allCompanies.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">
                        Cargo
                      </label>
                      <input
                        type="text"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">
                        CPF (apenas números)
                      </label>
                      <input
                        type="text"
                        value={cpf}
                        onChange={(e) => setCpf(e.target.value)}
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">
                        PIS (apenas números)
                      </label>
                      <input
                        type="text"
                        value={pis}
                        onChange={(e) => setPis(e.target.value)}
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">
                        Senha (PIN)
                      </label>
                      <input
                        type="text"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">
                        Tipo de Autenticação
                      </label>
                      <select
                        value={authMethod}
                        onChange={(e) => setAuthMethod(e.target.value)}
                        className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald"
                      >
                        <option value="both">Biometria OU Senha</option>
                        <option value="strict">Senha E Biometria</option>
                        <option value="biometrics">Somente Biometria</option>
                        <option value="pin">Somente Senha</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">
                        Raio GPS em metros (0 = Sem limite)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={radius}
                        onChange={(e) => setRadius(e.target.value === '' ? 0 : Number(e.target.value))}
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <input
                        type="checkbox"
                        checked={ignoreGpsOnPc}
                        onChange={(e) => setIgnoreGpsOnPc(e.target.checked)}
                        className="rounded border-industrial-border text-cyber-emerald focus:ring-cyber-emerald w-4 h-4"
                      />
                      <label className="text-xs font-semibold text-industrial-muted">
                        Ignorar validação de GPS em Computadores (PC)
                      </label>
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <input
                        type="checkbox"
                        checked={blockMobileAccess}
                        onChange={(e) => setBlockMobileAccess(e.target.checked)}
                        className="rounded border-industrial-border text-red-500 focus:ring-red-500 w-4 h-4"
                      />
                      <label className="text-xs font-semibold text-red-600">
                        Bloquear registro de ponto por Celular (Mobile)
                      </label>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={macRestrictionEnabled}
                          onChange={(e) => setMacRestrictionEnabled(e.target.checked)}
                          className="rounded border-industrial-border text-cyber-emerald focus:ring-cyber-emerald w-4 h-4"
                        />
                        <label className="block text-xs font-semibold text-industrial-muted">
                          Habilitar Restrição por MAC Address do Computador
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={allowedMac}
                          onChange={(e) => setAllowedMac(e.target.value.toUpperCase())}
                          placeholder="Ex: 00:1A:2B:3C:4D:5E (Vazio = Sem Restrição)"
                          className="flex-1 bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald font-mono uppercase"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch('http://127.0.0.1:8000/mac-address');
                              const data = await res.json();
                              if (data.success && data.macAddress) {
                                setAllowedMac(data.macAddress.toUpperCase());
                                alert('MAC Address obtido do servidor local: ' + data.macAddress);
                              } else {
                                alert('Não foi possível obter o MAC. O servidor local está rodando?');
                              }
                            } catch {
                              alert('Erro ao contatar o servidor local em http://127.0.0.1:8000.');
                            }
                          }}
                          className="bg-white border border-industrial-border text-industrial-text hover:border-cyber-emerald hover:text-cyber-emerald px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          Capturar MAC Deste PC
                        </button>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">
                        Importar do Google Maps (Link ou Coordenadas)
                      </label>
                      <input
                        type="text"
                        value={googleMapsInput}
                        onChange={(e) => handleImportGoogleMaps(e.target.value)}
                        placeholder="Cole o link completo do local ou as coordenadas (ex: -23.564, -46.654)"
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={position ? position[0] : ''}
                        onChange={(e) =>
                          setPosition(
                            e.target.value ? [Number(e.target.value), position ? position[1] : 0] : null
                          )
                        }
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                        placeholder="Ex: -23.5505"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-industrial-muted mb-1">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={position ? position[1] : ''}
                        onChange={(e) =>
                          setPosition(
                            e.target.value ? [position ? position[0] : 0, Number(e.target.value)] : null
                          )
                        }
                        className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                        placeholder="Ex: -46.6333"
                      />
                    </div>
                    <div className="col-span-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.geolocation.getCurrentPosition(
                            async (pos) => {
                              const lat = pos.coords.latitude;
                              const lon = pos.coords.longitude;
                              setPosition([lat, lon]);
                              alert(`Geolocalização obtida!\nLat: ${lat}\nLng: ${lon}`);
                            },
                            () =>
                              alert(
                                'Erro ao obter localização. Verifique as permissões de geolocalização do navegador.'
                              ),
                            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                          );
                        }}
                        className="flex-1 bg-white border border-industrial-border text-industrial-text hover:border-cyber-emerald hover:text-cyber-emerald px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <Navigation size={16} className="text-cyber-emerald" /> Usar Geolocalização do Meu Navegador
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPosition(null);
                          setGoogleMapsInput('');
                        }}
                        className="bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>

                  <div className="mb-6 p-4 rounded-xl border border-industrial-border bg-industrial-bg/50">
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                      <div className="flex items-center gap-4">
                        <h3 className="font-bold text-sm">Carga Horária</h3>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-industrial-muted font-bold">
                            Jornada Semanal (Horas):
                          </label>
                          <input
                            type="number"
                            value={weeklyHours}
                            onChange={(e) => setWeeklyHours(Number(e.target.value))}
                            className="w-16 bg-white border border-industrial-border rounded p-1 text-xs focus:outline-none focus:border-cyber-emerald"
                          />
                        </div>
                      </div>
                      <div className="flex bg-white rounded-lg border border-industrial-border p-1">
                        <button
                          type="button"
                          onClick={() => setScheduleType('standard')}
                          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                            scheduleType === 'standard'
                              ? 'bg-industrial-text text-white'
                              : 'text-industrial-muted hover:text-industrial-text'
                          }`}
                        >
                          Padrão Semanal
                        </button>
                        <button
                          type="button"
                          onClick={() => setScheduleType('custom')}
                          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                            scheduleType === 'custom'
                              ? 'bg-industrial-text text-white'
                              : 'text-industrial-muted hover:text-industrial-text'
                          }`}
                        >
                          Individual (Por Dia)
                        </button>
                      </div>
                    </div>

                    {scheduleType === 'standard' ? (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-industrial-muted mb-1">
                              Entrada (Manhã)
                            </label>
                            <input
                              type="time"
                              value={workStart}
                              onChange={(e) => setWorkStart(e.target.value)}
                              className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-industrial-muted mb-1">
                              Saída (Almoço)
                            </label>
                            <input
                              type="time"
                              value={breakStart}
                              onChange={(e) => setBreakStart(e.target.value)}
                              className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-industrial-muted mb-1">
                              Retorno (Tarde)
                            </label>
                            <input
                              type="time"
                              value={breakEnd}
                              onChange={(e) => setBreakEnd(e.target.value)}
                              className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-industrial-muted mb-1">
                              Saída (Fim)
                            </label>
                            <input
                              type="time"
                              value={workEnd}
                              onChange={(e) => setWorkEnd(e.target.value)}
                              className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-industrial-muted mb-2">
                            Dias de Trabalho
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() =>
                                  setWorkDays((prev) =>
                                    prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
                                  )
                                }
                                className={`px-3 py-1 text-xs font-semibold rounded-md border ${
                                  workDays.includes(idx)
                                    ? 'bg-cyber-emerald text-white border-cyber-emerald'
                                    : 'bg-white text-industrial-muted border-industrial-border hover:bg-industrial-bg'
                                }`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(
                          (dayName, idx) => {
                            const sc = customSchedule[idx] || {
                              active: false,
                              work_start: '',
                              break_start: '',
                              break_end: '',
                              work_end: '',
                            };
                            return (
                              <div
                                key={idx}
                                className="flex flex-col md:flex-row items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-industrial-border"
                              >
                                <div className="w-24 flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={sc.active}
                                    onChange={(e) =>
                                      setCustomSchedule({
                                        ...customSchedule,
                                        [idx]: { ...sc, active: e.target.checked },
                                      })
                                    }
                                    className="rounded border-industrial-border text-cyber-emerald focus:ring-cyber-emerald"
                                  />
                                  <span
                                    className={`text-sm font-semibold ${
                                      sc.active ? 'text-industrial-text' : 'text-industrial-muted'
                                    }`}
                                  >
                                    {dayName}
                                  </span>
                                </div>

                                {sc.active ? (
                                  <div className="flex-1 grid grid-cols-4 gap-2 w-full">
                                    <input
                                      type="time"
                                      title="Entrada"
                                      value={sc.work_start}
                                      onChange={(e) =>
                                        setCustomSchedule({
                                          ...customSchedule,
                                          [idx]: { ...sc, work_start: e.target.value },
                                        })
                                      }
                                      className="w-full bg-industrial-bg border border-industrial-border rounded-md p-1.5 text-xs focus:outline-none focus:border-cyber-emerald"
                                    />
                                    <input
                                      type="time"
                                      title="Saída Manhã (opcional p/ meio período)"
                                      value={sc.break_start}
                                      onChange={(e) =>
                                        setCustomSchedule({
                                          ...customSchedule,
                                          [idx]: { ...sc, break_start: e.target.value },
                                        })
                                      }
                                      className="w-full bg-industrial-bg border border-industrial-border rounded-md p-1.5 text-xs focus:outline-none focus:border-cyber-emerald"
                                    />
                                    <input
                                      type="time"
                                      title="Retorno Tarde"
                                      value={sc.break_end}
                                      onChange={(e) =>
                                        setCustomSchedule({
                                          ...customSchedule,
                                          [idx]: { ...sc, break_end: e.target.value },
                                        })
                                      }
                                      className="w-full bg-industrial-bg border border-industrial-border rounded-md p-1.5 text-xs focus:outline-none focus:border-cyber-emerald"
                                    />
                                    <input
                                      type="time"
                                      title="Saída Fim"
                                      value={sc.work_end}
                                      onChange={(e) =>
                                        setCustomSchedule({
                                          ...customSchedule,
                                          [idx]: { ...sc, work_end: e.target.value },
                                        })
                                      }
                                      className="w-full bg-industrial-bg border border-industrial-border rounded-md p-1.5 text-xs focus:outline-none focus:border-cyber-emerald"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex-1 text-xs text-industrial-muted italic py-1.5">
                                    Sem expediente (Folga)
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>

                  {/* Biometria Section */}
                  <div className="mb-6 p-4 rounded-xl border border-industrial-border bg-industrial-bg/50">
                    <div className="flex justify-between items-center">
                      <div>
                        <label className="block text-sm font-bold text-industrial-text flex items-center gap-2">
                          <Fingerprint size={16} className="text-cyber-emerald" /> Biometria (SecuGen)
                        </label>
                        <p className="text-xs text-industrial-muted mt-1">
                          {biometricTemplate
                            ? 'Digital cadastrada no sistema.'
                            : 'Nenhuma digital cadastrada para este funcionário.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsCapturing(true);
                          try {
                            const res = await fetch('http://127.0.0.1:8000/SGIFPCapture', {
                              method: 'POST',
                            });
                            const data = await res.json();
                            if (data.success && data.template) {
                              setBiometricTemplate(data.template);
                              alert('Digital capturada com sucesso! Salve o funcionário para finalizar.');
                            } else {
                              alert('Erro ao capturar digital: ' + (data.error || 'Tente novamente'));
                            }
                          } catch {
                            alert(
                              'Falha ao comunicar com o leitor. Verifique se o servidor local SecuGen está rodando.'
                            );
                          }
                          setIsCapturing(false);
                        }}
                        disabled={isCapturing}
                        className="bg-white border border-industrial-border px-4 py-2 rounded-lg text-sm font-semibold hover:border-cyber-emerald hover:text-cyber-emerald transition-colors flex items-center gap-2"
                      >
                        {isCapturing
                          ? 'Lendo Dedo...'
                          : biometricTemplate
                          ? 'Substituir Digital'
                          : 'Cadastrar Digital'}
                        {biometricTemplate && !isCapturing && (
                          <CheckCircle2 size={16} className="text-green-500" />
                        )}
                      </button>
                    </div>

                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-industrial-border/50">
                      <div>
                        <label className="block text-sm font-bold text-industrial-text flex items-center gap-2">
                          <Smartphone size={16} className="text-cyber-emerald" /> Biometria Web (WebAuthn / Celular)
                        </label>
                        <p className="text-xs text-industrial-muted mt-1">
                          {pendingWebAuthn
                            ? 'Dispositivo WebAuthn capturado! Salve para finalizar.'
                            : hasWebAuthn
                            ? 'Dispositivo WebAuthn cadastrado no sistema.'
                            : 'Nenhum dispositivo WebAuthn cadastrado.'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {hasWebAuthn && selectedEmployee && !pendingWebAuthn && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                confirm(
                                  'Tem certeza que deseja remover o celular/WebAuthn deste funcionário?'
                                )
                              ) {
                                await supabase
                                  .from('webauthn_credentials')
                                  .delete()
                                  .eq('employee_id', selectedEmployee.id);
                                setHasWebAuthn(false);
                                alert('Biometria WebAuthn removida!');
                              }
                            }}
                            className="bg-red-500/10 text-red-500 border border-red-500/50 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-500 hover:text-white transition-colors"
                          >
                            Remover WebAuthn
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            const tempId = selectedEmployee?.id || crypto.randomUUID();
                            const tempName = name || 'Novo Funcionário';
                            const result = await registerWebAuthn(tempName, tempId);
                            if (result) {
                              setPendingWebAuthn(result);
                              alert('Aparelho capturado com sucesso! Salve o funcionário para finalizar.');
                            }
                          }}
                          className="bg-white border border-industrial-border px-4 py-2 rounded-lg text-sm font-semibold hover:border-cyber-emerald hover:text-cyber-emerald transition-colors flex items-center gap-2"
                        >
                          {pendingWebAuthn || hasWebAuthn ? 'Substituir' : 'Cadastrar Aparelho Atual'}
                          {pendingWebAuthn && <CheckCircle2 size={16} className="text-green-500" />}
                        </button>
                      </div>
                    </div>

                    {/* Facial Biometry Section */}
                    <div className="flex justify-between items-start mt-4 pt-4 border-t border-industrial-border/50">
                      <div>
                        <label className="block text-sm font-bold text-industrial-text flex items-center gap-2">
                          <Camera size={16} className="text-cyber-emerald" /> Biometria Facial (Câmera)
                        </label>
                        <p className="text-xs text-industrial-muted mt-1">
                          {pendingFacialDescriptor
                            ? 'Rosto capturado! Salve para finalizar.'
                            : hasFacialTemplate
                            ? 'Biometria facial cadastrada no sistema.'
                            : 'Nenhuma biometria facial cadastrada.'}
                        </p>

                        {isCameraOpen && (
                          <div
                            className="mt-4 flex flex-col gap-2 border border-industrial-border rounded-lg overflow-hidden relative"
                            style={{ width: 320, height: 240 }}
                          >
                            <video
                              ref={videoRef}
                              autoPlay
                              muted
                              playsInline
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <div className="absolute bottom-2 w-full flex justify-center gap-2 px-2">
                              <button
                                type="button"
                                onClick={captureFace}
                                disabled={isCapturingFace}
                                className="bg-cyber-emerald text-white px-4 py-2 rounded-lg text-sm font-bold flex-1 shadow-md"
                              >
                                {isCapturingFace ? 'Processando...' : 'Capturar Rosto'}
                              </button>
                              <button
                                type="button"
                                onClick={closeCamera}
                                className="bg-white text-red-500 px-4 py-2 rounded-lg text-sm font-bold shadow-md"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {hasFacialTemplate && selectedEmployee && !pendingFacialDescriptor && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                confirm(
                                  'Tem certeza que deseja remover a biometria facial deste funcionário?'
                                )
                              ) {
                                await supabase
                                  .from('facial_templates')
                                  .delete()
                                  .eq('employee_id', selectedEmployee.id);
                                setHasFacialTemplate(false);
                                alert('Biometria facial removida!');
                              }
                            }}
                            className="bg-red-500/10 text-red-500 border border-red-500/50 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-500 hover:text-white transition-colors"
                          >
                            Remover Facial
                          </button>
                        )}
                        {!isCameraOpen && (
                          <button
                            type="button"
                            onClick={startCamera}
                            className="bg-white border border-industrial-border px-4 py-2 rounded-lg text-sm font-semibold hover:border-cyber-emerald hover:text-cyber-emerald transition-colors flex items-center gap-2"
                          >
                            {pendingFacialDescriptor
                              ? 'Recapturar Rosto'
                              : hasFacialTemplate
                              ? 'Substituir Rosto'
                              : 'Abrir Câmera'}
                            {pendingFacialDescriptor && (
                              <CheckCircle2 size={16} className="text-green-500" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col mb-4 min-h-[250px]">
                    <label className="block text-xs font-semibold text-industrial-muted mb-2 flex items-center gap-1">
                      <MapPin size={14} /> Local Permitido de Marcação (Clique no mapa)
                    </label>
                    <div className="flex-1 rounded-xl overflow-hidden border border-industrial-border z-0 relative">
                      <MapContainer
                        center={position || [-23.55052, -46.633308]}
                        zoom={13}
                        scrollWheelZoom={true}
                        style={{ height: '100%', width: '100%' }}
                      >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <MapFeatures setPosition={setPosition} />
                        <MapRecenter position={position} />
                        <LocationPicker
                          position={position}
                          setPosition={setPosition}
                          radius={radius}
                        />
                      </MapContainer>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {selectedEmployee && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleEmployeeActive(selectedEmployee)}
                          className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                            isEmployeeInactive(selectedEmployee)
                              ? 'bg-corporate-blue text-white hover:bg-opacity-90'
                              : 'bg-amber-500 text-white hover:bg-amber-600'
                          }`}
                        >
                          <Power size={18} />
                          {isEmployeeInactive(selectedEmployee)
                            ? 'Reativar Funcionário'
                            : 'Desativar Funcionário'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteEmployee}
                          className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all"
                        >
                          <Trash2 size={18} /> Excluir
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleSave}
                      className={`${
                        selectedEmployee ? 'flex-1' : 'w-full'
                      } bg-cyber-emerald text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all`}
                    >
                      <Save size={18} /> Salvar Cadastro
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de Alteração de Condições em Lote */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-industrial-border w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-industrial-border bg-industrial-bg flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Sliders size={18} className="text-cyber-emerald" />
                  Alterar Condições em Lote (Vários Funcionários)
                </h3>
                <p className="text-xs text-industrial-muted">
                  Apenas os itens que você marcar abaixo serão alterados nos funcionários selecionados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="p-1 text-industrial-muted hover:text-industrial-text"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBulkConditions} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-bold text-industrial-text">
                    1. Escolha os Funcionários ({bulkSelectedIds.length} selecionados)
                  </label>
                  <div className="flex items-center gap-2">
                    {!loggedAdmin.company_id && allCompanies.length > 0 && (
                      <select
                        value={bulkCompanyFilter}
                        onChange={(e) => {
                          const cid = e.target.value;
                          setBulkCompanyFilter(cid);
                          setBulkSelectedIds(
                            employees
                              .filter((emp) => emp.role !== 'Admin')
                              .filter((emp) => (!cid ? true : emp.company_id === cid))
                              .map((emp) => emp.id)
                          );
                        }}
                        className="px-2 py-1 rounded border border-industrial-border bg-white font-semibold"
                      >
                        <option value="">Todas as Empresas</option>
                        {allCompanies.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setBulkSelectedIds(bulkCandidateEmployees.map((e) => e.id))}
                      className="text-cyber-emerald font-bold hover:underline"
                    >
                      Marcar Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkSelectedIds([])}
                      className="text-industrial-muted font-semibold hover:underline"
                    >
                      Desmarcar
                    </button>
                  </div>
                </div>

                <div className="max-h-36 overflow-y-auto border border-industrial-border rounded-xl p-2.5 bg-industrial-bg/40 flex flex-wrap gap-1.5">
                  {bulkCandidateEmployees.map((e) => {
                    const checked = bulkSelectedIds.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() =>
                          setBulkSelectedIds((prev) =>
                            prev.includes(e.id) ? prev.filter((id) => id !== e.id) : [...prev, e.id]
                          )
                        }
                        className={`px-2.5 py-1 rounded-full font-semibold border transition-all ${
                          checked
                            ? 'bg-cyber-emerald text-white border-cyber-emerald'
                            : 'bg-white text-industrial-text border-industrial-border'
                        }`}
                      >
                        {e.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-industrial-border">
                <div className="font-bold text-industrial-text">
                  2. Marque quais condições deseja aplicar:
                </div>

                <div className="p-3 rounded-xl border border-industrial-border flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplyAuth}
                      onChange={(e) => setBulkApplyAuth(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    Tipo de Autenticação
                  </label>
                  <select
                    value={bulkAuthVal}
                    onChange={(e) => setBulkAuthVal(e.target.value)}
                    disabled={!bulkApplyAuth}
                    className="px-2.5 py-1.5 rounded border border-industrial-border bg-white disabled:opacity-50"
                  >
                    <option value="both">Biometria OU Senha</option>
                    <option value="strict">Senha E Biometria</option>
                    <option value="biometrics">Somente Biometria</option>
                    <option value="pin">Somente Senha</option>
                  </select>
                </div>

                <div className="p-3 rounded-xl border border-industrial-border flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplyIgnoreGpsPc}
                      onChange={(e) => setBulkApplyIgnoreGpsPc(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    Ignorar GPS em Computadores (PC)
                  </label>
                  <select
                    value={bulkIgnoreGpsPcVal ? 'true' : 'false'}
                    onChange={(e) => setBulkIgnoreGpsPcVal(e.target.value === 'true')}
                    disabled={!bulkApplyIgnoreGpsPc}
                    className="px-2.5 py-1.5 rounded border border-industrial-border bg-white disabled:opacity-50"
                  >
                    <option value="true">Sim (Ignorar GPS no PC)</option>
                    <option value="false">Não (Exigir GPS no PC)</option>
                  </select>
                </div>

                <div className="p-3 rounded-xl border border-industrial-border flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplyBlockMobile}
                      onChange={(e) => setBulkApplyBlockMobile(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    Acesso por Celular (Mobile)
                  </label>
                  <select
                    value={bulkBlockMobileVal ? 'true' : 'false'}
                    onChange={(e) => setBulkBlockMobileVal(e.target.value === 'true')}
                    disabled={!bulkApplyBlockMobile}
                    className="px-2.5 py-1.5 rounded border border-industrial-border bg-white disabled:opacity-50"
                  >
                    <option value="false">Liberado no Celular</option>
                    <option value="true">Bloqueado no Celular</option>
                  </select>
                </div>

                <div className="p-3 rounded-xl border border-industrial-border flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplyMac}
                      onChange={(e) => setBulkApplyMac(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    Restrição por MAC Address
                  </label>
                  <select
                    value={bulkMacEnabledVal ? 'true' : 'false'}
                    onChange={(e) => setBulkMacEnabledVal(e.target.value === 'true')}
                    disabled={!bulkApplyMac}
                    className="px-2.5 py-1.5 rounded border border-industrial-border bg-white disabled:opacity-50"
                  >
                    <option value="false">Desativada</option>
                    <option value="true">Ativada</option>
                  </select>
                </div>

                <div className="p-3 rounded-xl border border-industrial-border flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplyRadius}
                      onChange={(e) => setBulkApplyRadius(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    Raio GPS Permitido (0 = Sem Limite)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={bulkRadiusVal}
                    onChange={(e) => setBulkRadiusVal(Number(e.target.value))}
                    disabled={!bulkApplyRadius}
                    className="w-28 px-2.5 py-1.5 rounded border border-industrial-border bg-white font-bold text-center disabled:opacity-50"
                  />
                </div>

                <div className="p-3 rounded-xl border border-industrial-border space-y-2">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplyCoords}
                      onChange={(e) => setBulkApplyCoords(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    Localização GPS Permitida (Lat / Lng — vazio limpa restrição)
                  </label>
                  {bulkApplyCoords && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="any"
                        placeholder="Latitude"
                        value={bulkLatVal}
                        onChange={(e) => setBulkLatVal(e.target.value)}
                        className="px-2.5 py-1.5 rounded border border-industrial-border bg-white"
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder="Longitude"
                        value={bulkLngVal}
                        onChange={(e) => setBulkLngVal(e.target.value)}
                        className="px-2.5 py-1.5 rounded border border-industrial-border bg-white"
                      />
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl border border-industrial-border space-y-2">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkApplySchedule}
                      onChange={(e) => setBulkApplySchedule(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    Carga Horária e Horário Padrão
                  </label>
                  {bulkApplySchedule && (
                    <div className="grid grid-cols-5 gap-2">
                      <div>
                        <span className="text-[10px] text-industrial-muted block">Horas/Sem</span>
                        <input
                          type="number"
                          value={bulkWeeklyHours}
                          onChange={(e) => setBulkWeeklyHours(Number(e.target.value) || 44)}
                          className="w-full px-2 py-1 rounded border border-industrial-border"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-industrial-muted block">Entrada</span>
                        <input
                          type="time"
                          value={bulkWs}
                          onChange={(e) => setBulkWs(e.target.value)}
                          className="w-full px-2 py-1 rounded border border-industrial-border"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-industrial-muted block">Saída Alm.</span>
                        <input
                          type="time"
                          value={bulkBs}
                          onChange={(e) => setBulkBs(e.target.value)}
                          className="w-full px-2 py-1 rounded border border-industrial-border"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-industrial-muted block">Volta Alm.</span>
                        <input
                          type="time"
                          value={bulkBe}
                          onChange={(e) => setBulkBe(e.target.value)}
                          className="w-full px-2 py-1 rounded border border-industrial-border"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-industrial-muted block">Saída</span>
                        <input
                          type="time"
                          value={bulkWe}
                          onChange={(e) => setBulkWe(e.target.value)}
                          className="w-full px-2 py-1 rounded border border-industrial-border"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-industrial-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 rounded-xl border border-industrial-border font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingBulk}
                  className="px-5 py-2 rounded-xl bg-cyber-emerald text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save size={15} /> {isSavingBulk ? 'Salvando...' : 'Aplicar em Lote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
