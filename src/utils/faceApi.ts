import * as faceapi from 'face-api.js';

let modelsLoaded = false;

export const loadModels = async () => {
  if (modelsLoaded) return true;
  
  try {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    modelsLoaded = true;
    return true;
  } catch (e) {
    console.error("Erro ao carregar modelos face-api:", e);
    return false;
  }
};

// Captura um descritor de rosto (vetor de 128 floats)
export const getFaceDescriptor = async (videoElement: HTMLVideoElement): Promise<Float32Array | null> => {
  try {
    const loaded = await loadModels();
    if (!loaded) {
      console.error("Modelos não carregados.");
      return null;
    }
    
    // As vezes a engine trava se tentar ler num video não inicializado
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.error("Video element não está pronto.");
      return null;
    }

    // Adiciona um timeout de 10 segundos caso a biblioteca trave
    const detectionPromise = faceapi.detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 10000);
    });

    const detection = await Promise.race([detectionPromise, timeoutPromise]);
      
    if (detection) {
      return detection.descriptor;
    }
    return null;
  } catch (e) {
    console.error("Erro na detecção facial:", e);
    return null;
  }
};

// Compara 2 descritores. Retorna true se a distância euclidiana for menor que 0.45 (margem de segurança boa)
export const compareFaces = (descriptor1: Float32Array, descriptor2: Float32Array): boolean => {
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
  return distance < 0.45;
};
