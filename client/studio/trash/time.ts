// The time of a delete, in the person's own zone: the page writes it in UTC, which reads right
// without this script.

/** `2026-11-24T10:15:30.123Z` in the browser's locale and zone; `undefined` for a bad date. */
export function localTime(iso: string): string | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function localizeTimes(root: ParentNode): void {
  for (const node of root.querySelectorAll<HTMLTimeElement>('time[data-trash-time]')) {
    const local = localTime(node.dateTime);
    if (local !== undefined) node.textContent = local;
  }
}
