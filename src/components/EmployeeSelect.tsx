import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Employee } from '../types';
import { Users, Search, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

export const EmployeeSelect = ({ onSelectEmployee, onAdminLogin }: { onSelectEmployee: (emp: Employee) => void, onAdminLogin: () => void }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase.from('employees').select('*, companies(*)').order('name');
      if (data) {
        setEmployees(data.filter(emp => emp.role !== 'Admin'));
      }
    };
    fetchEmployees();
  }, []);

  const searchLower = search.toLowerCase();
  const filtered = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchLower) || 
    emp.role.toLowerCase().includes(searchLower) ||
    emp.companies?.name?.toLowerCase().includes(searchLower) ||
    emp.cpf.includes(search) || 
    emp.pis.includes(search)
  );

  const uniqueCompanies = Array.from(new Set(employees.map(e => e.companies?.name).filter(Boolean)));
  let headerTitle = "Ponto Digital";
  if (uniqueCompanies.length === 1) {
    headerTitle = `Ponto Digital - ${uniqueCompanies[0]}`;
  } else if (uniqueCompanies.length > 1) {
    headerTitle = uniqueCompanies.length <= 2 
      ? `Ponto Digital - ${uniqueCompanies.join(' & ')}` 
      : 'Ponto Digital - Grupo';
  }

  return (
    <div className="min-h-screen bg-industrial-bg flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-industrial-border/50"
      >
        <div className="p-8 bg-gradient-to-br from-corporate-blue to-cyber-emerald text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <ShieldCheck size={80} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-display relative z-10">{headerTitle}</h1>
          <p className="opacity-90 mt-2 text-sm relative z-10">Selecione seu perfil para registrar o ponto</p>
        </div>

        <div className="p-6">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3 text-industrial-muted" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nome, cargo, empresa ou CPF..." 
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
                    <p className="text-xs text-industrial-muted mt-1 font-medium">{emp.role} • {emp.companies?.name || 'Sem Empresa'}</p>
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
