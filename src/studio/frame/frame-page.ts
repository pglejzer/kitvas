// A draft's page as the prototype origin sends it (ADR 0082). The frame's script writes the root's
// `data-opt-<id>` attributes, but only once it has loaded and run; until then the browser paints
// the default value, so a page opened in a dark theme showed a light blank first. The root already
// carries what the script will write: the value the address asks for when the version has it, else
// the option's default. Every value comes from the version's options, checked by `OPTION_VALUE`,
// so nothing of the address is written as it was sent.

import { choiceFromQuery, type DraftOption, optionAttribute } from '../../shared/index.ts';

const ROOT_TAG = /<html\b/i;

/** `html` with the options' attributes on its root tag; as built when the version has none. */
export function pageWithChoice(
  html: string,
  options: readonly DraftOption[],
  query: { get(name: string): string | null },
): string {
  if (options.length === 0) return html;
  const choice = choiceFromQuery(options, query);
  const attributes = options
    .map((option) => ` ${optionAttribute(option.id)}="${choice[option.id] ?? option.default}"`)
    .join('');
  return html.replace(ROOT_TAG, (tag) => `${tag}${attributes}`);
}
