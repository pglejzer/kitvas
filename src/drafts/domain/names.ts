// Names inside a workspace: draft slugs, section ids, the files derived from them.

export const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** Lower-case words joined by single hyphens, starting with a letter. */
export const SECTION_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const isSlug = (value: string): boolean => SLUG.test(value);

/** `order-summary` becomes `OrderSummary`: the component and file name of a section. */
export const pascalCase = (id: string): string =>
  id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

export const versionFolder = (number: number): string => `v${number}`;
