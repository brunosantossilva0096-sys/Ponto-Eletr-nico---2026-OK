import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, Company } from '../types';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Users, MapPin, Save, Plus, ArrowLeft, Search, Navigation, Fingerprint, CheckCircle2, Trash2, Edit2, FileText } from 'lucide-react';
import { AdminReports } from './AdminReports';
import { AdminCompanies } from './AdminCompanies';
import { AdminHolidays } from './AdminHolidays';
import { AdminAbsences } from './AdminAbsences';
import { EmployeeReports } from './EmployeeReports';
import { AdminTimeBank } from './AdminTimeBank';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminUser } from '../types';

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
      <Circle center={position} radius={radius} pathOptions={{ color: '#e11d48', fillColor: '#e11d48' }} />
    </>
  );
};

const MapFeatures = ({ setPosition }: { setPosition: (p: [number, number]) => void }) => {
  const map = useMap();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        map.flyTo([lat, lon], 16);
        setPosition([lat, lon]);
      } else {
        alert('Local não encontrado.');
      }
    } catch (err) {
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
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
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
      <form onSubmit={handleSearch} className="flex-1 flex bg-white p-1 rounded-lg shadow-sm border border-industrial-border">
        <input 
          type="text" 
          placeholder="Buscar local (ex: Av Paulista, 1000)" 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
          className="flex-1 px-3 py-1 outline-none text-sm text-industrial-text bg-transparent"
        />
        <button type="submit" className="bg-industrial-bg p-1.5 rounded-md hover:bg-industrial-border transition-colors text-industrial-muted">
          <Search size={16} />
        </button>
      </form>
      <button 
        onClick={handleMyLocation}
        className="bg-white p-2 rounded-lg shadow-sm border border-industrial-border hover:bg-industrial-bg transition-colors flex items-center justify-center text-cyber-emerald"
        title="Meu Local Atual"
      >
        <Navigation size={18} />
      </button>
    </div>
  );
};

