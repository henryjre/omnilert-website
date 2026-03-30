import heic2any from 'heic2any';

/**
 * Converts HEIC/HEIF files to JPEG so browsers can render them.
 * All other file types are returned unchanged.
 */
export async function normalizeFileForUpload(file: File): Promise<File> {
  if (!/\.(heic|heif)$/i.test(file.name)) return file;

  try {
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
  } catch {
    // Conversion failed, return original so upload can still proceed.
    return file;
  }
}

interface CompressImageOptions {
  maxBytes?: number;
  minQuality?: number;
  qualityStep?: number;
  scaleStep?: number;
  maxIterations?: number;
}

const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function getCompressedFilename(originalName: string, mimeType: string): string {
  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : 'jpg';
  return originalName.replace(/\.[^/.]+$/, '') + `.${ext}`;
}

function loadImage(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(objectUrl) });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

/**
 * Compresses a browser image file to fit within a target byte size.
 * If compression cannot reduce the file size, the original file is returned.
 */
export async function compressImageForUpload(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  const {
    maxBytes = 900 * 1024,
    minQuality = 0.55,
    qualityStep = 0.1,
    scaleStep = 0.85,
    maxIterations = 10,
  } = options;

  if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type)) return file;
  if (file.size <= maxBytes) return file;
  if (typeof document === 'undefined' || typeof URL === 'undefined') return file;

  const outputMimeType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const { image, revoke } = await loadImage(file);

  try {
    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;
    if (!width || !height) return file;

    let quality = 0.92;
    let bestBlob: Blob | null = null;

    for (let i = 0; i < maxIterations; i += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (bestBlob) {
          return new File([bestBlob], getCompressedFilename(file.name, outputMimeType), { type: outputMimeType });
        }
        return file;
      }

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, outputMimeType, quality);
      if (!blob) continue;

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= maxBytes) {
        return new File([blob], getCompressedFilename(file.name, outputMimeType), { type: outputMimeType });
      }

      if (quality > minQuality) {
        quality = Math.max(minQuality, quality - qualityStep);
        continue;
      }

      const nextWidth = Math.max(1, Math.floor(width * scaleStep));
      const nextHeight = Math.max(1, Math.floor(height * scaleStep));
      if (nextWidth === width && nextHeight === height) break;

      width = nextWidth;
      height = nextHeight;
      quality = 0.92;
    }

    if (bestBlob && bestBlob.size < file.size) {
      return new File([bestBlob], getCompressedFilename(file.name, outputMimeType), { type: outputMimeType });
    }

    return file;
  } finally {
    revoke();
  }
}
