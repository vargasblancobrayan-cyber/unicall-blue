type CompressOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: "image/webp" | "image/jpeg";
};

export const maxOptimizedUploadBytes = 1024 * 1024;
export const heavyFileMessage = "Archivo muy pesado, intenta otro pantallazo.";

const defaultOptions: Required<CompressOptions> = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.66,
  mimeType: "image/webp"
};

function extensionFor(mimeType: string) {
  return mimeType === "image/jpeg" ? "jpg" : "webp";
}

function compressedName(file: File, mimeType: string) {
  const base = file.name.replace(/\.[^.]+$/, "") || "imagen";
  return `${base}-optimizada.${extensionFor(mimeType)}`;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No fue posible leer la imagen."));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No fue posible leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No fue posible procesar la imagen."));
    };
    image.src = url;
  });
}

export async function compressImageFile(file: File, options: CompressOptions = {}) {
  if (!file.type.startsWith("image/")) return file;

  const settings = { ...defaultOptions, ...options };
  const image = await loadImage(file);
  const ratio = Math.min(1, settings.maxWidth / image.width, settings.maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, settings.mimeType, settings.quality)
  );
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], compressedName(file, settings.mimeType), {
    type: settings.mimeType,
    lastModified: Date.now()
  });
}

export async function fileToOptimizedDataUrl(file: File, options: CompressOptions = {}) {
  const optimized = await compressImageFile(file, options);
  return {
    file: optimized,
    name: optimized.name,
    dataUrl: optimized.type.startsWith("image/") ? await blobToDataUrl(optimized) : await fileToDataUrl(optimized),
    originalSize: file.size,
    optimizedSize: optimized.size
  };
}
