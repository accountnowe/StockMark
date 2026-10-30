/*
 * Receipt/bill reading for the expense analyzer.
 *
 * This runs Tesseract OCR in the browser: the image is rasterised to a canvas,
 * then recognised locally. The engine itself is fetched from a CDN on first use,
 * so the first scan needs a connection and takes a few seconds. No image ever
 * leaves the machine after that.
 */

const MAX_EDGE = 1600; // OCR accuracy plateaus above this and large photos get slow
const MIN_EDGE = 900;
const TESSERACT_OEM_LSTM = 1;

let workerPromise = null;

async function rasterize(file) {
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }

  if (!bitmap) {
    const url = URL.createObjectURL(file);
    try {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('That image could not be opened.'));
        img.src = url;
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  const sourceWidth = bitmap.width || bitmap.naturalWidth || 0;
  const sourceHeight = bitmap.height || bitmap.naturalHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    bitmap.close?.();
    throw new Error('The image has no readable size.');
  }

  const scale = Math.min(
    MAX_EDGE / Math.max(sourceWidth, sourceHeight),
    Math.max(1, MIN_EDGE / Math.min(sourceWidth, sourceHeight)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    context.filter = 'grayscale(1) contrast(1.35)';
  } catch {
    // Older canvas implementations ignore the filter; OCR still works on the raw pixels.
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

async function loadWorker(onStage) {
  if (!workerPromise) {
    workerPromise = (async () => {
      onStage?.('loading');
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng', TESSERACT_OEM_LSTM, {
        logger: (message) => {
          if (message?.status === 'recognizing text') onStage?.('reading', message.progress ?? 0);
          else if (message?.status === 'loading tesseract core' || message?.status === 'initializing api') onStage?.('loading', message.progress ?? 0);
          else if (message?.status === 'loading language traineddata') onStage?.('loading', message.progress ?? 0);
        },
      });
    })().catch((error) => {
      workerPromise = null;
      throw new Error('The text-reading engine could not be downloaded. Check your connection, or type the amounts instead.');
    });
  }
  return workerPromise;
}

/** Read an uploaded bill image and return its raw text plus an average word confidence (0–100). */
export async function scanReceipt(file, { onStage } = {}) {
  const worker = await loadWorker(onStage);
  onStage?.('preparing');
  const { dataUrl, width, height } = await rasterize(file);
  onStage?.('reading', 0);
  const { data } = await worker.recognize(dataUrl);
  onStage?.('done', 1);
  return {
    text: String(data?.text || ''),
    confidence: Number.isFinite(data?.confidence) ? Math.max(0, Math.min(100, data.confidence)) : 0,
    width,
    height,
  };
}

/** Free the WASM worker — call it when leaving the analyzer. */
export async function releaseReceiptEngine() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Nothing to clean up if the engine never finished loading.
  }
}
