import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { TimeLog, Employee } from '../types';
import { Download, FileText, ArrowLeft, Clock, Edit2, Trash2, X } from 'lucide-react';
import { jsPDF } from 'jspdf';

export const EmployeeReports = ({ employee, onBack, isAdmin = false }: { employee: Employee, onBack: () => void, isAdmin?: boolean }) => {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('time_logs')
      .select('*')
      .eq('employee_id', employee.id)
      .order('timestamp', { ascending: false });
    
    if (data) setLogs(data);
  };

  useEffect(() => {
    fetchLogs();
  }, [employee.id]);

  const filtered = logs.filter(l => {
    const logDate = l.timestamp.split('T')[0];
    if (startDate && logDate < startDate) return false;
    if (endDate && logDate > endDate) return false;
    return true;
  });

  const [editingLog, setEditingLog] = useState<TimeLog | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editReason, setEditReason] = useState('');

  const handleDelete = async (id: string) => {
    if (confirm('Atenção: Você está prestes a excluir um registro de ponto. Esta ação é irreversível. Deseja continuar?')) {
      await supabase.from('time_logs').delete().eq('id', id);
      fetchLogs();
    }
  };

  const openEdit = (log: TimeLog) => {
    setEditingLog(log);
    const d = new Date(log.timestamp);
    setEditDate(d.toISOString().split('T')[0]);
    setEditTime(d.toTimeString().split(' ')[0].substring(0, 5));
    setEditReason(log.edit_reason || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog || !editDate || !editTime || !editReason) {
      alert('Preencha todos os campos, incluindo o motivo da alteração.');
      return;
    }

    const newTimestamp = new Date(`${editDate}T${editTime}:00`).toISOString();

    await supabase.from('time_logs').update({
      timestamp: newTimestamp,
      is_edited: true,
      original_timestamp: editingLog.original_timestamp || editingLog.timestamp,
      edit_reason: editReason
    }).eq('id', editingLog.id);

    setEditingLog(null);
    fetchLogs();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Espelho de Ponto Individual', 14, 20);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Funcionário: ${employee.name}`, 14, 27);
    doc.text(`CPF: ${employee.cpf}`, 14, 32);
    if (employee.companies?.name) {
      doc.text(`Empresa: ${employee.companies.name}`, 14, 37);
    }
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 42);
    
    if (startDate || endDate) {
      doc.text(`Período: ${startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} até ${endDate ? new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Fim'}`, 14, 47);
    }
    
    doc.line(14, 50, 196, 50);
    
    let y = 58;
    
    doc.setFont('Helvetica', 'bold');
    doc.text('Data/Hora', 14, y);
    doc.text('Tipo', 55, y);
    doc.text('Método', 90, y);
    doc.text('Distância GPS', 130, y);
    doc.text('Hash', 165, y);
    
    doc.line(14, y + 2, 196, y + 2);
    y += 8;
    
    doc.setFont('Helvetica', 'normal');
    filtered.forEach((log) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
        doc.setFont('Helvetica', 'bold');
        doc.text('Data/Hora', 14, y);
        doc.text('Tipo', 55, y);
        doc.text('Método', 90, y);
        doc.text('Distância GPS', 130, y);
        doc.text('Hash', 165, y);
        doc.line(14, y + 2, 196, y + 2);
        y += 8;
        doc.setFont('Helvetica', 'normal');
      }
      
      const dateVal = new Date(log.timestamp);
      const dateTimeStr = `${dateVal.toLocaleDateString('pt-BR')} ${dateVal.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
      const typeStr = log.type || 'Batida';
      const methodStr = log.verification_method || '';
      const gpsStr = log.distance ? `${Math.round(log.distance)}m` : 'Sem GPS';
      const hashStr = log.hash_assinatura ? log.hash_assinatura.substring(0, 12) + '...' : '-';
      
      doc.text(dateTimeStr, 14, y);
      doc.text(typeStr.substring(0, 18), 55, y);
      doc.text(methodStr.substring(0, 16), 90, y);
      doc.text(gpsStr, 130, y);
      doc.text(hashStr, 165, y);
      
      y += 6;
    });
    
    doc.save(`espelho_ponto_${employee.name}_${Date.now()}.pdf`);
  };

  return (
    <div className="min-h-screen bg-industrial-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl overflow-hidden border border-industrial-border flex flex-col h-[650px] p-6 relative animate-fade-in">
        
        <div className="flex justify-between items-center mb-6">
          <button onClick={onBack} className="text-industrial-muted hover:text-industrial-text flex items-center gap-2 text-sm font-semibold">
            <ArrowLeft size={16} /> Voltar
          </button>
          
          <h2 className="font-bold text-lg flex items-center gap-2"><Clock size={18} className="text-cyber-emerald"/> Meu Espelho de Ponto</h2>
          
          <button onClick={handleExportPDF} className="bg-industrial-text text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-opacity-90 transition-all">
            <FileText size={16} /> Exportar PDF
          </button>
        </div>

        <div className="bg-industrial-bg/50 p-4 rounded-2xl border border-industrial-border mb-4 text-sm text-industrial-text">
          <p><strong>Nome:</strong> {employee.name}</p>
          <p><strong>CPF:</strong> {employee.cpf}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Inicial</label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-industrial-bg border border-industrial-border rounded-lg text-sm focus:border-cyber-emerald focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Final</label>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-industrial-bg border border-industrial-border rounded-lg text-sm focus:border-cyber-emerald focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto border border-industrial-border rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-industrial-bg text-industrial-muted sticky top-0">
              <tr>
                <th className="p-3 font-semibold">Data/Hora</th>
                <th className="p-3 font-semibold">Tipo</th>
                <th className="p-3 font-semibold">Método</th>
                <th className="p-3 font-semibold">Localização GPS</th>
                <th className="p-3 font-semibold">Hash de Assinatura</th>
                {isAdmin && <th className="p-3 font-semibold text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border">
              {filtered.map(log => (
                <tr key={log.id} className={`hover:bg-industrial-bg/50 ${log.is_edited ? 'bg-orange-50/50' : ''}`}>
                  <td className="p-3">
                    <span className="font-semibold block">{new Date(log.timestamp).toLocaleDateString('pt-BR')}</span>
                    <span className="text-industrial-muted text-xs">{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                    {log.is_edited && <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wider block mt-1">Editado</span>}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                      log.type === 'Entrada Manhã' ? 'bg-cyber-emerald/10 text-cyber-emerald' :
                      log.type === 'Saída Almoço' ? 'bg-orange-50 text-orange-500' :
                      log.type === 'Entrada Tarde' ? 'bg-blue-50 text-corporate-blue' :
                      log.type === 'Saída Tarde' ? 'bg-purple-50 text-purple-600' :
                      'bg-industrial-bg text-industrial-muted'
                    }`}>
                      {log.type || 'Batida'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="bg-cyber-emerald/10 text-cyber-emerald px-2 py-1 rounded-md text-xs font-semibold">
                      {log.verification_method}
                    </span>
                  </td>
                  <td className="p-3">
                    {log.distance ? <span className="text-xs text-industrial-muted block">GPS: {Math.round(log.distance)}m</span> : <span className="text-xs text-industrial-muted block">Sem GPS</span>}
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-[10px] text-industrial-muted block truncate max-w-[200px]" title={log.hash_assinatura}>
                      {log.hash_assinatura}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(log)} className="p-1.5 text-industrial-muted hover:text-corporate-blue bg-white border border-industrial-border rounded-lg transition-colors" title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(log.id)} className="p-1.5 text-industrial-muted hover:text-red-500 bg-white border border-industrial-border rounded-lg transition-colors" title="Excluir">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="p-8 text-center text-industrial-muted">Nenhum registro encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal (Admin Only) */}
      {isAdmin && editingLog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setEditingLog(null)} className="absolute top-4 right-4 text-industrial-muted hover:text-industrial-text transition-colors">
              <X size={20} />
            </button>
            <h3 className="font-bold text-xl mb-4 flex items-center gap-2"><Edit2 size={20} className="text-corporate-blue" /> Editar Batida</h3>
            
            <div className="bg-orange-50 text-orange-800 p-3 rounded-lg text-sm mb-4 border border-orange-200">
              <span className="font-bold block">Atenção RH:</span>
              A alteração de registros de ponto deve ser comunicada ao funcionário e justificada legalmente. O sistema manterá um histórico de auditoria dessa edição.
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Data Correta</label>
                <input 
                  type="date" 
                  required
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2.5 focus:border-corporate-blue focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Horário Correto</label>
                <input 
                  type="time" 
                  required
                  value={editTime}
                  onChange={e => setEditTime(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2.5 focus:border-corporate-blue focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Motivo / Justificativa da Edição (Visível para Auditoria)</label>
                <textarea 
                  required
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  placeholder="Ex: Funcionário esqueceu de bater o ponto na saída."
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2.5 focus:border-corporate-blue focus:outline-none resize-none h-24 text-sm" 
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingLog(null)} className="flex-1 px-4 py-2.5 border border-industrial-border rounded-xl text-industrial-text font-semibold hover:bg-industrial-bg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-corporate-blue text-white rounded-xl font-bold hover:bg-opacity-90 transition-colors shadow-lg shadow-corporate-blue/20">
                  Salvar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
