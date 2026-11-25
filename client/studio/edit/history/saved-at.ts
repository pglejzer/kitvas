// When a version was saved (plan 18f, task 3): the Changes pane's marker says "Version 4 · saved
// 11:40". The time is the version's `createdAt` from the studio's version route; no answer, or a
// time that does not read, gives `null` and the marker says only the version.

/** "11:40" in the person's own time; `null` for a text that is no date. */
export function clockOf(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The version's saving time as a clock; `null` when the studio did not say. */
export async function readSavedAt(slug: string, version: number): Promise<string | null> {
  try {
    const response = await fetch(`/api/v1/drafts/${encodeURIComponent(slug)}/versions/${version}`, {
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const body: unknown = await response.json().catch(() => undefined);
    if (typeof body !== 'object' || body === null || !('createdAt' in body)) return null;
    return typeof body.createdAt === 'string' ? clockOf(body.createdAt) : null;
  } catch {
    return null;
  }
}
