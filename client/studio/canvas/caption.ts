// A card's caption keeps its size on the screen, so a narrow card at a small zoom has little room:
// the "Editing" mark must never push the card's name out (spec 4d, goal 8). The rule is pure over
// the widths of the caption's parts; the DOM part measures them and shows or hides the mark.

/** The room the card's name keeps beside the mark and the size, at least (px, caption units). */
export const MIN_NAME = 48;

export type CaptionWidths = {
  /** The caption's own width. */
  caption: number;
  /** The widths the parts want: the name as written, the mark, the size. */
  name: number;
  mark: number;
  size: number;
  /** The space between two parts. */
  gap: number;
};

/** Whether the mark fits without taking the name's room: the name keeps its text, or `MIN_NAME`. */
export function markFits(widths: CaptionWidths): boolean {
  const left = widths.caption - widths.mark - widths.size - 2 * widths.gap;
  return left >= Math.min(widths.name, MIN_NAME);
}

const watched = new WeakSet<Element>();

/** Measures one card's caption and shows its mark only when it fits. */
export function fitMark(figure: HTMLElement): void {
  const caption = figure.querySelector<HTMLElement>('.card-caption');
  const mark = caption?.querySelector<HTMLElement>('[data-card-mark]');
  const name = caption?.querySelector<HTMLElement>('.card-name');
  const size = caption?.querySelector<HTMLElement>('.card-size');
  if (!caption || !mark || !name || !size) return;
  // Measured as shown: a hidden mark has no width.
  mark.style.display = '';
  const gap = Number.parseFloat(getComputedStyle(caption).columnGap);
  const fits = markFits({
    caption: caption.clientWidth,
    name: name.scrollWidth,
    mark: mark.offsetWidth,
    size: size.offsetWidth,
    gap: Number.isFinite(gap) ? gap : 0,
  });
  mark.style.display = fits ? '' : 'none';
  if (watched.has(caption) || typeof ResizeObserver === 'undefined') return;
  watched.add(caption);
  new ResizeObserver(() => fitMark(figure)).observe(caption);
}
