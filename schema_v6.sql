-- Schema v6: Suporte a carga horária individual por dia da semana

-- 1. Tipo de Escala (standard = Semanal Padrão, custom = Individual por Dia)
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'standard',

-- 2. Escala Customizada (Configuração diária em JSON)
ADD COLUMN IF NOT EXISTS custom_schedule JSONB DEFAULT '{}'::jsonb;
