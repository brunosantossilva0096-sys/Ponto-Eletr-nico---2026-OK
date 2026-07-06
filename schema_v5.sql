-- 1. Remover tabelas existentes se necessário
DROP TABLE IF EXISTS absences CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS time_logs CASCADE;
DROP TABLE IF EXISTS biometric_templates CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- 2. Criar tabela de Empresas
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Criar tabela de Funcionários
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  pis TEXT NOT NULL,
  role TEXT NOT NULL,
  pin TEXT,
  allowed_lat DOUBLE PRECISION,
  allowed_lng DOUBLE PRECISION,
  allowed_radius DOUBLE PRECISION DEFAULT 100,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  work_start TIME,
  break_start TIME,
  break_end TIME,
  work_end TIME,
  work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
  auth_method TEXT DEFAULT 'both',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Criar tabela de Templates Biométricos
CREATE TABLE biometric_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  template TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Criar tabela de Registros de Ponto
CREATE TABLE time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL DEFAULT 'Batida',
  verification_method TEXT NOT NULL,
  distance DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_evidence TEXT,
  hash_assinatura TEXT NOT NULL,
  pis_pasep_trabalhador TEXT,
  cpf_trabalhador TEXT,
  cnpj_empregador TEXT,
  razao_social_empregador TEXT,
  is_edited BOOLEAN DEFAULT FALSE,
  original_timestamp TIMESTAMPTZ,
  edit_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Criar tabela de Feriados
CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'nacional',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Criar tabela de Afastamentos/Atestados
CREATE TABLE absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  approved_by TEXT,
  document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
