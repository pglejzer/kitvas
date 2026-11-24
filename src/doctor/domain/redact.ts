// Takes what is private out of the finished report text, so a person can paste it into an issue.

export type RedactInput = {
  /** The home folder: written `~`. */
  home: string;
  /** The project folder: written `<project>`. */
  project: string;
};

/** The only hosts a report may name. */
const ALLOWED_HOSTS: readonly string[] = ['127.0.0.1', 'kitvas.localhost'];

/** Words of kitvas's own text that a user name must not be allowed to damage. */
const OWN_WORDS: readonly string[] = [
  'node',
  'kitvas',
  'user',
  'users',
  'admin',
  'root',
  'data',
  'home',
  'test',
  'drafts',
  'project',
  'plugin',
  'studio',
  'kit',
  'base',
];

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The ways a folder can be spelled in a text: as is, with `/`, with `\`, and as escaped JSON. */
function spellings(folder: string): string[] {
  const trimmed = folder.replace(/[\\/]+$/, '');
  const forward = trimmed.replace(/\\/g, '/');
  const backward = trimmed.replace(/\//g, '\\');
  const escaped = backward.replace(/\\/g, '\\\\');
  return [...new Set([trimmed, forward, backward, escaped])].filter((text) => text.length > 1);
}

/** Writes every spelling of each folder as its stand-in, the longer folder first. */
function replaceFolders(text: string, folders: readonly { path: string; as: string }[]): string {
  const ordered = [...folders].sort((a, b) => b.path.length - a.path.length);
  let result = text;
  for (const folder of ordered) {
    const names = spellings(folder.path).sort((a, b) => b.length - a.length);
    if (names.length === 0) continue;
    const pattern = new RegExp(names.map(escapeRegExp).join('|'), 'gi');
    result = result.replace(pattern, folder.as);
  }
  return result;
}

/** The last folder name of `home`: the account's name on every common system. */
function userName(home: string): string {
  const parts = home.split(/[\\/]+/).filter((part) => part !== '');
  return parts.at(-1) ?? '';
}

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 =
  /(?<![\w:])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?|::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?)(?![\w:])/gi;
const URL_HOST = /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:?#'"]+)/gi;
const EMAIL = /[^\s@'"<>]+@[^\s@'"<>]+\.[^\s@'"<>]+/g;
const LONG_TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g;
const HASH_KEY = /(?<![0-9a-f])[0-9a-f]{16}(?![0-9a-f])/g;
const ENV_VALUE = /\b([A-Z][A-Z0-9_]{2,})=\S+/g;
const DRAFT_SLUG = /(drafts[\\/]+)[^\\/\s'"`,;]+/gi;

/**
 * The text with the home folder as `~`, the project folder as `<project>`, and no user name, draft
 * slug, e-mail address, token, environment value or address beyond `127.0.0.1` and
 * `kitvas.localhost`.
 */
export function redact(text: string, input: RedactInput): string {
  let result = replaceFolders(text, [
    { path: input.project, as: '<project>' },
    { path: input.home, as: '~' },
  ]);
  const user = userName(input.home);
  if (user.length >= 4 && !OWN_WORDS.includes(user.toLowerCase())) {
    const name = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(user)}(?![A-Za-z0-9])`, 'gi');
    result = result.replace(name, '<user>');
  }
  result = result.replace(DRAFT_SLUG, '$1<draft>');
  result = result.replace(URL_HOST, (whole, scheme: string, host: string) =>
    ALLOWED_HOSTS.includes(host.toLowerCase()) ? whole : `${scheme}<host>`,
  );
  result = result.replace(EMAIL, '<email>');
  result = result.replace(IPV4, (address) => (address === '127.0.0.1' ? address : '<address>'));
  result = result.replace(IPV6, '<address>');
  result = result.replace(LONG_TOKEN, '<token>');
  result = result.replace(HASH_KEY, '<key>');
  result = result.replace(ENV_VALUE, '$1=<value>');
  return result;
}
