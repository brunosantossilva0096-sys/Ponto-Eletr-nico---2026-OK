-- Create Facial Templates table for storing face-api.js descriptors
CREATE TABLE IF NOT EXISTS facial_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    descriptor TEXT NOT NULL, -- JSON string array of 128 floats
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Ensure RLS is disabled so the frontend can read/write directly
ALTER TABLE facial_templates DISABLE ROW LEVEL SECURITY;
