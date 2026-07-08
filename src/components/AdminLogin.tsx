import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { AdminUser } from '../types';
import { User, Lock, ArrowLeft, Shield } from 'lucide-react';

interface AdminLoginProps {
  onLogin: (user: AdminUser) => void;
  onBack: () => void;
}

export const AdminLogin = ({ onLogin, onBack }: AdminLoginProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Preencha usuário e senha');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Usamos get para testar o fallback original
      if (username === 'admin' && password === 'admin') {
        // Tenta buscar no banco primeiro
        const { data, error: dbError } = await supabase
          .from('admin_users')
          .select('*')
          .eq('username', username)
          .eq('password', password)
          .maybeSingle();

        if (dbError && dbError.code === '42P01') {
          // Tabela não existe, fallback para o admin master local
          onLogin({
            id: 'local-admin',
            username: 'admin',
            role: 'total'
          });
          setLoading(false);
          return;
        }
      }

      const { data, error: dbError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .maybeSingle();

      if (dbError) {
        if (dbError.code === '42P01') {
          setError('Tabela admin_users não existe. Execute o script SQL no Supabase.');
        } else {
          setError('Erro de conexão com o banco de dados.');
        }
      } else if (data) {
        onLogin(data as AdminUser);
      } else {
        setError('Usuário ou senha incorretos.');
      }
    } catch (err) {
      setError('Erro ao tentar logar.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-industrial-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-industrial-border animate-fade-in p-8">
        <button onClick={onBack} className="text-industrial-muted hover:text-industrial-text flex items-center gap-2 text-sm font-semibold mb-6">
          <ArrowLeft size={16} /> Voltar
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-cyber-emerald/10 text-cyber-emerald rounded-full flex items-center justify-center mb-4">
            <Shield size={32} />
          </div>
          <h2 className="text-2xl font-bold text-industrial-text">Acesso Administrativo</h2>
          <p className="text-sm text-industrial-muted mt-1">Insira suas credenciais para continuar</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 font-medium text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-2 uppercase tracking-wider">Usuário</label>
            <div className="relative">
              <User className="absolute left-3 top-3 text-industrial-muted" size={18} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-industrial-bg border border-industrial-border rounded-xl text-sm focus:border-cyber-emerald focus:outline-none transition-colors"
                placeholder="Ex: admin"
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-industrial-muted mb-2 uppercase tracking-wider">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-industrial-muted" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-industrial-bg border border-industrial-border rounded-xl text-sm focus:border-cyber-emerald focus:outline-none transition-colors"
                placeholder="Sua senha"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-industrial-text text-white py-3 rounded-xl font-bold hover:bg-opacity-90 transition-all flex justify-center items-center gap-2 mt-4 disabled:opacity-50"
          >
            {loading ? 'Acessando...' : 'Entrar no Painel'}
          </button>
        </form>
      </div>
    </div>
  );
};
