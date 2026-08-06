-- Create WebAuthn credentials table for storing Passkeys (FaceID/TouchID)
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Ensure RLS is disabled so the frontend can read/write directly
ALTER TABLE webauthn_credentials DISABLE ROW LEVEL SECURITY;
