-- Criação da tabela de Administradores
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'parcial', -- 'total', 'parcial', 'convencional'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Inserir o administrador principal caso a tabela esteja vazia
INSERT INTO admin_users (username, password, role) 
VALUES ('admin', 'admin', 'total') 
ON CONFLICT (username) DO NOTHING;

-- Configurar políticas de segurança e acesso
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Permite acesso
CREATE POLICY "Enable all access for admin_users" ON admin_users FOR ALL USING (true);
