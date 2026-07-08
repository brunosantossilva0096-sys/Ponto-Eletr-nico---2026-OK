import koffi from 'koffi';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ============================================================
// Caminho para o SDK SecuGen FDx Pro
// ============================================================
const homedir = os.homedir();
let SDK_PATH = path.join(process.cwd(), 'sdk');

if (!fs.existsSync(path.join(SDK_PATH, 'bin', 'x64', 'sgfplib.dll'))) {
  SDK_PATH = path.join(homedir, 'Desktop', 'FDx SDK Pro for Windows v4.3.1');
}
if (!fs.existsSync(path.join(SDK_PATH, 'bin', 'x64', 'sgfplib.dll'))) {
  SDK_PATH = path.join(homedir, 'Downloads', 'FDx_SDK_Pro_Windows_v4.3.1_J1.21', 'FDx SDK Pro for Windows v4.3.1');
}
if (!fs.existsSync(path.join(SDK_PATH, 'bin', 'x64', 'sgfplib.dll'))) {
  SDK_PATH = path.join(homedir, 'Downloads', 'FDx SDK Pro for Windows v4.3.1');
}
if (!fs.existsSync(path.join(SDK_PATH, 'bin', 'x64', 'sgfplib.dll'))) {
  // Fallback para o caminho absoluto original do Bruno
  SDK_PATH = 'C:\\Users\\bruno\\Desktop\\FDx SDK Pro for Windows v4.3.1';
}

const DLL_PATH = path.join(SDK_PATH, 'bin', 'x64');
const DLL_FILE = path.join(DLL_PATH, 'sgfplib.dll');

// IMPORTANTE: Adicionar a pasta da DLL ao PATH do Windows para que
// o sgfplib.dll consiga carregar as DLLs dependentes (ex: sgfpamx.dll que contém os algoritmos)
process.env.PATH = `${DLL_PATH};${process.env.PATH}`;

// Verificar se o SDK existe antes de tentar carregar
let sdkAvailable = false;
let sgfplib = null;
let sgfpamx = null;
let sgwsqlib = null;

try {
  if (!fs.existsSync(DLL_FILE)) {
    console.error(`[SecuGen] SDK não encontrado em: ${DLL_FILE}`);
  } else {
    // PRÉ-CARREGAR AS DLLS DE ALGORITMO PARA FORÇAR NA MEMÓRIA DO PROCESSO
    try {
      const pamxPath = path.join(DLL_PATH, 'sgfpamx.dll');
      if (fs.existsSync(pamxPath)) sgfpamx = koffi.load(pamxPath);
      
      const wsqPath = path.join(DLL_PATH, 'sgwsqlib.dll');
      if (fs.existsSync(wsqPath)) sgwsqlib = koffi.load(wsqPath);
      console.log('[SecuGen] DLLs de algoritmo pré-carregadas com sucesso.');
    } catch (e) {
      console.warn('[SecuGen] Aviso: não foi possível pré-carregar DLLs auxiliares:', e.message);
    }

    sgfplib = koffi.load(DLL_FILE);
    sdkAvailable = true;
    console.log(`[SecuGen] SDK carregado com sucesso de: ${DLL_FILE}`);
  }
} catch (err) {
  console.error(`[SecuGen] Falha ao carregar SDK:`, err.message);
}

// ============================================================
// Constantes do SDK
// ============================================================
const SG_DEV_FDU08 = 0x0A;  // U20-A (Hamster Pro 20)
const SG_DEV_AUTO  = 0xFF;

// Formatos de template
const TEMPLATE_FORMAT_ANSI378     = 0x0100;
const TEMPLATE_FORMAT_SG400       = 0x0200;
const TEMPLATE_FORMAT_ISO19794    = 0x0300;

// Códigos de erro relevantes
const SGFDX_ERROR_NONE            = 0;
const SGFDX_ERROR_TIME_OUT        = 54;
const SGFDX_ERROR_DEVICE_NOT_FOUND = 55;
const SGFDX_ERROR_DEV_ALREADY_OPEN = 59;
const SGFDX_ERROR_FEAT_NUMBER     = 101;

