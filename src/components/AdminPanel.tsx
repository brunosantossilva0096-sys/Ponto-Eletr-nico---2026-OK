import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, Company } from '../types';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Users, MapPin, Save, Plus, ArrowLeft, BarChart2, Search, Navigation, Fingerprint, CheckCircle2 } from 'lucide-react';
import { AdminReports } from './AdminReports';
import { AdminCompanies } from './AdminCompanies';
import { AdminHolidays } from './AdminHolidays';
import { AdminAbsences } from './AdminAbsences';

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

export const AdminPanel = ({ onLogout }: { onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState<'employees' | 'reports' | 'companies' | 'holidays' | 'absences'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [pis, setPis] = useState('');
  const [role, setRole] = useState('');
  const [pin, setPin] = useState('');
  const [authMethod, setAuthMethod] = useState<'both' | 'digital' | 'pin'>('both');
  const [companyId, setCompanyId] = useState('');
  const [googleMapsInput, setGoogleMapsInput] = useState('');
  const [position, setPosition] = useState<[number, number] | null>(null);

  const handleImportGoogleMaps = (val: string) => {
    setGoogleMapsInput(val);
    if (!val) return;
    
    // 1. Coordenadas diretas: "-23.55052, -46.633308"
    const directMatch = val.trim().match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
    if (directMatch) {
      setPosition([parseFloat(directMatch[1]), parseFloat(directMatch[2])]);
      return;
    }

    // 2. Formato @lat,lng em URLs do Google Maps
    const atMatch = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      setPosition([parseFloat(atMatch[1]), parseFloat(atMatch[2])]);
      return;
    }

    // 3. Parâmetros de URL q=lat,lng ou ll=lat,lng
    const qMatch = val.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      setPosition([parseFloat(qMatch[1]), parseFloat(qMatch[2])]);
      return;
    }
  };
  const [radius, setRadius] = useState(100);
  const [biometricTemplate, setBiometricTemplate] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  
  // HR Fields
  const [workStart, setWorkStart] = useState('');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [workEnd, setWorkEnd] = useState('');
  const [workDays, setWorkDays] = useState<number[]>([1,2,3,4,5]); // Default Seg-Sex

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

  const handleSelectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setName(emp.name);
    setCpf(emp.cpf);
    setPis(emp.pis);
    setRole(emp.role);
    setPin(emp.pin || '');
    setCompanyId(emp.company_id || '');
    setRadius(emp.allowed_radius || 100);
    setWorkStart(emp.work_start || '');
    setBreakStart(emp.break_start || '');
    setBreakEnd(emp.break_end || '');
    setWorkEnd(emp.work_end || '');
    setWorkDays(emp.work_days || []);
    setBiometricTemplate(null); // Reset before fetch
    fetchBiometric(emp.id);
    setGoogleMapsInput('');
    setAuthMethod(emp.auth_method || 'both');
    
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
      cpf,
      pis,
      role,
      pin,
      allowed_lat: position ? position[0] : null,
      allowed_lng: position ? position[1] : null,
      allowed_radius: radius,
      company_id: companyId,
      work_start: workStart || null,
      break_start: breakStart || null,
      break_end: breakEnd || null,
      work_end: workEnd || null,
      work_days: workDays,
      auth_method: authMethod
    };

    let empId = null;

    if (selectedEmployee) {
      await supabase.from('employees').update(empData).eq('id', selectedEmployee.id);
      empId = selectedEmployee.id;
    } else {
      const { data } = await supabase.from('employees').insert([empData]).select().single();
      if (data) empId = data.id;
    }
    
    // Salvar biometria se houver um template na memória
    if (empId && biometricTemplate) {
      const { data: existingBio } = await supabase.from('biometric_templates').select('user_id').eq('employee_id', empId).maybeSingle();
      if (existingBio) {
        await supabase.from('biometric_templates').update({ template: biometricTemplate }).eq('employee_id', empId);
      } else {
        await supabase.from('biometric_templates').insert([{ employee_id: empId, user_id: pis || cpf, template: biometricTemplate }]);
      }
    }
    
    alert('Funcionário salvo com sucesso!');
    setSelectedEmployee(null);
    fetchEmployees();
  };

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-text p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-industrial-border">
          <div>
            <h1 className="text-2xl font-bold text-industrial-text flex items-center gap-4">
              Gestão Corporativa
              <div className="flex bg-industrial-bg rounded-lg p-1">
                <button 
                  onClick={() => setActiveTab('employees')} 
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeTab === 'employees' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                >
                  Funcionários
                </button>
                <button 
                  onClick={() => setActiveTab('companies')} 
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${activeTab === 'companies' ? 'bg-white shadow-sm text-cyber-emerald' : 'text-industrial-muted hover:text-industrial-text'}`}
                >
                  Empresas
                </button>
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
              </div>
            </h1>
            <p className="text-sm text-industrial-muted mt-2">Gerencie acessos, locais de registro e exporte relatórios.</p>
          </div>
          <button onClick={onLogout} className="text-sm font-medium text-industrial-muted hover:text-cyber-emerald flex items-center gap-2">
            <ArrowLeft size={16} /> Voltar
          </button>
        </header>

        {activeTab === 'companies' && <AdminCompanies />}
        {activeTab === 'reports' && <AdminReports />}
        {activeTab === 'holidays' && <AdminHolidays />}
        {activeTab === 'absences' && <AdminAbsences />}
        {activeTab === 'employees' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* List */}
          <div className="bg-white rounded-2xl shadow-sm border border-industrial-border p-4 flex flex-col h-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold flex items-center gap-2"><Users size={18} className="text-cyber-emerald"/> Equipe</h2>
              <button 
                onClick={() => { setSelectedEmployee(null); setName(''); setCpf(''); setPis(''); setRole(''); setPin(''); setCompanyId(''); setPosition(null); setGoogleMapsInput(''); setBiometricTemplate(null); setWorkStart(''); setBreakStart(''); setBreakEnd(''); setWorkEnd(''); setWorkDays([1,2,3,4,5]); }}
                className="bg-cyber-emerald text-white p-2 rounded-full hover:bg-opacity-90 transition-all"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-2">
              {employees.map(emp => (
                <div 
                  key={emp.id} 
                  onClick={() => handleSelectEmployee(emp)}
                  className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedEmployee?.id === emp.id ? 'border-cyber-emerald bg-cyber-emerald/5' : 'border-industrial-border hover:bg-industrial-card-hover'}`}
                >
                  <p className="font-semibold text-sm">{emp.name}</p>
                  <p className="text-xs text-industrial-muted">{emp.role} • {emp.companies?.name || 'Sem Empresa'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Form & Map */}
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
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Senha (PIN Fallback)</label>
                <input type="text" value={pin} onChange={e => setPin(e.target.value)} placeholder="Ex: 1234" className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Raio GPS (m)</label>
                <input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Método de Autenticação</label>
                <select 
                  value={authMethod} 
                  onChange={e => setAuthMethod(e.target.value as any)} 
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald transition-colors"
                >
                  <option value="both">Biometria e Senha</option>
                  <option value="digital">Apenas Biometria</option>
                  <option value="pin">Apenas Senha/PIN</option>
                </select>
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
                  <Navigation size={16} className="text-cyber-emerald" /> Usar Geolocalização do Meu Navegador (HTML5)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPosition(null);
                    setGoogleMapsInput('');
                  }}
                  className="bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  title="Limpar Localização (Bate-ponto liberado sem validação GPS)"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="mb-6 p-4 rounded-xl border border-industrial-border bg-industrial-bg/50">
              <h3 className="font-bold text-sm mb-3">Carga Horária (Opcional)</h3>
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

            <button onClick={handleSave} className="w-full bg-cyber-emerald text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all">
              <Save size={18} /> Salvar Cadastro
            </button>
          </div>
          </div>
        )}
      </div>
    </div>
  );
};
