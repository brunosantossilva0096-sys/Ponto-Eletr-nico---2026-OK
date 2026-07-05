-- Tabela de Empresas
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Inserir empresa padrão para não quebrar funcionários existentes
INSERT INTO companies (name, cnpj)
VALUES ('Matriz', '00.000.000/0001-00')
ON CONFLICT (cnpj) DO NOTHING;

-- Adicionar relacionamento na tabela de funcionários
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Para todos os funcionários atuais, setar a empresa padrão
UPDATE employees 
SET company_id = (SELECT id FROM companies WHERE cnpj = '00.000.000/0001-00')
WHERE company_id IS NULL;

-- Permitir leitura/escrita na nova tabela para este ambiente local
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for companies" ON companies FOR ALL USING (true);
