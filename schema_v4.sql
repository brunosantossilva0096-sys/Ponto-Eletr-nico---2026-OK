-- 1. Carga Horária em Funcionários
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS work_start TIME,
ADD COLUMN IF NOT EXISTS work_end TIME,
ADD COLUMN IF NOT EXISTS work_days JSONB DEFAULT '[]'::jsonb;

-- 2. Tabela de Feriados
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'Nacional', -- Nacional, Estadual, Municipal
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Tabela de Abonos / Ausências
CREATE TABLE IF NOT EXISTS absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  approved_by TEXT,
  document_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Auditoria de Edição em Ponto Eletrônico
ALTER TABLE time_logs 
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_timestamp TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS edit_reason TEXT;

-- Permitir leitura/escrita nas novas tabelas para este ambiente local
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for holidays" ON holidays FOR ALL USING (true);

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for absences" ON absences FOR ALL USING (true);
