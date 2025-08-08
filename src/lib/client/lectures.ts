export async function createLectureFromText(
  content: string
): Promise<{ lectureId: string }> {
  let model: string | undefined;
  try { model = localStorage.getItem('ai:model') || undefined; } catch {}
  const res = await fetch('/api/lectures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, model }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export async function createLectureFromPdf(
  file: File
): Promise<{ lectureId: string }> {
  // Always use Blob direct upload to avoid server body limits
  // Request a client token and upload via SDK helper route
  const pathname = `uploads/${Date.now()}-${file.name}`;
  const tokenRes = await fetch('/api/blob/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: { pathname, callbackUrl: '', multipart: file.size > 5_000_000, clientPayload: null },
    }),
  });
  if (!tokenRes.ok) {
    const e = await tokenRes.json().catch(() => ({}));
    throw new Error(e.error || `Failed to init upload (${tokenRes.status})`);
  }
  const tokenData = await tokenRes.json();
  if (tokenData?.type !== 'blob.generate-client-token' || !tokenData?.clientToken) {
    throw new Error('Invalid upload token response');
  }
  // Use client-side SDK put with token
  const { put } = await import('@vercel/blob/client');
  const uploaded = await put(pathname, file, {
    access: 'public',
    token: tokenData.clientToken,
    contentType: file.type || 'application/pdf',
    multipart: file.size > 10_000_000,
  } as any);
  const body: any = { blobUrl: uploaded.url };
  try { const m = localStorage.getItem('ai:model'); if (m) body.model = m; } catch {}
  const res = await fetch('/api/lectures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export async function createLectureFromPdfVision(
  file: File
): Promise<{ lectureId: string }> {
  const form = new FormData();
  form.append('file', file);
  try { const m = localStorage.getItem('ai:model'); if (m) form.append('model', m); } catch {}
  const res = await fetch('/api/lectures/vision', { method: 'POST', body: form });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}
