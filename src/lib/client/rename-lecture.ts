export async function renameLecture(lectureId: string, title: string) {
  const res = await fetch(`/api/lectures/${lectureId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed (${res.status})`);
  }
  return res.json() as Promise<{
    ok: true;
    lecture: { id: string; title: string; starred: boolean };
  }>;
}

export async function starLecture(lectureId: string, starred: boolean) {
  const res = await fetch(`/api/lectures/${lectureId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ starred }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed (${res.status})`);
  }
  return res.json() as Promise<{
    ok: true;
    lecture: { id: string; title: string; starred: boolean };
  }>;
}
