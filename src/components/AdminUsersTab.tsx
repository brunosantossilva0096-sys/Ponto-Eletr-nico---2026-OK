import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { AdminUser } from '../types';
import { Shield, Plus, Edit2, Trash2, Save, X } from 'lucide-react';

export const AdminUsersTab = ({ loggedAdmin }: { loggedAdmin: AdminUser }) => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'total' | 'parcial' | 'convencional'>('parcial');

  const fetchAdmins = async () => {
    const { data } = await supabase.from('admin_users').select('*').order('username');
    if (data) setAdmins(data as AdminUser[]);
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setRole('parcial');
    setEditingAdmin(null);
    setIsCreating(false);
  };

  const handleEdit = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setUsername(admin.username);
    setPassword(admin.password || ''); // No real app, password is not returned in plaintext, mas aqui é local/simples
    setRole(admin.role);
    setIsCreating(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (id === loggedAdmin.id) {
      alert('Você não pode excluir a si mesmo.');
      return;
    }
    if (confirm(`Tem certeza que deseja excluir o administrador "${name}"?`)) {
      await supabase.from('admin_users').delete().eq('id', id);
      fetchAdmins();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      alert('Preencha usuário e senha');
      return;
    }

    if (editingAdmin) {
      const { error } = await supabase
        .from('admin_users')
        .update({ username, password, role })
        .eq('id', editingAdmin.id);
        
      if (error) alert('Erro ao atualizar: ' + error.message);
    } else {
      const { error } = await supabase
        .from('admin_users')
        .insert([{ username, password, role }]);
        
      if (error) alert('Erro ao criar: ' + error.message);
    }

    resetForm();
    fetchAdmins();
  };

  if (loggedAdmin.role !== 'total') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-industrial-border p-8 h-[600px] flex flex-col items-center justify-center text-center">
        <Shield size={48} className="text-industrial-muted mb-4" />
        <h2 className="text-xl font-bold text-industrial-text">Acesso Negado</h2>
        <p className="text-industrial-muted mt-2">Apenas administradores com permissão Total podem gerenciar perfis administrativos.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-industrial-border p-6 h-[600px] flex flex-col relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-lg flex items-center gap-2"><Shield size={18} className="text-cyber-emerald"/> Administradores do Sistema</h2>
        {!isCreating && (
          <button 
            onClick={() => { resetForm(); setIsCreating(true); }}
            className="bg-cyber-emerald text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-opacity-90 transition-all"
          >
            <Plus size={16} /> Novo Administrador
          </button>
        )}
      </div>

      {!isCreating ? (
        <div className="flex-1 overflow-auto border border-industrial-border rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-industrial-bg text-industrial-muted sticky top-0">
              <tr>
                <th className="p-3 font-semibold">Usuário</th>
                <th className="p-3 font-semibold">Permissão</th>
                <th className="p-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border">
              {admins.map(admin => (
                <tr key={admin.id} className="hover:bg-industrial-bg/50">
                  <td className="p-3 font-semibold">{admin.username}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                      admin.role === 'total' ? 'bg-purple-100 text-purple-700' :
                      admin.role === 'parcial' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {admin.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => handleEdit(admin)} className="text-corporate-blue hover:text-blue-800 p-1 mr-2" title="Editar">
                      <Edit2 size={16} />
                    </button>
                    {admin.id !== loggedAdmin.id && (
                      <button onClick={() => handleDelete(admin.id, admin.username)} className="text-red-500 hover:text-red-700 p-1" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="bg-industrial-bg/50 rounded-xl p-6 border border-industrial-border max-w-lg mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg">{editingAdmin ? 'Editar Administrador' : 'Novo Administrador'}</h3>
              <button onClick={resetForm} className="text-industrial-muted hover:text-industrial-text">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Usuário</label>
                <input 
                  type="text" 
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-white border border-industrial-border rounded-lg p-2.5 text-sm focus:border-cyber-emerald focus:outline-none" 
                  disabled={editingAdmin?.username === 'admin'} // Evita renomear o admin master
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Senha</label>
                <input 
                  type="text" 
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-white border border-industrial-border rounded-lg p-2.5 text-sm focus:border-cyber-emerald focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-industrial-muted mb-1">Nível de Permissão</label>
                <select 
                  value={role}
                  onChange={e => setRole(e.target.value as any)}
                  className="w-full bg-white border border-industrial-border rounded-lg p-2.5 text-sm focus:border-cyber-emerald focus:outline-none"
                  disabled={editingAdmin?.username === 'admin'} // Admin master sempre é Total
                >
                  <option value="total">Total (Acesso irrestrito a todas as áreas e criação de admins)</option>
                  <option value="parcial">Parcial (Pode gerenciar funcionários e ver relatórios, mas não gerencia admins)</option>
                  <option value="convencional">Convencional (Apenas visualiza relatórios, sem alterar ou excluir)</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={resetForm} className="flex-1 py-2.5 bg-white border border-industrial-border rounded-xl font-semibold hover:bg-industrial-bg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-cyber-emerald text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all">
                  <Save size={18} /> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
