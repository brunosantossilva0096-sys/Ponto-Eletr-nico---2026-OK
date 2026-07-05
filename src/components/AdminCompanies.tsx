import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Company } from '../types';
import { Building2, Save, Plus } from 'lucide-react';

export const AdminCompanies = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');

  const fetchCompanies = async () => {
    const { data } = await supabase.from('companies').select('*').order('name');
    if (data) setCompanies(data);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleSelect = (comp: Company) => {
    setSelectedCompany(comp);
    setName(comp.name);
    setCnpj(comp.cnpj);
  };

  const handleSave = async () => {
    if (!name || !cnpj) {
      alert('Preencha Razão Social e CNPJ.');
      return;
    }

    const compData = { name, cnpj };

    if (selectedCompany) {
      await supabase.from('companies').update(compData).eq('id', selectedCompany.id);
    } else {
      await supabase.from('companies').insert([compData]);
    }
    
    alert('Empresa salva com sucesso!');
    setSelectedCompany(null);
    setName('');
    setCnpj('');
    fetchCompanies();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Lista de Empresas */}
      <div className="bg-white rounded-2xl shadow-sm border border-industrial-border p-4 flex flex-col h-[600px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold flex items-center gap-2"><Building2 size={18} className="text-cyber-emerald"/> Empresas</h2>
          <button 
            onClick={() => { setSelectedCompany(null); setName(''); setCnpj(''); }}
            className="bg-cyber-emerald text-white p-2 rounded-full hover:bg-opacity-90 transition-all"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {companies.map(comp => (
            <div 
              key={comp.id} 
              onClick={() => handleSelect(comp)}
              className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedCompany?.id === comp.id ? 'border-cyber-emerald bg-cyber-emerald/5' : 'border-industrial-border hover:bg-industrial-card-hover'}`}
            >
              <p className="font-semibold text-sm">{comp.name}</p>
              <p className="text-xs text-industrial-muted">CNPJ: {comp.cnpj}</p>
            </div>
          ))}
          {companies.length === 0 && (
            <p className="text-sm text-industrial-muted text-center mt-4">Nenhuma empresa cadastrada.</p>
          )}
        </div>
      </div>

      {/* Formulário de Empresa */}
      <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] flex flex-col">
        <h2 className="font-bold text-lg mb-6">{selectedCompany ? 'Editar Empresa' : 'Nova Empresa'}</h2>
        
        <div className="space-y-4 flex-1">
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Razão Social / Nome Fantasia</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-3 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" 
              placeholder="Ex: Tech Solutions LTDA"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">CNPJ (Apenas Números)</label>
            <input 
              type="text" 
              value={cnpj} 
              onChange={e => setCnpj(e.target.value)} 
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-3 text-sm focus:outline-none focus:border-cyber-emerald transition-colors" 
              placeholder="Ex: 00000000000100"
            />
          </div>
        </div>

        <button onClick={handleSave} className="w-full bg-cyber-emerald text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all mt-4">
          <Save size={18} /> Salvar Empresa
        </button>
      </div>
    </div>
  );
};