// Mapa de códigos de erro para mensagens legíveis
const ERROR_MESSAGES = {
  0:   'Sucesso',
  1:   'Falha na criação do objeto',
  2:   'Falha na função',
  3:   'Parâmetro inválido',
  5:   'Falha ao carregar DLL',
  6:   'Falha ao carregar driver',
  7:   'Falha ao carregar algoritmo',
  51:  'Falha ao carregar arquivo do sistema',
  52:  'Falha na inicialização do chip',
  53:  'Dados da imagem perdidos',
  54:  'Timeout — coloque o dedo no leitor',
  55:  'Dispositivo não encontrado',
  56:  'Falha ao carregar DLL do driver',
  57:  'Imagem incorreta',
  58:  'Falta de banda USB',
  59:  'Dispositivo já aberto por outro processo',
  60:  'Falha ao obter número de série',
  61:  'Dispositivo não suportado',
  62:  'Dedo falso detectado',
  63:  'Falha na inicialização de detecção de dedo falso',
  101: 'Poucas minúcias na imagem — pressione melhor o dedo',
  102: 'Tipo de template inválido',
  103: 'Erro ao decodificar template 1',
  104: 'Erro ao decodificar template 2',
  105: 'Falha na extração',
  106: 'Falha no matching',
  501: 'Falha ao carregar licença',
  502: 'Chave de licença inválida',
  503: 'Licença expirada',
};

function getErrorMessage(code) {
  return ERROR_MESSAGES[code] || `Erro desconhecido (código: ${code})`;
}

// ============================================================
// Structs e funções do SDK (carregados apenas se SDK disponível)
// ============================================================
let SGDeviceInfoParam, SGFingerInfo;
let SGFPM_Create, SGFPM_Terminate, SGFPM_Init;
let SGFPM_OpenDevice, SGFPM_CloseDevice, SGFPM_GetDeviceInfo;
let SGFPM_GetImage, SGFPM_GetImageEx;
let SGFPM_GetMaxTemplateSize, SGFPM_CreateTemplate;
let SGFPM_MatchTemplate, SGFPM_GetMatchingScore;
let SGFPM_SetTemplateFormat, SGFPM_EnableSmartCapture;
let SGFPM_SetLedOn, SGFPM_GetImageQuality;

if (sdkAvailable) {
  // Structs
  SGDeviceInfoParam = koffi.struct('SGDeviceInfoParam', {
    DeviceID:    'uint32_t',
    DeviceSN:    koffi.array('uint8_t', 16),  // SGDEV_SN_LEN (15) + 1
    ComPort:     'uint32_t',
    ComSpeed:    'uint32_t',
    ImageWidth:  'uint32_t',
    ImageHeight: 'uint32_t',
    Contrast:    'uint32_t',
    Brightness:  'uint32_t',
    Gain:        'uint32_t',
    ImageDPI:    'uint32_t',
    FWVersion:   'uint32_t'
  });

  SGFingerInfo = koffi.struct('SGFingerInfo', {
    FingerNumber:   'uint16_t',
    ViewNumber:     'uint16_t',
    ImpressionType: 'uint16_t',
    ImageQuality:   'uint16_t'
  });

  // Funções do SDK (__stdcall / WINAPI)
  SGFPM_Create           = sgfplib.func('uint32_t __stdcall SGFPM_Create(void** phFPM)');
  SGFPM_Terminate        = sgfplib.func('uint32_t __stdcall SGFPM_Terminate(void* hFpm)');
  SGFPM_Init             = sgfplib.func('uint32_t __stdcall SGFPM_Init(void* hFpm, uint32_t devName)');
  SGFPM_OpenDevice       = sgfplib.func('uint32_t __stdcall SGFPM_OpenDevice(void* hFpm, uint32_t devId)');
  SGFPM_CloseDevice      = sgfplib.func('uint32_t __stdcall SGFPM_CloseDevice(void* hFpm)');
  SGFPM_GetDeviceInfo    = sgfplib.func('uint32_t __stdcall SGFPM_GetDeviceInfo(void* hFpm, void* pInfo)');
  SGFPM_GetImage         = sgfplib.func('uint32_t __stdcall SGFPM_GetImage(void* hFpm, uint8_t* buffer)');
  SGFPM_GetImageEx       = sgfplib.func('uint32_t __stdcall SGFPM_GetImageEx(void* hFpm, uint8_t* buffer, uint32_t timeout, void* dispWnd, uint32_t quality)');
  SGFPM_GetMaxTemplateSize = sgfplib.func('uint32_t __stdcall SGFPM_GetMaxTemplateSize(void* hFpm, uint32_t* size)');
  SGFPM_CreateTemplate   = sgfplib.func('uint32_t __stdcall SGFPM_CreateTemplate(void* hFpm, SGFingerInfo* fpInfo, uint8_t* rawImage, uint8_t* minTemplate)');
  SGFPM_MatchTemplate    = sgfplib.func('uint32_t __stdcall SGFPM_MatchTemplate(void* hFpm, uint8_t* minTemplate1, uint8_t* minTemplate2, uint32_t secuLevel, int32_t* matched)');
  SGFPM_GetMatchingScore = sgfplib.func('uint32_t __stdcall SGFPM_GetMatchingScore(void* hFpm, uint8_t* minTemplate1, uint8_t* minTemplate2, uint32_t* score)');
  SGFPM_SetTemplateFormat = sgfplib.func('uint32_t __stdcall SGFPM_SetTemplateFormat(void* hFpm, uint16_t format)');
  SGFPM_EnableSmartCapture = sgfplib.func('uint32_t __stdcall SGFPM_EnableSmartCapture(void* hFpm, int enable)');
  SGFPM_SetLedOn         = sgfplib.func('uint32_t __stdcall SGFPM_SetLedOn(void* hFpm, int on)');
  SGFPM_GetImageQuality  = sgfplib.func('uint32_t __stdcall SGFPM_GetImageQuality(void* hFpm, uint32_t width, uint32_t height, uint8_t* imgBuf, uint32_t* quality)');
}

