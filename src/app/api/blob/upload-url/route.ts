import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { requireAdmin } from '@/lib/admin';
import { requireSession } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const limit = rateLimit(
      rateLimitKey(req, 'blob-upload', userId),
      20,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many uploads. Please wait and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }

    const body = await req.json();
    const result = await handleUpload({
      request: req,
      body,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const normalizedPath = String(pathname || '');
        const isRankIcon = normalizedPath.startsWith('ranks/');
        const isAvatar = normalizedPath.startsWith(`avatars/${userId}.`);
        const isLecturePdf = normalizedPath.startsWith('uploads/');

        if (isRankIcon) {
          await requireAdmin();
        }
        if (!isRankIcon && !isAvatar && !isLecturePdf) {
          throw Object.assign(new Error('Upload path is not allowed.'), {
            status: 400,
          });
        }

        const allowedImages = [
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/gif',
        ];
        return {
          allowedContentTypes: isLecturePdf
            ? ['application/pdf']
            : allowedImages,
          maximumSizeInBytes: isLecturePdf
            ? 20 * 1024 * 1024
            : 12 * 1024 * 1024,
          // Ensure rank icon updates are immediately visible by using unique URLs
          addRandomSuffix: isRankIcon ? true : false,
          allowOverwrite: isRankIcon ? false : true,
          // With unique URLs for rank icons, we can safely cache them longer
          cacheControlMaxAge: isRankIcon
            ? 60 * 60 * 24 * 365
            : 60 * 60 * 24 * 7,
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
      { status: e?.status || 500 }
    );
  }
}
