-- Add device_id to employees to lock punches to a specific device
ALTER TABLE employees ADD COLUMN IF NOT EXISTS allowed_mobile_device_id TEXT;

-- Add device_id to pontos to log which device was used
ALTER TABLE pontos ADD COLUMN IF NOT EXISTS device_id TEXT;