export const AdminPanel = ({ loggedAdmin, onLogout }: { loggedAdmin: AdminUser, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState<'employees' | 'companies' | 'reports' | 'holidays' | 'absences' | 'timebank' | 'admins'>(loggedAdmin.role === 'convencional' ? 'reports' : 'employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [espelhoEmployee, setEspelhoEmployee] = useState<Employee | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [pis, setPis] = useState('');
  const [role, setRole] = useState('');
  const [pin, setPin] = useState('');
  const [authMethod, setAuthMethod] = useState('both');
  const [companyId, setCompanyId] = useState('');
  const [googleMapsInput, setGoogleMapsInput] = useState('');
  const [position, setPosition] = useState<[number, number] | null>(null);

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
  const [isCapturing, setIsCapturing] = useState(false);
  const [workStart, setWorkStart] = useState('');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [workEnd, setWorkEnd] = useState('');
  const [workDays, setWorkDays] = useState<number[]>([1,2,3,4,5]);
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

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('*, companies(*)').order('name');
    if (data) setEmployees(data);
  };

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    if (data) setAllCompanies(data);
  };

  useEffect(() => {
    fetchEmployees();
    fetchCompanies();
  }, []);

  const fetchBiometric = async (empId: string) => {
    const { data } = await supabase.from('biometric_templates').select('template').eq('employee_id', empId).maybeSingle();
    if (data) setBiometricTemplate(data.template);
    else setBiometricTemplate(null);
  };

  const resetForm = () => {
    setSelectedEmployee(null);
    setName('');
    setCpf('');
    setPis('');
    setRole('');
    setPin('');
    setAuthMethod('both');
    setCompanyId('');
    setPosition(null);
    setGoogleMapsInput('');
    setBiometricTemplate(null);
    setWorkStart('');
    setBreakStart('');
    setBreakEnd('');
    setWorkEnd('');
    setWorkDays([1,2,3,4,5]);
    setWeeklyHours(44);
    setScheduleType('standard');
    setCustomSchedule(DEFAULT_CUSTOM);
    setRadius(100);
  };

  const handleEdit = (emp: Employee) => {
    setSelectedEmployee(emp);
    setName(emp.name);
    setCpf(emp.cpf);
    setPis(emp.pis);
    setRole(emp.role);
    setPin(emp.pin || '');
    setAuthMethod(emp.auth_method || 'both');
    setCompanyId(emp.company_id || '');
    setRadius(emp.allowed_radius !== null && emp.allowed_radius !== undefined ? emp.allowed_radius : 100);
    setWorkStart(emp.work_start || '');
    setBreakStart(emp.break_start || '');
    setBreakEnd(emp.break_end || '');
    setWorkEnd(emp.work_end || '');
    setWorkDays(emp.work_days || [1,2,3,4,5]);
    setWeeklyHours(emp.weekly_hours || 44);
    setScheduleType(emp.schedule_type || 'standard');
    setCustomSchedule(emp.custom_schedule && Object.keys(emp.custom_schedule).length > 0 ? emp.custom_schedule : DEFAULT_CUSTOM);
    setBiometricTemplate(null);
    fetchBiometric(emp.id);
    setGoogleMapsInput('');
    
    if (emp.allowed_lat && emp.allowed_lng) {
      setPosition([emp.allowed_lat, emp.allowed_lng]);
    } else {
      setPosition(null);
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      alert('Selecione uma Empresa para o funcionário.');
      return;
    }

    const empData = {
      name,
      cpf: cpf || null,
      pis: pis || null,
      role,
      pin,
      auth_method: authMethod,
      allowed_lat: position ? position[0] : null,
      allowed_lng: position ? position[1] : null,
      allowed_radius: radius,
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
      const { data: existingBio } = await supabase.from('biometric_templates').select('user_id').eq('employee_id', empId).maybeSingle();
      if (existingBio) {
        await supabase.from('biometric_templates').update({ template: biometricTemplate }).eq('employee_id', empId);
      } else {
        await supabase.from('biometric_templates').insert([{ employee_id: empId, user_id: pis || cpf, template: biometricTemplate }]);
      }
    }
    
    alert('Funcionário salvo com sucesso!');
    resetForm();
    fetchEmployees();
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    if (confirm(`Tem certeza que deseja excluir o funcionário "${selectedEmployee.name}"? Todos os pontos batidos e digitais associadas serão excluídos permanentemente.`)) {
      try {
        await supabase.from('biometric_templates').delete().eq('employee_id', selectedEmployee.id);
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
            <EmployeeReports employee={espelhoEmployee} onBack={() => setEspelhoEmployee(null)} isAdmin={true} />
          </div>
        ) : (
          <>
            <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-industrial-border">
          <div>
            <h1 className="text-2xl font-bold text-industrial-text flex items-center gap-4">
              Gestão Corporativa
              <div className="flex bg-industrial-bg rounded-lg p-1 overflow-x-auto max-w-full">
                {loggedAdmin.role !== 'convencional' && (
                  <>
                    <button 
                      onClick={() => setActiveTab('employees')} 
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${activeTab === 'employees' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                    >
                      Funcionários
                    </button>
                    <button 
                      onClick={() => setActiveTab('companies')} 
                      className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${activeTab === 'companies' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                    >
                      Empresas
                    </button>
                  </>
                )}

                <button 
                  onClick={() => setActiveTab('reports')} 
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeTab === 'reports' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                >
                  Relatórios
                </button>
                <button 
                  onClick={() => setActiveTab('holidays')} 
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeTab === 'holidays' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                >
                  Feriados
                </button>
                <button 
                  onClick={() => setActiveTab('absences')} 
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeTab === 'absences' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                >
                  Abonos
                </button>
                <button 
                  onClick={() => setActiveTab('timebank')} 
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeTab === 'timebank' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                >
                  Banco de Horas
                </button>
                {loggedAdmin.role === 'total' && (
                  <button 
                    onClick={() => setActiveTab('admins')} 
                    className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${activeTab === 'admins' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                  >
                    Administradores
                  </button>
                )}
              </div>
            </h1>
            <p className="text-sm text-industrial-muted mt-2">Gerencie acessos, locais de registro e exporte relatórios.</p>
          </div>
          <button onClick={onLogout} className="text-sm font-medium text-industrial-muted hover:text-cyber-emerald flex items-center gap-2">
            <ArrowLeft size={16} /> Voltar
          </button>
        </header>

        {activeTab === 'companies' && <AdminCompanies />}
        {activeTab === 'reports' && <AdminReports loggedAdmin={loggedAdmin} />}
        {activeTab === 'holidays' && <AdminHolidays />}
        {activeTab === 'absences' && <AdminAbsences />}
        {activeTab === 'timebank' && <AdminTimeBank />}
        {activeTab === 'admins' && <AdminUsersTab loggedAdmin={loggedAdmin} />}
        {activeTab === 'employees' && loggedAdmin.role !== 'convencional' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-industrial-border p-4 flex flex-col h-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold flex items-center gap-2"><Users size={18} className="text-cyber-emerald"/> Equipe</h2>
              <button 
                onClick={resetForm}
                className="bg-cyber-emerald text-white p-2 rounded-full hover:bg-opacity-90 transition-all"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-2">
              {employees.map(emp => (
                <div 
                  key={emp.id} 
                  className={`p-3 rounded-xl border transition-all ${selectedEmployee?.id === emp.id ? 'border-cyber-emerald bg-cyber-emerald/5' : 'border-industrial-border hover:bg-industrial-card-hover'}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="cursor-pointer" onClick={() => handleEdit(emp)}>
                      <p className="font-semibold text-sm">{emp.name}</p>
                      <p className="text-xs text-industrial-muted">{emp.role} • {emp.companies?.name || 'Sem Empresa'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEspelhoEmployee(emp)} className="text-industrial-muted hover:text-cyber-emerald transition-colors" title="Ver Espelho Individual">
                        <FileText size={18} />
                      </button>
                      <button onClick={() => handleEdit(emp)} className="text-industrial-muted hover:text-cyber-emerald transition-colors" title="Editar Funcionário">
                        <Edit2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] flex flex-col overflow-y-auto">
            <h2 className="font-bold text-lg mb-4">{selectedEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Nome Completo</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Empresa</label>
                <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors">
                  <option value="">Selecione...</option>
                  {allCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Cargo</label>
                <input type="text" value={role} onChange={e => setRole(e.target.value)} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">CPF (apenas números)</label>
                <input type="text" value={cpf} onChange={e => setCpf(e.target.value)} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">PIS (apenas números)</label>
                <input type="text" value={pis} onChange={e => setPis(e.target.value)} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Senha (PIN)</label>
                <input type="text" value={pin} onChange={e => setPin(e.target.value)} className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Tipo de Autenticação</label>
                <select value={authMethod} onChange={e => setAuthMethod(e.target.value)} className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald">
                  <option value="both">Biometria OU Senha</option>
                  <option value="strict">Senha E Biometria</option>
                  <option value="biometrics">Somente Biometria</option>
                  <option value="pin">Somente Senha</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Raio GPS (m)</label>
                <input type="number" value={radius} onChange={e => setRadius(e.target.value === '' ? 0 : Number(e.target.value))} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Importar do Google Maps (Link ou Coordenadas)</label>
                <input 
                  type="text" 
                  value={googleMapsInput} 
                  onChange={e => handleImportGoogleMaps(e.target.value)} 
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
                  onChange={e => setPosition(e.target.value ? [Number(e.target.value), position ? position[1] : 0] : null)} 
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
                  onChange={e => setPosition(e.target.value ? [position ? position[0] : 0, Number(e.target.value)] : null)} 
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
                        alert(`Geolocalização do navegador obtida com sucesso!\nLat: ${lat}\nLng: ${lon}`);
                      },
                      () => alert('Erro ao obter localização. Verifique as permissões de geolocalização do seu navegador.'),
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
                  title="Limpar Localização"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="mb-6 p-4 rounded-xl border border-industrial-border bg-industrial-bg/50">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-4">
                  <h3 className="font-bold text-sm">Carga Horária</h3>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-industrial-muted font-bold">Jornada Semanal (Horas):</label>
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
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${scheduleType === 'standard' ? 'bg-industrial-text text-white' : 'text-industrial-muted hover:text-industrial-text'}`}
                  >
                    Padrão Semanal
                  </button>
                  <button 
                    type="button"
                    onClick={() => setScheduleType('custom')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${scheduleType === 'custom' ? 'bg-industrial-text text-white' : 'text-industrial-muted hover:text-industrial-text'}`}
                  >
                    Individual (Por Dia)
                  </button>
                </div>
              </div>

              {scheduleType === 'standard' ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-industrial-muted mb-1">Entrada (Manhã)</label>
                      <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)} className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-industrial-muted mb-1">Saída (Almoço)</label>
                      <input type="time" value={breakStart} onChange={e => setBreakStart(e.target.value)} className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-industrial-muted mb-1">Retorno (Tarde)</label>
                      <input type="time" value={breakEnd} onChange={e => setBreakEnd(e.target.value)} className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-industrial-muted mb-1">Saída (Fim)</label>
                      <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)} className="w-full bg-white border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-industrial-muted mb-2">Dias de Trabalho</label>
                    <div className="flex flex-wrap gap-2">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setWorkDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx])}
                          className={`px-3 py-1 text-xs font-semibold rounded-md border ${workDays.includes(idx) ? 'bg-cyber-emerald text-white border-cyber-emerald' : 'bg-white text-industrial-muted border-industrial-border hover:bg-industrial-bg'}`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((dayName, idx) => {
                    const sc = customSchedule[idx];
                    return (
                      <div key={idx} className="flex flex-col md:flex-row items-start md:items-center gap-3 bg-white p-3 rounded-lg border border-industrial-border">
                        <div className="w-24 flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={sc.active} 
                            onChange={(e) => setCustomSchedule({ ...customSchedule, [idx]: { ...sc, active: e.target.checked } })}
                            className="rounded border-industrial-border text-cyber-emerald focus:ring-cyber-emerald"
                          />
                          <span className={`text-sm font-semibold ${sc.active ? 'text-industrial-text' : 'text-industrial-muted'}`}>{dayName}</span>
                        </div>
                        
                        {sc.active ? (
                          <div className="flex-1 grid grid-cols-4 gap-2 w-full">
                            <div>
                              <input type="time" title="Entrada" value={sc.work_start} onChange={(e) => setCustomSchedule({ ...customSchedule, [idx]: { ...sc, work_start: e.target.value } })} className="w-full bg-industrial-bg border border-industrial-border rounded-md p-1.5 text-xs focus:outline-none focus:border-cyber-emerald" />
                            </div>
                            <div>
                              <input type="time" title="Saída Manhã" value={sc.break_start} onChange={(e) => setCustomSchedule({ ...customSchedule, [idx]: { ...sc, break_start: e.target.value } })} className="w-full bg-industrial-bg border border-industrial-border rounded-md p-1.5 text-xs focus:outline-none focus:border-cyber-emerald" />
                            </div>
                            <div>
                              <input type="time" title="Retorno Tarde" value={sc.break_end} onChange={(e) => setCustomSchedule({ ...customSchedule, [idx]: { ...sc, break_end: e.target.value } })} className="w-full bg-industrial-bg border border-industrial-border rounded-md p-1.5 text-xs focus:outline-none focus:border-cyber-emerald" />
                            </div>
                            <div>
                              <input type="time" title="Saída Fim" value={sc.work_end} onChange={(e) => setCustomSchedule({ ...customSchedule, [idx]: { ...sc, work_end: e.target.value } })} className="w-full bg-industrial-bg border border-industrial-border rounded-md p-1.5 text-xs focus:outline-none focus:border-cyber-emerald" />
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 text-xs text-industrial-muted italic py-1.5">
                            Sem expediente (Folga)
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                    {biometricTemplate ? 'Digital cadastrada no sistema.' : 'Nenhuma digital cadastrada para este funcionário.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setIsCapturing(true);
                    try {
                      const res = await fetch('http://127.0.0.1:8000/SGIFPCapture', { method: 'POST' });
                      const data = await res.json();
                      if (data.success && data.template) {
                        setBiometricTemplate(data.template);
                        alert('Digital capturada com sucesso! Salve o funcionário para finalizar.');
                      } else {
                        alert('Erro ao capturar digital: ' + (data.error || 'Tente novamente'));
                      }
                    } catch (e) {
                      alert('Falha ao comunicar com o leitor. Verifique se o servidor local SecuGen está rodando.');
                    }
                    setIsCapturing(false);
                  }}
                  disabled={isCapturing}
                  className="bg-white border border-industrial-border px-4 py-2 rounded-lg text-sm font-semibold hover:border-cyber-emerald hover:text-cyber-emerald transition-colors flex items-center gap-2"
                >
                  {isCapturing ? 'Lendo Dedo...' : (biometricTemplate ? 'Substituir Digital' : 'Cadastrar Digital')}
                  {biometricTemplate && !isCapturing && <CheckCircle2 size={16} className="text-green-500" />}
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col mb-4 min-h-[250px]">
              <label className="block text-xs font-semibold text-industrial-muted mb-2 flex items-center gap-1"><MapPin size={14}/> Local Permitido de Marcação (Clique no mapa)</label>
              <div className="flex-1 rounded-xl overflow-hidden border border-industrial-border z-0 relative">
                <MapContainer center={position || [-23.55052, -46.633308]} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <MapFeatures setPosition={setPosition} />
                  <LocationPicker position={position} setPosition={setPosition} radius={radius} />
                </MapContainer>
              </div>
            </div>

            <div className="flex gap-3">
              {selectedEmployee && (
                <button type="button" onClick={handleDeleteEmployee} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all">
                  <Trash2 size={18} /> Excluir Funcionário
                </button>
              )}
              <button onClick={handleSave} className={`${selectedEmployee ? 'flex-1' : 'w-full'} bg-cyber-emerald text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all`}>
                <Save size={18} /> Salvar Cadastro
              </button>
            </div>
          </div>
          </div>
        )}
        {activeTab === 'reports' && <AdminReports loggedAdmin={loggedAdmin} />}
        {activeTab === 'holidays' && <AdminHolidays />}
        {activeTab === 'companies' && <AdminCompanies />}
        {activeTab === 'absences' && <AdminAbsences />}
        {activeTab === 'timebank' && <AdminTimeBank />}
        {activeTab === 'admins' && <AdminUsersTab loggedAdmin={loggedAdmin} />}
        </>
        )}
      </div>
    </div>
  );
};
