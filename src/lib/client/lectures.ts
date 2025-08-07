export async function createLectureFromText(content: string): Promise<{ lectureId: string }> {
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

export async function createLectureFromPdf(file: File): Promise<{ lectureId: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/lectures', { method: 'POST', body: form });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export async function getExplanation(subtopicId: string, style: 'default'|'simplified'|'detailed'|'example'='default') {
  const res = await fetch('/api/explain-db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subtopicId, style }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json() as Promise<{ explanation: string }>;
}

export async function markMastery(subtopicId: string, eloDelta = 5) {
  const res = await fetch('/api/mastery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subtopicId, eloDelta }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}
