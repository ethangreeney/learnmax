import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { requireAdmin } from '@/lib/admin';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await handleUpload({
      request: req,
      body,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        // Lock down rank icon uploads to admins only
        if (typeof pathname === 'string' && pathname.startsWith('ranks/')) {
          await requireAdmin();
        }
        const isRankIcon = typeof pathname === 'string' && pathname.startsWith('ranks/');
        const isAvatar =
          typeof pathname === 'string' && pathname.startsWith('avatars/');
        const allowedImages = isAvatar
          ? ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
          : ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        return {
          allowedContentTypes: ['application/pdf', ...allowedImages],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
          // Ensure rank icon updates are immediately visible by using unique URLs
          addRandomSuffix: isRankIcon ? true : false,
          allowOverwrite: isRankIcon ? false : true,
          // With unique URLs for rank icons, we can safely cache them longer
          cacheControlMaxAge: isRankIcon ? 60 * 60 * 24 * 365 : 60 * 60 * 24 * 7,
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
