import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { TimeLog, Employee, AdminUser } from '../types';
import { Download, Search, Clock, Pencil, Trash2, X, AlertTriangle, FileText, Plus } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { generateAbsences } from '../utils/faltas';
import { Holiday, Absence } from '../types';
export const AdminReports = ({ loggedAdmin }: { loggedAdmin: AdminUser }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Edit State
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editType, setEditType] = useState('Entrada Manhã');
  const [editReason, setEditReason] = useState('');
  const [editHideTag, setEditHideTag] = useState(false);

  // Add Manual State
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [addEmployeeId, setAddEmployeeId] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addTime, setAddTime] = useState('');
  const [addType, setAddType] = useState('Entrada Manhã');
  const [addReason, setAddReason] = useState('');
  const [addHideTag, setAddHideTag] = useState(false);

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('time_logs')
      .select('*, employees(*, companies(*))')
      .order('timestamp', { ascending: false });
    
    if (data) setLogs(data as any);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('*, companies(*)').order('name');
    if (data) setAllEmployees(data);
  };

  const fetchAuxData = async () => {
    const { data: hData } = await supabase.from('holidays').select('*');
    if (hData) setHolidays(hData);
    
    const { data: aData } = await supabase.from('absences').select('*, employees(*)');
    if (aData) setAbsences(aData);
  };

  useEffect(() => {
    fetchLogs();
    fetchEmployees();
    fetchAuxData();
  }, []);

  const searchedEmployees = allEmployees.filter(emp => {
    if (!search) return true;
    return emp.name.toLowerCase().includes(search.toLowerCase()) || 
           emp.cpf.includes(search) ||
           emp.companies?.name?.toLowerCase().includes(search.toLowerCase());
  });

  const baseFilteredLogs = logs.filter(l => {
    const matchesSearch = 
      l.employees?.name?.toLowerCase().includes(search.toLowerCase()) || 
      l.employees?.cpf?.includes(search) ||
      l.employees?.companies?.name?.toLowerCase().includes(search.toLowerCase());

    const logDate = l.timestamp.split('T')[0];
    const matchesDate = (!startDate || logDate >= startDate) && (!endDate || logDate <= endDate);

    return matchesSearch && matchesDate;
  });

  const generatedAbsences = generateAbsences(logs, searchedEmployees, startDate, endDate, holidays, absences);
  
  const filtered = [...baseFilteredLogs, ...generatedAbsences].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const handleExportCSV = () => {
    let csv = 'Data,Hora,Tipo,Funcionario,Empresa,CPF,Metodo,Distancia(m),Lat,Lng,Hash,Editado/Manual,MotivoEdicao\n';
    filtered.forEach(log => {
      const d = new Date(log.timestamp);
      const dateStr = d.toLocaleDateString('pt-BR');
      const timeStr = d.toLocaleTimeString('pt-BR');
      csv += `${dateStr},${timeStr},${log.type || 'Batida'},${log.employees.name},${log.employees.companies?.name || 'Sem Empresa'},${log.employees.cpf},${log.verification_method},${log.distance ? Math.round(log.distance) : ''},${log.latitude || ''},${log.longitude || ''},${log.hash_assinatura},${log.is_manual ? 'Manual' : log.is_edited ? 'Sim' : 'Não'},${log.edit_reason || ''}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_ponto_${Date.now()}.csv`;
    a.click();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Relatório - Ponto Eletrônico Digital', 14, 20);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    const uniqueCompanies = Array.from(new Set(filtered.map(l => l.employees?.companies?.id).filter(Boolean)));
    const companiesData = uniqueCompanies.map(id => filtered.find(l => l.employees?.companies?.id === id)?.employees?.companies);

    let currentY = 27;
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, currentY);
    
    if (companiesData.length === 1 && companiesData[0]) {
      currentY += 5;
      doc.text(`Empresa: ${companiesData[0].name}`, 14, currentY);
      if (companiesData[0].cnpj) {
        currentY += 5;
        doc.text(`CNPJ: ${companiesData[0].cnpj}`, 14, currentY);
      }
    }
    
    if (startDate || endDate) {
      currentY += 5;
      doc.text(`Período: ${startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} até ${endDate ? new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Fim'}`, 14, currentY);
    }
    
    currentY += 3;
    doc.line(14, currentY, 196, currentY);
    
    let y = currentY + 8;
    
    doc.setFont('Helvetica', 'bold');
    doc.text('Data/Hora', 14, y);
    doc.text('Tipo', 50, y);
    doc.text('Funcionário', 85, y);
    doc.text('Empresa', 130, y);
    doc.text('Método', 165, y);
    doc.text('GPS', 190, y);
    
    doc.line(14, y + 2, 196, y + 2);
    y += 8;
    
    doc.setFont('Helvetica', 'normal');
    filtered.forEach((log) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
        doc.setFont('Helvetica', 'bold');
        doc.text('Data/Hora', 14, y);
        doc.text('Tipo', 50, y);
        doc.text('Funcionário', 85, y);
        doc.text('Empresa', 130, y);
        doc.text('Método', 165, y);
        doc.text('GPS', 190, y);
        doc.line(14, y + 2, 196, y + 2);
        y += 8;
        doc.setFont('Helvetica', 'normal');
      }
      
      const dateVal = new Date(log.timestamp);
      const dateTimeStr = (log.isFalta || log.type?.startsWith('Falta'))
        ? dateVal.toLocaleDateString('pt-BR') 
        : `${dateVal.toLocaleDateString('pt-BR')} ${dateVal.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
      const typeStr = log.type || 'Batida';
      const nameStr = log.employees?.name || '';
      const compStr = log.employees?.companies?.name || '';
      const methodStr = log.verification_method || '';
      const gpsStr = log.distance ? `${Math.round(log.distance)}m` : '-';
      
      doc.text(dateTimeStr, 14, y);
      doc.text(typeStr.substring(0, 16), 50, y);
      doc.text(nameStr.substring(0, 20), 85, y);
      doc.text(compStr.substring(0, 18), 130, y);
      doc.text(methodStr.substring(0, 12), 165, y);
      doc.text(gpsStr, 190, y);
      
      y += 6;
    });
    
    doc.save(`relatorio_pontos_${Date.now()}.pdf`);
  };

  const handleDelete = async (id: string) => {
    if (loggedAdmin.role === 'convencional') return;
    if (confirm('Atenção: Você está prestes a excluir um registro de ponto. Esta ação é irreversível. Deseja continuar?')) {
      await supabase.from('time_logs').delete().eq('id', id);
      fetchLogs();
    }
  };

  const openEdit = (log: TimeLog) => {
    if (loggedAdmin.role === 'convencional') return;
    setEditingLog(log);
    const d = new Date(log.timestamp);
    setEditDate(d.toISOString().split('T')[0]);
    setEditTime(d.toTimeString().split(' ')[0].substring(0, 5));
    setEditType(log.type || 'Entrada Manhã');
    setEditReason(log.edit_reason || '');
    setEditHideTag(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog || !editDate || !editTime || !editReason) {
      alert('Preencha todos os campos, incluindo o motivo da alteração.');
      return;
    }

    const newTimestamp = new Date(`${editDate}T${editTime}:00`).toISOString();
    const shouldHide = loggedAdmin.role === 'total' && editHideTag;

    await supabase.from('time_logs').update({
      timestamp: newTimestamp,
      type: editType,
      is_edited: !shouldHide,
      original_timestamp: editingLog.original_timestamp || editingLog.timestamp,
      edit_reason: editReason
    }).eq('id', editingLog.id);

    setEditingLog(null);
    setEditingLog(null);
    fetchLogs();
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmployeeId || !addDate || !addTime || !addReason) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    const newTimestamp = new Date(`${addDate}T${addTime}:00`).toISOString();
    const hashStr = "MANUAL-" + Date.now().toString(16);
    const shouldHide = loggedAdmin.role === 'total' && addHideTag;

    const emp = allEmployees.find(e => e.id === addEmployeeId);

    const log = {
      id: crypto.randomUUID(),
      employee_id: addEmployeeId,
      timestamp: newTimestamp,
      type: addType,
      verification_method: shouldHide ? 'Sistema' : 'Manual (Admin)',
      hash_assinatura: hashStr,
      is_edited: !shouldHide,
      is_manual: !shouldHide,
      original_timestamp: newTimestamp,
      edit_reason: 'Inserção Manual: ' + addReason,
      distance: null,
      latitude: null,
      longitude: null,
      pis_pasep_trabalhador: emp?.pis || '',
      cpf_trabalhador: emp?.cpf || ''
    };

    const { error } = await supabase.from('time_logs').insert([log]);
    
    if (error) {
      alert('Erro ao salvar no servidor. Verifique sua conexão: ' + error.message);
      console.error('Erro na inserção manual:', error);
    } else {
      setIsAddingManual(false);
      setAddDate('');
      setAddTime('');
      setAddReason('');
      setAddEmployeeId('');
      fetchLogs();
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] flex flex-col relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-lg flex items-center gap-2"><Clock size={18} className="text-cyber-emerald"/> Relatório de Batidas</h2>
        <div className="flex gap-2">
          {loggedAdmin.role !== 'convencional' && (
            <button onClick={() => setIsAddingManual(true)} className="bg-cyber-emerald text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-opacity-90 transition-all mr-2">
              <Plus size={16} /> Inserir Batida
            </button>
          )}
          <button onClick={handleExportCSV} className="bg-white border border-industrial-border text-industrial-text px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-industrial-bg transition-colors">
            <Download size={16} /> Exportar CSV
          </button>
          <button onClick={handleExportPDF} className="bg-industrial-text text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-opacity-90 transition-all">
            <FileText size={16} /> Exportar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-industrial-muted" size={16} />
          <input 
            type="text" 
            placeholder="Buscar funcionário, CPF..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-industrial-bg border border-industrial-border rounded-lg text-sm focus:border-cyber-emerald focus:outline-none"
          />
        </div>
        <div>
          <input 
            type="date" 
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 bg-industrial-bg border border-industrial-border rounded-lg text-sm focus:border-cyber-emerald focus:outline-none"
            title="Data Inicial"
          />
        </div>
        <div>
          <input 
            type="date" 
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2 bg-industrial-bg border border-industrial-border rounded-lg text-sm focus:border-cyber-emerald focus:outline-none"
            title="Data Final"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-industrial-border rounded-xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-industrial-bg text-industrial-muted sticky top-0">
            <tr>
              <th className="p-3 font-semibold">Data/Hora</th>
              <th className="p-3 font-semibold">Tipo</th>
              <th className="p-3 font-semibold">Funcionário</th>
              <th className="p-3 font-semibold">Empresa</th>
              <th className="p-3 font-semibold">Método</th>
              <th className="p-3 font-semibold">Info</th>
              {loggedAdmin.role !== 'convencional' && <th className="p-3 font-semibold text-right">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-industrial-border">
            {filtered.map(log => (
              <tr key={log.id} className={`hover:bg-industrial-bg/50 ${log.isFalta ? 'bg-red-50/80' : log.is_manual ? 'bg-blue-50/50' : log.is_edited ? 'bg-orange-50/50' : ''}`}>
                <td className="p-3">
                  <span className="font-semibold block">{new Date(log.timestamp).toLocaleDateString('pt-BR')}</span>
                  {!(log.isFalta || log.type?.startsWith('Falta')) && <span className="text-industrial-muted text-xs">{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>}
                  {log.isFalta ? <span className="text-[10px] text-red-600 font-bold uppercase tracking-wider block mt-1">Falta</span> : log.is_manual ? <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mt-1">Manual</span> : log.is_edited ? <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wider block mt-1">Editado</span> : null}
                </td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                    (log.isFalta || log.type?.startsWith('Falta')) ? 'bg-red-100 text-red-600' :
                    log.type === 'Entrada Manhã' ? 'bg-cyber-emerald/10 text-cyber-emerald' :
                    log.type === 'Saída Manhã' ? 'bg-orange-50 text-orange-500' :
                    log.type === 'Entrada Tarde' ? 'bg-blue-50 text-corporate-blue' :
                    log.type === 'Saída Tarde' ? 'bg-purple-50 text-purple-600' :
                    'bg-industrial-bg text-industrial-muted'
                  }`}>
                    {log.type || 'Batida'}
                  </span>
                </td>
                <td className="p-3">
                  <span className="font-semibold block">{log.employees?.name}</span>
                  <span className="text-industrial-muted text-xs">{log.employees?.cpf}</span>
                </td>
                <td className="p-3">
                  <span className="font-medium text-industrial-text text-sm">{log.employees?.companies?.name || '-'}</span>
                </td>
                <td className="p-3">
                  <span className="bg-cyber-emerald/10 text-cyber-emerald px-2 py-1 rounded-md text-xs font-semibold">
                    {log.verification_method}
                  </span>
                </td>
                <td className="p-3">
                  {log.distance ? <span className="text-xs text-industrial-muted block">GPS: {Math.round(log.distance)}m</span> : <span className="text-xs text-industrial-muted block">Sem GPS</span>}
                  <span className="font-mono text-[10px] text-industrial-muted block truncate max-w-[100px]" title={log.hash_assinatura}>
                    {log.hash_assinatura.substring(0, 10)}...
                  </span>
                </td>
                {loggedAdmin.role !== 'convencional' && (
                  <td className="p-3 text-right whitespace-nowrap">
                    {!log.isFalta && (
                      <>
                        <button onClick={() => openEdit(log)} className="text-corporate-blue hover:text-blue-800 p-1 mr-1" title="Editar">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(log.id)} className="text-red-500 hover:text-red-700 p-1" title="Excluir">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={loggedAdmin.role !== 'convencional' ? 7 : 6} className="p-8 text-center text-industrial-muted">Nenhum registro encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Log Modal */}
      {editingLog && (
        <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-industrial-border flex justify-between items-center bg-industrial-bg">
              <h3 className="font-bold flex items-center gap-2"><Pencil size={16} className="text-cyber-emerald" /> Editar Ponto</h3>
              <button onClick={() => setEditingLog(null)} className="text-industrial-muted hover:text-industrial-text"><X size={18}/></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-4 space-y-4">
              <div className="bg-orange-50 text-orange-800 p-3 rounded-lg text-xs flex gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <p><strong>Atenção:</strong> A alteração deste registro ficará salva na auditoria com a data original.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-industrial-muted mb-1">Nova Data</label>
                  <input type="date" required value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-industrial-muted mb-1">Horário Correto</label>
                  <input 
                    type="time" 
                    required
                    value={editTime}
                    onChange={e => setEditTime(e.target.value)}
                    className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-corporate-blue focus:outline-none" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Tipo de Batida</label>
                <select 
                  value={editType}
                  onChange={e => setEditType(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-corporate-blue focus:outline-none"
                >
                  <option value="Entrada Manhã">Entrada Manhã</option>
                  <option value="Saída Manhã">Saída Manhã</option>
                  <option value="Entrada Tarde">Entrada Tarde</option>
                  <option value="Saída Tarde">Saída Tarde</option>
                  <option value="Batida Extra">Batida Extra</option>
                  <option value="Falta">Falta (Dia Inteiro)</option>
                  <option value="Falta Meio Expediente">Falta Meio Expediente</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Motivo / Justificativa da Edição (Visível para Auditoria)</label>
                <textarea required value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Ex: Funcionário esqueceu de bater o ponto" className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald min-h-[80px]" />
              </div>
              {loggedAdmin.role === 'total' && (
                <div className="flex items-center gap-2 pt-1 pb-1">
                  <input type="checkbox" id="editHideTag" checked={editHideTag} onChange={e => setEditHideTag(e.target.checked)} className="rounded border-industrial-border text-cyber-emerald focus:ring-cyber-emerald w-4 h-4 cursor-pointer" />
                  <label htmlFor="editHideTag" className="text-xs font-semibold text-industrial-muted cursor-pointer">Ocultar tag de edição (Registro parecerá original na interface)</label>
                </div>
              )}
              <button type="submit" className="w-full bg-cyber-emerald text-white py-2 rounded-xl font-bold hover:bg-opacity-90">
                Salvar Alteração
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Manual Log Modal */}
      {isAddingManual && (
        <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-industrial-border flex justify-between items-center bg-industrial-bg">
              <h3 className="font-bold flex items-center gap-2"><Plus size={16} className="text-cyber-emerald" /> Inserir Batida Manual</h3>
              <button onClick={() => setIsAddingManual(false)} className="text-industrial-muted hover:text-industrial-text"><X size={18}/></button>
            </div>
            <form onSubmit={handleAddManual} className="p-4 space-y-4">
              <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-xs flex gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <p><strong>Aviso:</strong> Batidas manuais são registradas como editadas e requerem justificativa.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Funcionário</label>
                <select 
                  required
                  value={addEmployeeId}
                  onChange={e => setAddEmployeeId(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-cyber-emerald focus:outline-none"
                >
                  <option value="">Selecione o funcionário...</option>
                  {allEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-industrial-muted mb-1">Data</label>
                  <input type="date" required value={addDate} onChange={e => setAddDate(e.target.value)} className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-industrial-muted mb-1">Horário</label>
                  <input 
                    type="time" 
                    required
                    value={addTime}
                    onChange={e => setAddTime(e.target.value)}
                    className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-corporate-blue focus:outline-none" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Tipo de Batida</label>
                <select 
                  value={addType}
                  onChange={e => setAddType(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:border-corporate-blue focus:outline-none"
                >
                  <option value="Entrada Manhã">Entrada Manhã</option>
                  <option value="Saída Manhã">Saída Manhã</option>
                  <option value="Entrada Tarde">Entrada Tarde</option>
                  <option value="Saída Tarde">Saída Tarde</option>
                  <option value="Batida Extra">Batida Extra</option>
                  <option value="Falta">Falta (Dia Inteiro)</option>
                  <option value="Falta Meio Expediente">Falta Meio Expediente</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Motivo / Justificativa (Obrigatório)</label>
                <textarea required value={addReason} onChange={e => setAddReason(e.target.value)} placeholder="Ex: Sistema offline, esqueceu de registrar..." className="w-full bg-industrial-bg border border-industrial-border rounded-lg p-2 text-sm focus:outline-none focus:border-cyber-emerald min-h-[60px]" />
              </div>
              {loggedAdmin.role === 'total' && (
                <div className="flex items-center gap-2 pt-1 pb-1">
                  <input type="checkbox" id="addHideTag" checked={addHideTag} onChange={e => setAddHideTag(e.target.checked)} className="rounded border-industrial-border text-cyber-emerald focus:ring-cyber-emerald w-4 h-4 cursor-pointer" />
                  <label htmlFor="addHideTag" className="text-xs font-semibold text-industrial-muted cursor-pointer">Ocultar tag manual (Registro parecerá original na interface)</label>
                </div>
              )}
              <button type="submit" className="w-full bg-cyber-emerald text-white py-2 rounded-xl font-bold hover:bg-opacity-90">
                Inserir Registro
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

