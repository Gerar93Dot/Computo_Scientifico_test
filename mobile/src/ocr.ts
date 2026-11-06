import { createWorker } from "tesseract.js";
export async function recognize(file: File, progress: (value: number) => void) {
  if (!file.type.startsWith("image/"))
    throw Error("Selecciona una imagen JPG, PNG o WebP.");
  if (file.size > 20 * 1024 * 1024)
    throw Error("La imagen supera 20 MB. Elige una foto más pequeña.");
  const image = await createImageBitmap(file).catch(() => {
    throw Error("No se pudo abrir la imagen. Prueba con JPG o PNG.");
  });
  const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw Error("No se pudo preparar la imagen.");
  }
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const worker = await createWorker(["spa", "eng"], 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    logger: (m) => {
      if (m.status === "recognizing text")
        progress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
    canvas.width = canvas.height = 0;
  }
}
