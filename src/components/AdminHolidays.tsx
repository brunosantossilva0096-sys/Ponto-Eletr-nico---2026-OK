import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Holiday } from '../types';
import { Save, CalendarDays, Plus, Trash2 } from 'lucide-react';

export const AdminHolidays = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('Nacional');
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchHolidays = async () => {
    const { data } = await supabase.from('holidays').select('*').order('date', { ascending: true });
    if (data) setHolidays(data);
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name) return;

    if (editingId) {
      await supabase.from('holidays').update({ date, name, type }).eq('id', editingId);
    } else {
      await supabase.from('holidays').insert([{ date, name, type }]);
    }
    
    setDate('');
    setName('');
    setType('Nacional');
    setEditingId(null);
    fetchHolidays();
  };

  const handleEdit = (h: Holiday) => {
    setEditingId(h.id);
    setDate(h.date);
    setName(h.name);
    setType(h.type);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja realmente excluir este feriado?')) {
      await supabase.from('holidays').delete().eq('id', id);
      fetchHolidays();
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-industrial-border p-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <CalendarDays size={18} className="text-cyber-emerald"/> 
          {editingId ? 'Editar Feriado' : 'Novo Feriado'}
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Data</label>
            <input 
              type="date" 
              required
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Nome</label>
            <input 
              type="text" 
              required
              placeholder="Ex: Natal"
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Tipo</label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value)} 
              className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none"
            >
              <option value="Nacional">Nacional</option>
              <option value="Estadual">Estadual</option>
              <option value="Municipal">Municipal</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-cyber-emerald text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-opacity-90">
              <Save size={16} /> Salvar
            </button>
            {editingId && (
              <button 
                type="button"
                onClick={() => { setEditingId(null); setDate(''); setName(''); setType('Nacional'); }}
                className="px-4 bg-industrial-bg text-industrial-muted rounded-lg font-semibold hover:bg-industrial-border"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] flex flex-col">
        <h2 className="font-bold text-lg mb-4">Lista de Feriados</h2>
        <div className="flex-1 overflow-auto border border-industrial-border rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-industrial-bg text-industrial-muted sticky top-0">
              <tr>
                <th className="p-3 font-semibold">Data</th>
                <th className="p-3 font-semibold">Nome</th>
                <th className="p-3 font-semibold">Tipo</th>
                <th className="p-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border">
              {holidays.map(h => (
                <tr key={h.id} className="hover:bg-industrial-bg/50">
                  <td className="p-3 font-semibold">{new Date(h.date + 'T12:00:00Z').toLocaleDateString('pt-BR')}</td>
                  <td className="p-3">{h.name}</td>
                  <td className="p-3">
                    <span className="bg-industrial-border text-industrial-text px-2 py-1 rounded-md text-xs font-medium">
                      {h.type}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => handleEdit(h)} className="text-corporate-blue hover:underline mr-3 text-xs font-semibold">Editar</button>
                    <button onClick={() => handleDelete(h.id)} className="text-red-500 hover:underline text-xs font-semibold">Excluir</button>
                  </td>
                </tr>
              ))}
              {holidays.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-industrial-muted">Nenhum feriado cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
