// shadcn/ui's cn() joins class names. Written by hand here: the fixture has no packages.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
