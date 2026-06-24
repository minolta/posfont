/** Runs OCR on a receipt image (English + Thai). Loads Tesseract lazily on first use. */
export async function recognizeReceiptImage(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng+tha', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return (data.text ?? '').trim();
  } finally {
    await worker.terminate();
  }
}
