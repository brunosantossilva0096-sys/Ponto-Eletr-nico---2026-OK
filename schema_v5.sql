-- Schema v5: Adicionar colunas faltantes na tabela employees
-- Campos de intervalo (almoço) e método de autenticação

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS break_start TIME,
ADD COLUMN IF NOT EXISTS break_end TIME,
ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'both';
