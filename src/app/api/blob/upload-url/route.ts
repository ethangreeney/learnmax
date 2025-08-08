import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await handleUpload({
      request: req,
      body,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60 * 60 * 24 * 7, // 7 days
        };
      },
      onUploadCompleted: async () => {
        // no-op: client will send resulting url to /api/lectures
      },
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to handle blob upload' },
      { status: 500 }
    );
  }
}


