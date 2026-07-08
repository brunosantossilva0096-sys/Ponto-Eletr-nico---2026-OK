-- Schema v7: Identificação explícita de batidas manuais

ALTER TABLE time_logs 
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;
