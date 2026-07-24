import express from 'express';
import cors from 'cors';
import fs from 'fs';
import os from 'os';
import SecuGenWrapper, { sdkAvailable, getErrorMessage } from './secugen-wrapper.js';

const app = express();
const PORT = 8000;

// ============================================================
// Middleware
// ============================================================
// Habilitar CORS para o frontend hospedado no Vercel (ou qualquer outro)
app.use(cors({
  origin: '*'
}));
app.use(express.json({ limit: '10mb' }));

// ============================================================
// Instância do SecuGen (singleton persistente e stateless)
// ============================================================
const secugen = new SecuGenWrapper();

// Pre-inicializar o leitor no startup (non-blocking)
(async () => {
  if (sdkAvailable) {
    try {
      await secugen.init();
      console.log('[Server] Leitor biométrico pré-inicializado e pronto!');
    } catch (err) {
      console.warn(`[Server] Leitor biométrico não pôde ser pré-inicializado: ${err.message}`);
      console.warn('[Server] O leitor será inicializado na primeira captura.');
    }
  } else {
    console.warn('[Server] SDK SecuGen não disponível. Apenas modo de simulação.');
  }
})();

// ============================================================
// Rotas da API
// ============================================================

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SECUGEN Biometric Server running',
    sdkAvailable,
    mode: sdkAvailable ? 'SDK Real' : 'Simulação'
  });
});

// --- Status do leitor biométrico ---
app.get('/SGIFPStatus', (req, res) => {
  const status = secugen.getStatus();
  res.json({
    success: true,
    connected: status.deviceOpen,
    sdkAvailable: status.sdkAvailable,
    deviceInfo: status.deviceInfo,
    dllPath: status.dllPath
  });
});

// --- Obter MAC Address Local ---
app.get('/mac-address', (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    let macAddress = null;
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
          macAddress = iface.mac;
          break;
        }
      }
      if (macAddress) break;
    }
    res.json({ success: true, macAddress });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Capturar impressão digital ---
app.post('/SGIFPCapture', async (req, res) => {
  try {
    const { timeout = 10000, quality = 50, templateFormat = 'ISO', maxRetries = 3 } = req.body;

    if (sdkAvailable) {
      console.log('[Server] Iniciando captura com SDK real...');
      const captureResult = await secugen.captureFull(maxRetries, timeout);

      res.json({
        success: true,
        imageData: captureResult.imageData,
        template: captureResult.template,
        imageQuality: captureResult.imageQuality,
        quality: quality,
        format: templateFormat,
        timestamp: captureResult.timestamp
      });
    } else {
      // Fallback para simulação
      console.log('[Server] Usando simulação (SDK não disponível)...');
      const mockCapture = await simulateFingerprintCapture(timeout, quality);

      res.json({
        success: true,
        imageData: mockCapture.imageData,
        template: mockCapture.template,
        quality: mockCapture.quality,
        format: templateFormat,
        timestamp: new Date().toISOString(),
        simulated: true
      });
    }
  } catch (error) {
    console.error('[Server] Erro na captura:', error.message);

    // Retornar informação útil sobre o tipo de erro
    const isTimeout = error.isTimeout || error.code === 54;
    const statusCode = isTimeout ? 408 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message || 'Falha ao capturar impressão digital',
      errorCode: error.code || null,
      isTimeout,
      attempt: error.attempt || null,
      maxRetries: error.maxRetries || null
    });
  }
});

// --- Verificar impressão digital (1:1 match estateless) ---
app.post('/SGIFPMatch', async (req, res) => {
  try {
    // Recebe ambos os templates do frontend (um capturado agora, outro vindo do Supabase)
    const { template1, template2 } = req.body;

    if (!template1 || !template2) {
      return res.status(400).json({
        success: false,
        error: 'template1 e template2 são obrigatórios'
      });
    }

    if (sdkAvailable) {
      console.log('[Server] Matching stateless com SDK real...');
      const matchScore = await secugen.matchTemplate(template1, template2);

      const threshold = 60;
      const matched = matchScore >= threshold;

      console.log(`[Server] Match: score=${matchScore}, threshold=${threshold}, matched=${matched}`);
      res.json({
        success: true,
        matched: matched,
        score: matchScore,
        threshold: threshold
      });
    } else {
      // Fallback para simulação
      const matchResult = await simulateFingerprintMatch(template1, template2);
      res.json({
        success: true,
        matched: matchResult.matched,
        score: matchResult.score,
        threshold: matchResult.threshold,
        simulated: true
      });
    }
  } catch (error) {
    console.error('[Server] Erro na verificação:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Falha ao verificar impressão digital'
    });
  }
});

// ============================================================
// Funções de simulação (fallback quando SDK não está disponível)
// ============================================================
async function simulateFingerprintCapture(timeout, quality) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        imageData: generateMockFingerprintImage(),
        template: generateMockTemplate(),
        quality: quality + Math.floor(Math.random() * 10),
        format: 'ISO'
      });
    }, 1000);
  });
}

async function simulateFingerprintMatch(template1, template2) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const score = Math.floor(Math.random() * 30) + 70;
      const threshold = 60;
      resolve({
        matched: score >= threshold,
        score,
        threshold
      });
    }, 500);
  });
}

function generateMockFingerprintImage() {
  const width = 300;
  const height = 300;
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x90, 0x77, 0x53, 0xDE,
    0x00, 0x00, 0x00, 0x0C,
    0x49, 0x44, 0x41, 0x54,
    0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44,
    0xAE, 0x42, 0x60, 0x82
  ]);
  return pngHeader.toString('base64');
}

function generateMockTemplate() {
  const templateData = Array.from({ length: 512 }, () =>
    Math.floor(Math.random() * 256)
  );
  return Buffer.from(templateData).toString('base64');
}

// ============================================================
// Iniciar servidor
// ============================================================
const server = app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   SECUGEN Biometric Server — Ponto Eletrônico     ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║  Porta: ${PORT}                                       ║`);
  console.log(`║  Modo:  ${sdkAvailable ? 'SDK Real (SecuGen U20-A)' : 'Simulação         '}       ║`);
  console.log(`║  Health: http://localhost:${PORT}/health              ║`);
  console.log(`║  Status: http://localhost:${PORT}/SGIFPStatus         ║`);
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
});

// ============================================================
// Shutdown limpo — libera o leitor USB
// ============================================================
const cleanExit = async () => {
  console.log('\n[Server] Encerrando servidor e liberando leitor USB...');
  try {
    await secugen.close();
  } catch (e) {
    console.error('[Server] Erro ao fechar leitor:', e.message);
  }
  server.close(() => {
    console.log('[Server] Servidor encerrado.');
    process.exit(0);
  });
};

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);
process.on('SIGHUP', cleanExit);
