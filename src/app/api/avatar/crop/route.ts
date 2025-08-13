import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { put } from '@vercel/blob';

export const maxDuration = 60;
export const runtime = 'nodejs';

type CropArea = { x: number; y: number; width: number; height: number };

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = (session.user as any)?.id as string;
    const body = await req.json().catch(() => ({} as any));
    const sourceUrl = String(body?.sourceUrl || '');
    const area = body?.area as CropArea | undefined;
    const outputSize = Math.max(64, Math.min(1024, Number(body?.outputSize || 512)));

    if (!sourceUrl || !area) {
      return NextResponse.json({ error: 'Missing sourceUrl or area' }, { status: 400 });
    }
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid sourceUrl' }, { status: 400 });
    }
    const hostOk = /\.public\.blob\.vercel-storage\.com$/i.test(parsed.hostname);
    if (!hostOk) {
      return NextResponse.json({ error: 'Source must be a Vercel Blob public URL' }, { status: 400 });
    }
    // Path must include avatars/ and the current user id to prevent tampering
    if (!parsed.pathname.includes('/avatars/') || !parsed.pathname.includes(userId)) {
      return NextResponse.json({ error: 'Invalid source path' }, { status: 403 });
    }

    // Try dynamic import at runtime without bundler/module resolution
    let sharp: any;
    try {
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      sharp = (await dynamicImport('sharp')).default;
    } catch {
      return NextResponse.json(
        { error: 'GIF cropping not available on this deployment (sharp not installed)' },
        { status: 501 }
      );
    }

    const left = Math.max(0, Math.floor(Number(area.x)) || 0);
    const top = Math.max(0, Math.floor(Number(area.y)) || 0);
    const width = Math.max(1, Math.floor(Number(area.width)) || 1);
    const height = Math.max(1, Math.floor(Number(area.height)) || 1);

    // Fetch source with a timeout to avoid hanging the cropper UI
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(sourceUrl, { signal: controller.signal }).finally(() => clearTimeout(t));
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch source' }, { status: 400 });
    const buf = Buffer.from(await res.arrayBuffer());

    const meta = await sharp(buf, { animated: true }).metadata().catch(() => ({} as any));
    const frameDelay = Array.isArray((meta as any).delay) && (meta as any).delay.length ? (meta as any).delay : undefined;
    let out: Buffer;
    let ext: 'gif' | 'webp' = 'webp';

    try {
      // Prefer animated WebP for better performance and size; preserve frame delays
      out = await sharp(buf, { animated: true })
        .extract({ left, top, width, height })
        .resize(outputSize, outputSize, { fit: 'cover', fastShrinkOnLoad: true })
        .toFormat('webp', { quality: 85, effort: 3, loop: 0, delay: frameDelay as any })
        .toBuffer();
      ext = 'webp';
    } catch (e) {
      // Fallback to GIF; lower effort and preserve delays to avoid 1fps playback
      out = await sharp(buf, { animated: true })
        .extract({ left, top, width, height })
        .resize(outputSize, outputSize, { fit: 'cover', fastShrinkOnLoad: true })
        .toFormat('gif', { effort: 2, loop: 0, delay: frameDelay as any })
        .toBuffer();
      ext = 'gif';
    }

    const filename = ext === 'gif' ? `avatars/${userId}.gif` : `avatars/${userId}.webp`;
    const result = await put(filename, out, {
      access: 'public',
      allowOverwrite: true,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: ext === 'gif' ? 'image/gif' : 'image/webp',
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ url: result.url, ext });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to crop avatar' },
      { status: e?.status || 500 }
    );
  }
}


