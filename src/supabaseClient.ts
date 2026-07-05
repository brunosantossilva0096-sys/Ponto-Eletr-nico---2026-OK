import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Variáveis de ambiente do Supabase não configuradas (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY). O aplicativo pode não funcionar corretamente na nuvem.');
}

// Cria a instância do Supabase Client. Usamos uma URL e chave "fictícias" de fallback 
// apenas para não quebrar a compilação local se o .env não existir ainda.
export const supabase = createClient(
  supabaseUrl || 'https://sua-url-do-supabase.supabase.co',
  supabaseAnonKey || 'sua-chave-anonima-do-supabase'
);
