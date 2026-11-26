// Name helpers shared by `src/` and `client/`. Package-free: imports nothing.

/** `section-hero` as `SectionHero`: split on `-`, drop empty parts, capitalise each, join. */
export function pascal(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
