import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { TimeLog, Employee } from '../types';
import { Download, FileText, ArrowLeft, Clock } from 'lucide-react';
import { jsPDF } from 'jspdf';

export const EmployeeReports = ({ employee, onBack }: { employee: Employee, onBack: () => void }) => {
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
    doc.text('Método', 70, y);
    doc.text('Distância GPS', 120, y);
    doc.text('Assinatura Digital (Hash)', 150, y);
    
    doc.line(14, y + 2, 196, y + 2);
    y += 8;
    
    doc.setFont('Helvetica', 'normal');
    filtered.forEach((log) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
        doc.setFont('Helvetica', 'bold');
        doc.text('Data/Hora', 14, y);
        doc.text('Método', 70, y);
        doc.text('Distância GPS', 120, y);
        doc.text('Assinatura Digital (Hash)', 150, y);
        doc.line(14, y + 2, 196, y + 2);
        y += 8;
        doc.setFont('Helvetica', 'normal');
      }
      
      const dateVal = new Date(log.timestamp);
      const dateTimeStr = `${dateVal.toLocaleDateString('pt-BR')} ${dateVal.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
      const methodStr = log.verification_method || '';
      const gpsStr = log.distance ? `${Math.round(log.distance)}m` : 'Sem GPS';
      const hashStr = log.hash_assinatura ? log.hash_assinatura.substring(0, 12) + '...' : '-';
      
      doc.text(dateTimeStr, 14, y);
      doc.text(methodStr.substring(0, 20), 70, y);
      doc.text(gpsStr, 120, y);
      doc.text(hashStr, 150, y);
      
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
                <th className="p-3 font-semibold">Método</th>
                <th className="p-3 font-semibold">Localização GPS</th>
                <th className="p-3 font-semibold">Hash de Assinatura</th>
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
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-industrial-muted">Nenhum registro encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
