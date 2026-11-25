// Source of the catalog bundle's entry: every example of a kit as a function, rendered one at a
// time into #root when the studio's frame asks for it (`?example=<key>`). `kitvas-example`
// (client/frame/page/example.ts) reads the key and reports the page's height to the studio.
// Example code comes from kit.json and is inserted as JSX text, so only code that already passed
// `exampleFunction` through the bundler's transform may be given to `catalogMountSource`. A kit with
// icons also gets the icon sheet (`icon-sheet.ts`) under its own key.

import { ICON_SHEET_KEY, type IconSheet, iconSheetSource } from './icon-sheet.ts';
import { type MountProvider, providerSource } from './provider-source.ts';

export type CatalogExample = { key: string; code: string };

export type CatalogMountInput = {
  providers: MountProvider[];
  /** Every component name of the catalog; a name the kit does not export is not a bundle error. */
  components: string[];
  examples: CatalogExample[];
  /** The kit's icons on one grid, shown for `?example=kitvas-icons`; absent without icons. */
  sheet?: IconSheet | undefined;
};

/**
 * kitvas's own frame chrome around the examples; the only raw sizes outside a kit. A modal
 * `<dialog>` is centred and capped to the frame by the browser, so in a short frame it would be
 * cut: here it starts at the top at full height, and the frame grows to fit it.
 */
export const CATALOG_BODY_RULE = [
  'body {',
  '  margin: 0;',
  '  padding: 16px;',
  '}',
  'dialog:modal {',
  '  inset-block-end: auto;',
  '  margin-block: 16px;',
  '  max-height: none;',
  '}',
  '',
].join('\n');

/** The catalog's sheet: the kit's tokens, the kit's styles, then the page rule. */
export const catalogCss = (tokensCss: string, kitCss: string): string =>
  [tokensCss, kitCss, CATALOG_BODY_RULE].join('\n');

/**
 * One example as a function component. The fragment sits on its own lines so a trailing `//` in
 * the code cannot swallow the closing tag. The parse check and the entry use this same text.
 */
export const exampleFunction = (name: string, code: string): string =>
  `function ${name}() {\n  return (<>\n${code}\n</>);\n}`;

/** The examples alone, as the entry writes them: the source a utility build reads class names from. */
export function examplesSource(examples: CatalogExample[]): string {
  const functions = examples.map((example, index) =>
    exampleFunction(`KitvasExample${index}`, example.code),
  );
  return `${functions.join('\n\n')}\n`;
}

export function catalogMountSource({
  providers,
  components,
  examples,
  sheet,
}: CatalogMountInput): string {
  const { imports, open, close } = providerSource(providers);
  const names = examples.map((_, index) => `KitvasExample${index}`);
  const entries = examples.map(
    (example, index) => `[${JSON.stringify(example.key)}, ${names[index]}]`,
  );
  const keys = examples.map((example) => example.key);
  if (sheet) {
    entries.push(`[${JSON.stringify(ICON_SHEET_KEY)}, KitvasIconSheet]`);
    keys.push(ICON_SHEET_KEY);
  }
  const lines = [
    "import { flushSync } from 'react-dom';",
    "import { createRoot } from 'react-dom/client';",
    "import { startExample } from 'kitvas-example';",
    "import * as Kit from '@kit';",
    "import { Component as ReactComponent } from 'react';",
    ...imports,
    '',
  ];
  // The entry is only bundled, never type-checked: the types below just keep the text valid TSX.
  if (components.length > 0) {
    lines.push(`const { ${components.join(', ')} } = Kit as Record<string, unknown>;`, '');
  }
  for (const [index, example] of examples.entries()) {
    lines.push(exampleFunction(names[index] ?? '', example.code), '');
  }
  if (sheet) lines.push(...iconSheetSource(sheet), '');
  lines.push(
    'let failed = false;',
    'class KitvasBoundary extends ReactComponent<{ children?: unknown }, { broken: boolean }> {',
    '  state = { broken: false };',
    '  static getDerivedStateFromError() {',
    '    return { broken: true };',
    '  }',
    '  componentDidCatch() {',
    '    failed = true;',
    '  }',
    '  render() {',
    '    return this.state.broken ? null : this.props.children;',
    '  }',
    '}',
    '',
    `const EXAMPLES: [string, () => unknown][] = [${entries.join(', ')}];`,
    "const element = document.getElementById('root');",
    'const root = element ? createRoot(element) : undefined;',
    'const render = (key: string): boolean => {',
    '  const entry = EXAMPLES.find((candidate) => candidate[0] === key);',
    '  if (!root || !entry) return false;',
    '  const KitvasShown = entry[1];',
    '  failed = false;',
    '  try {',
    `    flushSync(() => root.render(${open}<KitvasBoundary><KitvasShown /></KitvasBoundary>${close}));`,
    '  } catch {',
    '    return false;',
    '  }',
    '  return !failed;',
    '};',
    `startExample({ keys: ${JSON.stringify(keys)}, render });`,
    '',
  );
  return lines.join('\n');
}
