// A link of a prototype leads out of its screen (R-CONTROL-13 of `reference/controls.md`): the
// address it names is no page the studio serves. Followed inside a card, it would put the studio's
// refusal in the prototype's place. So in the studio the frame keeps its page: a press on such a
// link loads nothing. A link to a place on the same page still scrolls there, and a page opened on
// its own, or by a check, follows its links as any page does.

/** What the guard reads of the element a press landed on. */
export type Pressed = {
  closest(selector: string): { getAttribute(name: string): string | null } | null;
};

/**
 * Whether the press is on a link that would load another document than `page`: any address but
 * `page`'s own, whatever its end after `#`. An address that cannot be read loads nothing.
 */
export function leadsOut(pressed: Pressed, page: string): boolean {
  const href = pressed.closest('a[href], area[href]')?.getAttribute('href');
  if (href === null || href === undefined) return false;
  try {
    const to = new URL(href, page);
    const from = new URL(page);
    to.hash = '';
    from.hash = '';
    return to.href !== from.href;
  } catch {
    return false;
  }
}

/**
 * Keeps the frame's page from here on. It listens before the page's own handlers and only takes
 * the browser's own answer away, so a link's `onClick` still runs.
 */
export function keepPage(): void {
  document.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && leadsOut(event.target, location.href)) {
        event.preventDefault();
      }
    },
    true,
  );
}