// ============================================================
// Utilitário: converter imagem greyscale crua para BMP base64
// ============================================================
function rawToBmpBase64(rawBuffer, width, height) {
  const rowSize = Math.floor((width * 8 + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + 1024 + pixelDataSize;

  const bmp = Buffer.alloc(fileSize);

  // BMP File Header (14 bytes)
  bmp.write('BM', 0);
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(0, 6);
  bmp.writeUInt32LE(54 + 1024, 10);  // offset to pixel data

  // DIB Header (BITMAPINFOHEADER - 40 bytes)
  bmp.writeUInt32LE(40, 14);
  bmp.writeUInt32LE(width, 18);
  bmp.writeInt32LE(-height, 22);  // Top-down (negativo = top-down)
  bmp.writeUInt16LE(1, 26);       // color planes
  bmp.writeUInt16LE(8, 28);       // 8-bit greyscale
  bmp.writeUInt32LE(0, 30);       // no compression
  bmp.writeUInt32LE(pixelDataSize, 34);
  bmp.writeInt32LE(2835, 38);     // 72 DPI horizontal
  bmp.writeInt32LE(2835, 42);     // 72 DPI vertical
  bmp.writeUInt32LE(256, 46);     // colors in palette
  bmp.writeUInt32LE(256, 50);     // important colors

  // Color Palette (256 greyscale entries, 4 bytes each)
  let offset = 54;
  for (let i = 0; i < 256; i++) {
    bmp.writeUInt8(i, offset);       // Blue
    bmp.writeUInt8(i, offset + 1);   // Green
    bmp.writeUInt8(i, offset + 2);   // Red
    bmp.writeUInt8(0, offset + 3);   // Reserved
    offset += 4;
  }

  // Pixel Data
  for (let y = 0; y < height; y++) {
    const sourceOffset = y * width;
    const destOffset = 54 + 1024 + y * rowSize;
    rawBuffer.copy(bmp, destOffset, sourceOffset, sourceOffset + width);
  }

  return bmp.toString('base64');
}

// ============================================================
// Classe SecuGenWrapper — Singleton persistente
// ============================================================
class SecuGenWrapper {
  constructor() {
    this.hFPM = null;
    this.deviceOpen = false;
    this.deviceInfo = null;  // { width, height, dpi, serialNumber }
    this._initPromise = null;
  }

  // ---- Status do leitor ----
  getStatus() {
    return {
      sdkAvailable,
      deviceOpen: this.deviceOpen,
      deviceInfo: this.deviceInfo,
      dllPath: DLL_FILE
    };
  }

  // ---- Inicializar dispositivo (lazy, uma única vez) ----
  async init() {
    // Se já inicializado, reutilizar
    if (this.deviceOpen && this.hFPM !== null) {
      return;
    }

    // Evitar inicializações concorrentes
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = this._doInit();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  async _doInit() {
    if (!sdkAvailable) {
      throw new Error('SDK SecuGen não está disponível. Verifique se o arquivo sgfplib.dll existe.');
    }

    try {
      // 1. Criar objeto FPM
      console.log('[SecuGen] Criando objeto FPM...');
      const phFPM = Buffer.alloc(8);  // ponteiro para HSGFPM (void*)
      let result = SGFPM_Create(phFPM);
      if (result !== SGFDX_ERROR_NONE) {
        throw new Error(`Falha ao criar objeto SecuGen: ${getErrorMessage(result)}`);
      }
      // Ler o ponteiro opaco — readBigUInt64LE para endereço correto em 64-bit
      this.hFPM = phFPM.readBigUInt64LE(0);

      // 2. Inicializar SDK com tipo do dispositivo
      console.log('[SecuGen] Inicializando SDK (SG_DEV_FDU08 = U20-A)...');
      result = SGFPM_Init(this.hFPM, SG_DEV_FDU08);
      if (result !== SGFDX_ERROR_NONE) {
        this._terminate();
        throw new Error(`Falha ao inicializar SDK: ${getErrorMessage(result)}`);
      }

      // 3. Abrir dispositivo USB (ID 0 = primeiro dispositivo)
      console.log('[SecuGen] Abrindo dispositivo USB (ID 0)...');
      result = SGFPM_OpenDevice(this.hFPM, 0);
      if (result !== SGFDX_ERROR_NONE) {
        this._terminate();
        throw new Error(`Falha ao abrir dispositivo: ${getErrorMessage(result)}`);
      }

      // 4. Habilitar Smart Capture (auto-ajuste de brilho)
      try {
        SGFPM_EnableSmartCapture(this.hFPM, 1);
        console.log('[SecuGen] Smart Capture ativado.');
      } catch (e) {
        console.warn('[SecuGen] Não foi possível ativar Smart Capture:', e.message);
      }

      // 5. Configurar formato de template para ISO19794
      result = SGFPM_SetTemplateFormat(this.hFPM, TEMPLATE_FORMAT_ISO19794);
      if (result !== SGFDX_ERROR_NONE) {
        console.warn(`[SecuGen] Aviso ao configurar formato de template: ${getErrorMessage(result)}`);
      }

      // 6. Obter informações do dispositivo
      const infoBuf = Buffer.alloc(56);
      result = SGFPM_GetDeviceInfo(this.hFPM, infoBuf);
      if (result === SGFDX_ERROR_NONE) {
        const info = koffi.decode(infoBuf, SGDeviceInfoParam);
        this.deviceInfo = {
          width: info.ImageWidth || 300,
          height: info.ImageHeight || 400,
          dpi: info.ImageDPI || 500,
          brightness: info.Brightness,
          contrast: info.Contrast,
          fwVersion: info.FWVersion
        };
        console.log(`[SecuGen] Sensor: ${this.deviceInfo.width}x${this.deviceInfo.height} @ ${this.deviceInfo.dpi} DPI`);
      } else {
        console.warn(`[SecuGen] Não foi possível obter info do dispositivo: ${getErrorMessage(result)}`);
        this.deviceInfo = { width: 300, height: 400, dpi: 500 };
      }

      this.deviceOpen = true;
      console.log('[SecuGen] ✅ Dispositivo inicializado e pronto para capturas!');

    } catch (error) {
      this.deviceOpen = false;
      this.deviceInfo = null;
      console.error('[SecuGen] ❌ Erro na inicialização:', error.message);
      throw error;
    }
  }

  // ---- Acender/apagar LED do leitor ----
  setLed(on) {
    if (!this.deviceOpen || this.hFPM === null) return;
    try {
      SGFPM_SetLedOn(this.hFPM, on ? 1 : 0);
    } catch (e) {
      // Alguns modelos não suportam controle de LED
    }
  }

  // ---- Captura COMPLETA: imagem + template ----
  // Tenta GetImageEx (com timeout), fallback para GetImage (bloqueante)
  // Retry automático em caso de timeout
  async captureFull(maxRetries = 3, timeoutMs = 10000) {
    await this.init();

    const width = this.deviceInfo.width;
    const height = this.deviceInfo.height;
    const imgBuffer = Buffer.alloc(width * height);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[SecuGen] Captura — tentativa ${attempt}/${maxRetries} (timeout: ${timeoutMs}ms)...`);

        // Acender LED para indicar que está pronto
        this.setLed(true);

        // Tentar GetImageEx com timeout
        const captureResult = SGFPM_GetImageEx(this.hFPM, imgBuffer, timeoutMs, null, 50);

        if (captureResult === SGFDX_ERROR_NONE) {
          console.log('[SecuGen] ✅ Imagem capturada com sucesso!');
          this.setLed(false);

          // Verificar qualidade da imagem
          const qualityBuf = Buffer.alloc(4);
          const qualityResult = SGFPM_GetImageQuality(this.hFPM, width, height, imgBuffer, qualityBuf);
          let imageQuality = 0;
          if (qualityResult === SGFDX_ERROR_NONE) {
            imageQuality = qualityBuf.readUInt32LE(0);
            console.log(`[SecuGen] Qualidade da imagem: ${imageQuality}`);
          }

          // Converter para BMP base64
          const bmpBase64 = rawToBmpBase64(imgBuffer, width, height);

          // Gerar template biométrico
          const maxTemplateSizeBuf = Buffer.alloc(4);
          SGFPM_GetMaxTemplateSize(this.hFPM, maxTemplateSizeBuf);
          const maxTemplateSize = maxTemplateSizeBuf.readUInt32LE(0);
          const templateBuffer = Buffer.alloc(maxTemplateSize);

          const fingerInfo = {
            FingerNumber: 1,
            ViewNumber: 1,
            ImpressionType: 0,  // Live-scan plain
            ImageQuality: imageQuality
          };

          console.log('[SecuGen] Gerando template biométrico...');
          const templateResult = SGFPM_CreateTemplate(this.hFPM, fingerInfo, imgBuffer, templateBuffer);
          if (templateResult !== SGFDX_ERROR_NONE) {
            throw new Error(`Falha ao gerar template: ${getErrorMessage(templateResult)}`);
          }

          const templateBase64 = templateBuffer.toString('base64');
          console.log('[SecuGen] ✅ Template gerado com sucesso!');

          return {
            success: true,
            template: templateBase64,
            imageData: bmpBase64,
            imageQuality,
            timestamp: new Date().toISOString()
          };
        }

        // Se timeout, tentar novamente
        if (captureResult === SGFDX_ERROR_TIME_OUT) {
          console.log(`[SecuGen] ⏱️ Timeout na tentativa ${attempt}. Coloque o dedo no leitor!`);
          lastError = new Error(`Timeout — coloque o dedo no leitor (tentativa ${attempt}/${maxRetries})`);
          lastError.code = SGFDX_ERROR_TIME_OUT;
          lastError.isTimeout = true;
          lastError.attempt = attempt;
          lastError.maxRetries = maxRetries;

          // Se não é a última tentativa, continuar
          if (attempt < maxRetries) {
            // Breve pausa antes de re-tentar
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
        } else {
          // Outro erro — não faz retry
          this.setLed(false);
          throw new Error(`Falha na captura: ${getErrorMessage(captureResult)}`);
        }

      } catch (error) {
        this.setLed(false);

        if (error.isTimeout && attempt < maxRetries) {
          continue;
        }

        // Se o dispositivo desconectou, marcar como fechado
        if (error.message && error.message.includes('Dispositivo não encontrado')) {
          this.deviceOpen = false;
        }

        throw error;
      }
    }

    // Esgotou todas as tentativas
    this.setLed(false);
    throw lastError || new Error('Falha na captura após todas as tentativas');
  }

  // ---- Matching 1:1 de templates ----
  async matchTemplate(template1Base64, template2Base64) {
    await this.init();

    try {
      const t1 = Buffer.from(template1Base64, 'base64');
      const t2 = Buffer.from(template2Base64, 'base64');

      const scoreBuf = Buffer.alloc(4);
      console.log('[SecuGen] Comparando digitais...');
      const result = SGFPM_GetMatchingScore(this.hFPM, t1, t2, scoreBuf);

      if (result !== SGFDX_ERROR_NONE) {
        throw new Error(`Falha na comparação: ${getErrorMessage(result)}`);
      }

      const score = scoreBuf.readUInt32LE(0);
      console.log(`[SecuGen] Match Score: ${score}`);
      return score;
    } catch (error) {
      console.error('[SecuGen] Erro na comparação:', error.message);
      throw error;
    }
    // NÃO fecha o dispositivo após matching — mantém aberto
  }

  // ---- Fechar dispositivo (apenas no shutdown) ----
  async close() {
    if (this.hFPM !== null) {
      try {
        this.setLed(false);
      } catch (e) { /* ignore */ }

      try {
        console.log('[SecuGen] Fechando dispositivo...');
        if (this.deviceOpen) {
          SGFPM_CloseDevice(this.hFPM);
        }
        SGFPM_Terminate(this.hFPM);
        console.log('[SecuGen] Dispositivo fechado.');
      } catch (error) {
        console.error('[SecuGen] Erro ao fechar:', error.message);
      } finally {
        this.hFPM = null;
        this.deviceOpen = false;
        this.deviceInfo = null;
      }
    }
  }

  // ---- Interno: terminar sem fechar dispositivo ----
  _terminate() {
    if (this.hFPM !== null) {
      try {
        SGFPM_Terminate(this.hFPM);
      } catch (e) { /* ignore */ }
      this.hFPM = null;
      this.deviceOpen = false;
    }
  }
}

// ============================================================
// Singleton global
// ============================================================
let secugenInstance = null;

export function getSecuGenInstance() {
  if (!secugenInstance) {
    secugenInstance = new SecuGenWrapper();
  }
  return secugenInstance;
}

export { sdkAvailable, getErrorMessage };
export default SecuGenWrapper;
