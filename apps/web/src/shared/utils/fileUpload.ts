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
    // Conversion failed — return original so upload still proceeds
    return file;
  }
}
