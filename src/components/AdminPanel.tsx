import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, Company } from '../types';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Search, Plus, Trash2, Edit2, ShieldCheck, Navigation, FileText, Users, Save, ArrowLeft, BarChart2, Fingerprint, CheckCircle2 } from 'lucide-react';
import { AdminReports } from './AdminReports';
import { AdminCompanies } from './AdminCompanies';
import { AdminHolidays } from './AdminHolidays';
import { AdminAbsences } from './AdminAbsences';
import { EmployeeReports } from './EmployeeReports';

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
  const [authMethod, setAuthMethod] = useState('both');
  const [companyId, setCompanyId] = useState('');
  const [googleMapsInput, setGoogleMapsInput] = useState('');
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState(100);
  const [biometricTemplate, setBiometricTemplate] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [espelhoEmployee, setEspelhoEmployee] = useState<Employee | null>(null);
  
  // HR Fields
  const [workStart, setWorkStart] = useState('');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [workEnd, setWorkEnd] = useState('');
  const [workDays, setWorkDays] = useState<number[]>([1,2,3,4,5]); 

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
    setRadius(emp.allowed_radius || 100);
    setWorkStart(emp.work_start || '');
    setBreakStart(emp.break_start || '');
    setBreakEnd(emp.break_end || '');
    setWorkEnd(emp.work_end || '');
    setWorkDays(emp.work_days || [1,2,3,4,5]);
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
      cpf,
      pis,
      role,
      pin,
      auth_method: authMethod,
      allowed_lat: position ? position[0] : null,
      allowed_lng: position ? position[1] : null,
      allowed_radius: radius,
      company_id: companyId,
      work_start: workStart || null,
      work_end: workEnd || null,
      work_days: workDays,
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
    if (confirm(`Tem certeza que deseja excluir o funcionário "${selectedEmployee.name}"?`)) {
      try {
        await supabase.from('biometric_templates').delete().eq('employee_id', selectedEmployee.id);
        await supabase.from('time_logs').delete().eq('employee_id', selectedEmployee.id);
        await supabase.from('employees').delete().eq('id', selectedEmployee.id);
        alert('Funcionário excluído com sucesso!');
        resetForm();
        fetchEmployees();
      } catch (err: any) {
        alert('Erro inesperado: ' + err.message);
      }
    }
  };

  return (
    <div className="min-h-screen bg-industrial-bg text-industrial-text p-6">
      <div className="max-w-6xl mx-auto space-y-6">
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
      </div>
    </div>
  );
};
