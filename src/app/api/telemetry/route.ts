import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Swallow telemetry to avoid noisy logs; return 204 quickly
    // Optionally, this is where you'd forward to analytics
    await req.json().catch(() => ({}));
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
