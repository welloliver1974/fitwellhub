// Redimensiona um arquivo de imagem para data URL JPEG comprimido — usado para
// enviar ao provedor de visão da IA (foto do prato e foto do rótulo).
// Browser-only (FileReader + Canvas): não testável em node.
// Extraído VERBATIM do bloco onPickPhoto de app.nutricao.tsx.

export async function resizeImageFileToDataUrl(
  file: File,
  opts?: { maxSize?: number; quality?: number },
): Promise<string> {
  const maxSize = opts?.maxSize ?? 800; // Resize to max 800px to save tokens and bandwidth
  const quality = opts?.quality ?? 0.7;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const r = new FileReader();
    r.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas não suportado"));
        ctx.drawImage(img, 0, 0, width, height);

        // Compress with JPEG at `quality`
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}