// This utility isolates the 'pdf-parse' library to prevent build-time errors.
// It works by dynamically importing the library only when it's needed inside a function.

// Set environment guards before any potential import of pdf-parse/pdf.js
process.env.PDFJS_DISABLE_CREATE_OBJECT_URL = 'true';
process.env.PDFJS_WORKER_DISABLE = 'true';

interface PdfParseResult {
  numpages: number;
  text: string;
  info: any;
  metadata: any;
  version: string;
}

export async function parsePdfBuffer(buffer: Buffer): Promise<PdfParseResult> {
  // Dynamically import pdf-parse ONLY when this function is called.
  // This is the key to avoiding the Next.js build-time error.
  const pdf = (await import('pdf-parse')).default;
  const data = await pdf(buffer);
  return data;
}
