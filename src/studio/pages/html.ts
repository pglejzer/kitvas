// HTML from templates that escape every value, unless the value is HTML made here.

/** Text that is already HTML: made by `html` or `trusted` only. */
export class Html {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

function part(value: unknown): string {
  if (value instanceof Html) return value.text;
  if (Array.isArray(value)) return value.map(part).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let text = strings[0] ?? '';
  for (const [index, value] of values.entries()) {
    text += `${part(value)}${strings[index + 1] ?? ''}`;
  }
  return new Html(text);
}

/** Markup written in kitvas's own code, like a style sheet. Never for text from files or requests. */
export const trusted = (text: string): Html => new Html(text);
