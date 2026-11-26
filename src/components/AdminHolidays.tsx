import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Holiday } from '../types';
import { Save, CalendarDays, Sparkles } from 'lucide-react';
import { formatDateBr, getBrazilianNationalHolidays } from '../utils/dateUtils';

export const AdminHolidays = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('Nacional');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importYear, setImportYear] = useState<number>(new Date().getFullYear());
  const [isImporting, setIsImporting] = useState(false);

  const fetchHolidays = async () => {
    const { data } = await supabase.from('holidays').select('*').order('date', { ascending: true });
    if (data) setHolidays(data);
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) return;

    if (editingId) {
      const { error } = await supabase
        .from('holidays')
        .update({ date, name: name.trim(), type })
        .eq('id', editingId);
      if (error) {
        alert('Erro ao atualizar feriado: ' + error.message);
        return;
      }
    } else {
      const existing = holidays.find((h) => h.date === date);
      if (existing) {
        alert(`Já existe um feriado cadastrado em ${formatDateBr(date)} (${existing.name}).`);
        return;
      }
      const { error } = await supabase
        .from('holidays')
        .insert([{ date, name: name.trim(), type }]);
      if (error) {
        alert('Erro ao salvar feriado: ' + error.message);
        return;
      }
    }

    setDate('');
    setName('');
    setType('Nacional');
    setEditingId(null);
    fetchHolidays();
  };

  const handleImportNationalHolidays = async () => {
    const list = getBrazilianNationalHolidays(importYear);
    const existingDates = new Set(holidays.map((h) => h.date));
    const missing = list.filter((item) => !existingDates.has(item.date));

    if (missing.length === 0) {
      alert(`Todos os feriados nacionais de ${importYear} já estão cadastrados!`);
      return;
    }

    if (
      !confirm(
        `Deseja importar automaticamente ${missing.length} feriado(s) nacional(is) de ${importYear} (incluindo Carnaval, Sexta-feira Santa e Corpus Christi)?`
      )
    ) {
      return;
    }

    setIsImporting(true);
    const { error } = await supabase.from('holidays').insert(missing);
    setIsImporting(false);

    if (error) {
      alert('Erro ao importar feriados: ' + error.message);
    } else {
      alert(`${missing.length} feriados de ${importYear} importados com sucesso!`);
      fetchHolidays();
    }
  };

  const handleEdit = (h: Holiday) => {
    setEditingId(h.id);
    setDate(h.date);
    setName(h.name);
    setType(h.type);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja realmente excluir este feriado?')) {
      const { error } = await supabase.from('holidays').delete().eq('id', id);
      if (error) {
        alert('Erro ao excluir feriado: ' + error.message);
      } else {
        fetchHolidays();
      }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 space-y-6">
        <div>
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <CalendarDays size={18} className="text-cyber-emerald" />
            {editingId ? 'Editar Feriado' : 'Novo Feriado / Ponto Facultativo'}
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">Data</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">Nome</label>
              <input
                type="text"
                required
                placeholder="Ex: Natal, Aniversário da Cidade"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-industrial-muted mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 focus:border-cyber-emerald outline-none"
              >
                <option value="Nacional">Nacional</option>
                <option value="Estadual">Estadual</option>
                <option value="Municipal">Municipal</option>
                <option value="Facultativo">Ponto Facultativo / Recesso</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-cyber-emerald text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-opacity-90"
              >
                <Save size={16} /> Salvar
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setDate('');
                    setName('');
                    setType('Nacional');
                  }}
                  className="px-4 bg-industrial-bg text-industrial-muted rounded-lg font-semibold hover:bg-industrial-border"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Importador Automático de Feriados Nacionais */}
        <div className="pt-5 border-t border-industrial-border space-y-3">
          <h3 className="font-bold text-xs text-industrial-text flex items-center gap-1.5">
            <Sparkles size={15} className="text-cyber-emerald" />
            Importar Calendário Nacional (Fixos + Móveis)
          </h3>
          <div className="flex gap-2">
            <input
              type="number"
              min={2020}
              max={2050}
              value={importYear}
              onChange={(e) => setImportYear(Number(e.target.value) || 2026)}
              className="w-24 px-3 py-2 rounded-lg border border-industrial-border bg-industrial-bg text-sm font-bold outline-none focus:border-cyber-emerald"
            />
            <button
              type="button"
              onClick={handleImportNationalHolidays}
              disabled={isImporting}
              className="flex-1 bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isImporting ? 'Importando...' : `Importar Feriados ${importYear}`}
            </button>
          </div>
        </div>
      </div>

      <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] flex flex-col">
        <h2 className="font-bold text-lg mb-4">Lista de Feriados ({holidays.length})</h2>
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
              {holidays.map((h) => (
                <tr key={h.id} className="hover:bg-industrial-bg/50">
                  <td className="p-3 font-semibold">{formatDateBr(h.date)}</td>
                  <td className="p-3">{h.name}</td>
                  <td className="p-3">
                    <span className="bg-industrial-border text-industrial-text px-2 py-1 rounded-md text-xs font-medium">
                      {h.type}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleEdit(h)}
                      className="text-corporate-blue hover:underline mr-3 text-xs font-semibold"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(h.id)}
                      className="text-red-500 hover:underline text-xs font-semibold"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {holidays.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-industrial-muted">
                    Nenhum feriado cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
