// The editor's texts for a lens test in Node (plan 19, task 1). The page hands them to the script in
// `#edit-texts` (`client/studio/edit/texts.ts`), which a test has not; this stands in a document that
// holds only that block, with the texts the test reads, so a pin's words come out filled. Call it in
// the test file's body, before its first `text()`: the texts are read once, and each test file runs
// in its own process.

export function seedTexts(texts: Readonly<Record<string, string>>): void {
  const block = { textContent: JSON.stringify(texts) };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { getElementById: (id: string) => (id === 'edit-texts' ? block : null) },
  });
}

/** The English of the keys the lens's pins read, as `locales/en.json` has them. */
export const LENS_TEXTS: Readonly<Record<string, string>> = {
  'changes.you': 'You',
  'changes.claude': 'Claude',
  'checks.name.contrast': 'Text contrast is too low',
  'checks.name.target': 'The target is too small',
  'checks.name.colour': 'Colour is not in the kit',
  'lens.why.none': 'No reasons yet',
  'lens.change.both': 'You and Claude',
  'lens.change.value': '{label}: {before} → {after}',
  'lens.change.one': '{who} · {what}',
  'lens.change.many': '{who} · {count} changes',
  'lens.needsEdit': '{lens} needs Edit. Turn Edit on to use it.',
  'lens.left': '{left} more pins are not drawn: the canvas shows {max} at most.',
  'lens.design': 'Design',
  'lens.kit': 'Kit',
  'lens.checks': 'Checks',
  'lens.why': 'Why',
  'lens.changes': 'Changes',
};
