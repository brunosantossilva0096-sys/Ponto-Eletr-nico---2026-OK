-- 1. Adicionar coluna de método de autenticação na tabela de funcionários
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'both'; -- 'both', 'digital', 'pin'
