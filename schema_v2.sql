-- Criar tabela de Funcionários
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  pis TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  pin TEXT, -- Senha de acesso caso digital não funcione
  id_funcionario TEXT,
  
  -- Geolocalização
  allowed_lat DOUBLE PRECISION,
  allowed_lng DOUBLE PRECISION,
  allowed_radius INTEGER DEFAULT 100, -- Raio em metros
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Inserir dados padrão para teste
INSERT INTO employees (name, cpf, pis, role, pin, id_funcionario, allowed_lat, allowed_lng, allowed_radius)
VALUES 
('Administrador', '00000000000', '00000000000', 'Admin', 'admin', '#ADMIN', -23.55052, -46.633308, 5000)
ON CONFLICT (cpf) DO NOTHING;

INSERT INTO employees (name, cpf, pis, role, pin, id_funcionario, allowed_lat, allowed_lng, allowed_radius)
VALUES 
('Bruno Santos Silva', '12345678900', '12034567890', 'Desenvolvedor Pleno', '123', '#8829-10', -23.55052, -46.633308, 100)
ON CONFLICT (cpf) DO NOTHING;

-- Atualizar tabelas existentes para usar employee_id ao invés de user_id/cpf string solta
ALTER TABLE biometric_templates 
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);

ALTER TABLE time_logs 
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);

ALTER TABLE adjustment_requests 
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);

ALTER TABLE absences 
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);

-- Configurar RLS (Row Level Security) - Abrindo temporariamente para dev (o correto seria usar auth)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for employees" ON employees FOR ALL USING (true);
