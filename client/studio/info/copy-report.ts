// The Doctor page's "Copy the report" button (`button[data-copy-from]`, markup of
// `src/studio/pages/info/doctor.ts`): a click puts the text of the element it names on the
// clipboard, and for a moment the button's label says "Copied". The report is also in its own box
// with a copy button, which `ui/copy.ts` works. The page works without this.

/** How long the label says it copied. */
export const LABEL_MS = 1400;

export function mountCopyReport(root: Document = document): void {
  const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-copy-from]');
    if (!(button instanceof HTMLElement)) return;
    const text = root.getElementById(button.dataset.copyFrom ?? '')?.textContent?.trim();
    if (text === undefined || text === '') return;
    const label = button.querySelector('[data-copy-label]');
    navigator.clipboard.writeText(text).then(
      () => {
        if (!label) return;
        clearTimeout(timers.get(button));
        label.textContent = button.dataset.textCopied ?? '';
        timers.set(
          button,
          setTimeout(() => {
            label.textContent = button.dataset.textLabel ?? '';
          }, LABEL_MS),
        );
      },
      () => {
        // Refused (no permission, an insecure page): the text is still there to select.
      },
    );
  });
}
