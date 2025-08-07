declare module 'pdf-extraction' {
  export interface PdfExtractionResult {
    text?: string;
    [key: string]: unknown;
  }

  // Accept common binary inputs you pass in
  type Input = Buffer | ArrayBuffer | Uint8Array;

  const pdf: (input: Input) => Promise<PdfExtractionResult>;
  export default pdf;
}

