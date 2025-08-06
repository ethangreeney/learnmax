import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-extraction';

// Set the runtime to Node.js for server-side operations.
export const runtime = 'nodejs';
// Increase the timeout to handle large PDF files.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided. Please upload a single PDF.' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are accepted.' },
        { status: 400 }
      );
    }

    // Convert the uploaded file's data into a Node.js Buffer.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use the 'pdf-extraction' library to get text from the buffer.
    const data = await pdf(buffer);

    // The extracted text is in data.text.
    const text = (data.text || '').replace(/\s{2,}/g, ' ').trim();

    if (!text) {
      return NextResponse.json(
        { error: 'Could not extract text from the PDF. The file may only contain images.' },
        { status: 422 } // Unprocessable Entity
      );
    }

    return NextResponse.json({
      filename: file.name,
      pages: data.numpages,
      content: text,
    });

  } catch (e: any) {
    // Log the full error on the server for easier debugging.
    console.error('UPLOAD_PDF_ERROR:', e?.stack || e?.message || e);
    const errorMessage = e.message || 'An unknown error occurred during processing.';
    return NextResponse.json({ error: `Failed to process PDF: ${errorMessage}` }, { status: 500 });
  }
}
