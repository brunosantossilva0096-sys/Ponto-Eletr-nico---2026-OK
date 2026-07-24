import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee, Company } from '../types';
import { Users, Search, ArrowRight, ShieldCheck, Building2, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

export const EmployeeSelect = ({ onSelectEmployee, onAdminLogin }: { onSelectEmployee: (emp: Employee) => void, onAdminLogin: () => void }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      // Carrega cache local primeiro
      const cachedEmp = localStorage.getItem('offline_employees');
      if (cachedEmp) setEmployees(JSON.parse(cachedEmp));
      
      const cachedComp = localStorage.getItem('offline_companies');
      if (cachedComp) setCompanies(JSON.parse(cachedComp));

      if (!navigator.onLine) return;

      try {
        const { data: empData } = await supabase.from('employees').select('*, companies(*)').order('name');
        if (empData) {
          const validEmp = empData.filter(emp => emp.role !== 'Admin');
          setEmployees(validEmp);
          localStorage.setItem('offline_employees', JSON.stringify(validEmp));
        }
        const { data: compData } = await supabase.from('companies').select('*').order('name');
        if (compData) {
          setCompanies(compData);
          localStorage.setItem('offline_companies', JSON.stringify(compData));
        }
        
        // Faz cache das biometrias para o modo offline
        const { data: bioData } = await supabase.from('biometric_templates').select('employee_id, template');
        if (bioData) {
          localStorage.setItem('offline_templates', JSON.stringify(bioData));
        }
      } catch (err) {
        console.warn('Falha na sincronização de dados (Offline?)', err);
      }
    };
    fetchData();
  }, []);

  const searchLower = search.toLowerCase();
  
  // Filtrar funcionários pela empresa selecionada e termo de busca
  const filtered = employees
    .filter(emp => selectedCompany ? emp.company_id === selectedCompany.id : true)
    .filter(emp => 
      emp.name.toLowerCase().includes(searchLower) || 
      emp.role.toLowerCase().includes(searchLower) ||
      emp.cpf.includes(search) || 
      emp.pis.includes(search)
    );

  // Tela Inicial: Seleção de Empresa
  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-industrial-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-industrial-border/50"
        >
          <div className="p-8 bg-gradient-to-br from-corporate-blue to-cyber-emerald text-white text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <Building2 size={80} />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-display relative z-10">Ponto Eletrônico Digital</h1>
            <p className="opacity-90 mt-2 text-sm relative z-10">Selecione a Empresa para bater o ponto</p>
          </div>

          <div className="p-6 space-y-3 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
            {companies.map(comp => (
              <button
                key={comp.id}
                onClick={() => setSelectedCompany(comp)}
                className="w-full flex items-center justify-between p-4 bg-white border border-industrial-border rounded-2xl hover:border-cyber-emerald hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-full bg-industrial-bg flex items-center justify-center text-industrial-muted group-hover:bg-cyber-emerald/10 group-hover:text-cyber-emerald transition-colors">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-industrial-text group-hover:text-cyber-emerald transition-colors">{comp.name}</p>
                    <p className="text-xs text-industrial-muted mt-1 font-medium">CNPJ: {comp.cnpj}</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-industrial-muted group-hover:text-cyber-emerald transition-transform group-hover:translate-x-1" />
              </button>
            ))}

            {companies.length === 0 && (
              <p className="text-center text-industrial-muted py-4">Nenhuma empresa cadastrada.</p>
            )}
          </div>
          
          <div className="bg-industrial-bg p-4 text-center border-t border-industrial-border/50">
            <button onClick={onAdminLogin} className="text-xs font-semibold text-industrial-muted hover:text-industrial-text transition-colors">
              Acesso Administrativo
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Tela Secundária: Seleção de Funcionário da Empresa Escolhida
  return (
    <div className="min-h-screen bg-industrial-bg flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-industrial-border/50"
      >
        <div className="p-8 bg-gradient-to-br from-corporate-blue to-cyber-emerald text-white text-center relative overflow-hidden">
          <button 
            onClick={() => { setSelectedCompany(null); setSearch(''); }} 
            className="absolute left-4 top-4 text-white/80 hover:text-white transition-colors z-20 flex items-center gap-1 text-xs font-medium"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <ShieldCheck size={80} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-display relative z-10">{selectedCompany.name}</h1>
          <p className="opacity-90 mt-2 text-sm relative z-10">Selecione seu perfil para registrar o ponto</p>
        </div>

        <div className="p-6">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3 text-industrial-muted" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nome, cargo ou CPF..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-industrial-bg border border-industrial-border rounded-xl focus:outline-none focus:border-cyber-emerald transition-all"
            />
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {filtered.map(emp => (
              <button
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className="w-full flex items-center justify-between p-4 bg-white border border-industrial-border rounded-2xl hover:border-cyber-emerald hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-industrial-bg flex items-center justify-center text-industrial-muted group-hover:bg-cyber-emerald/10 group-hover:text-cyber-emerald transition-colors">
                    <Users size={18} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-industrial-text group-hover:text-cyber-emerald transition-colors">{emp.name}</p>
                    <p className="text-xs text-industrial-muted mt-1 font-medium">{emp.role}</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-industrial-muted group-hover:text-cyber-emerald transition-transform group-hover:translate-x-1" />
              </button>
            ))}
            
            {filtered.length === 0 && (
              <p className="text-center text-industrial-muted py-4">Nenhum funcionário encontrado.</p>
            )}
          </div>
        </div>
        
        <div className="bg-industrial-bg p-4 text-center border-t border-industrial-border/50">
          <button onClick={onAdminLogin} className="text-xs font-semibold text-industrial-muted hover:text-industrial-text transition-colors">
            Acesso Administrativo
          </button>
        </div>
      </motion.div>
    </div>
  );
};
