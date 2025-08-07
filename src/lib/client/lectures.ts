export async function createLectureFromText(
  content: string
): Promise<{ lectureId: string }> {
  const res = await fetch('/api/lectures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
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
  const res = await fetch('/api/lectures', { method: 'POST', body: form });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}
