// Utilitários para WebAuthn (Passkeys / Biometria via Navegador)

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  const base64String = btoa(str);
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer.buffer;
}

export async function registerWebAuthn(userName: string, userId: string): Promise<{ credentialId: string, publicKey: string } | null> {
  if (!window.PublicKeyCredential) {
    alert('Biometria via Web não é suportada neste navegador.');
    return null;
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  // Em um cenário real super restrito, userId deveria ser gerado no server. Aqui usamos o ID do funcionário.
  const userBuffer = new TextEncoder().encode(userId);

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Ponto Eletrônico',
          id: window.location.hostname
        },
        user: {
          id: userBuffer,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Exige biometria nativa do aparelho (FaceID/TouchID/Windows Hello)
          userVerification: 'required', // Exige confirmação real
          residentKey: 'required'
        },
        timeout: 60000,
        attestation: 'none'
      }
    }) as PublicKeyCredential;

    if (!credential) return null;

    // Em uma implementação local/estateless do client (apenas como prova de conceito),
    // Extraímos a ID e salvamos no banco.
    // O WebAuthn ideal exige que o Servidor valide o 'attestationObject'. 
    // Como nossa regra permite validação no client (pois salvamos direto no Supabase),
    // pegamos apenas a ID gerada.
    const credentialId = credential.id; 
    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKey = bufferToBase64url(response.getPublicKey?.() || new ArrayBuffer(0));

    return { credentialId, publicKey };
  } catch (error: any) {
    console.error('Erro WebAuthn Register:', error);
    if (error.name === 'NotAllowedError') {
      alert('Acesso negado ou cancelado pelo usuário.');
    } else {
      alert('Falha ao cadastrar biometria: ' + error.message);
    }
    return null;
  }
}

export async function authenticateWebAuthn(credentialIdStr: string): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    alert('Biometria via Web não é suportada neste navegador.');
    return false;
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [
          {
            type: 'public-key',
            id: base64urlToBuffer(credentialIdStr)
          }
        ],
        userVerification: 'preferred',
        timeout: 60000
      }
    });

    if (credential) {
      return true; // Match!
    }
    return false;
  } catch (error: any) {
    console.error('Erro WebAuthn Auth:', error);
    if (error.name !== 'NotAllowedError') {
      alert('Falha ao ler biometria: ' + error.message);
    }
    return false;
  }
}
