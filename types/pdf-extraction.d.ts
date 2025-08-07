declare module 'pdf-extraction' {
  export interface PdfExtractionResult {
    text?: string;
    [key: string]: unknown;
  }
  type Input = Buffer | ArrayBuffer | Uint8Array;
  const pdf: (input: Input) => Promise<PdfExtractionResult>;
  export default pdf;
}
