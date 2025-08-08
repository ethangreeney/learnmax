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
  const form = new FormData();
  form.append('file', file);
  try { const m = localStorage.getItem('ai:model'); if (m) form.append('model', m); } catch {}
  const res = await fetch('/api/lectures', { method: 'POST', body: form });
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
