-- Adicionar company_id na tabela admin_users para vincular perfis de administrador a empresas específicas
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
