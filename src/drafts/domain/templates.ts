// Scaffolds kitvas writes into a new draft. Agents fill them in; they are working files in English.

import type { CraftSubject, Sketch } from './draft.ts';
import { SCREEN_KINDS } from './layout.ts';

const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/**
 * The starting TSX of one craft sketch; the sketcher agent rewrites it. It exports `${name}${sketch}`
 * (a component sketch also `${name}${sketch}Example`).
 */
export function sketchTemplate(name: string, sketch: Sketch, subject: CraftSubject): string {
  const id = `${name}${sketch}`;
  if (subject === 'component') {
    return [
      `// Sketch ${sketch} of the component ${name}. Replace the body; use kit components and tokens.`,
      '',
      `export type ${id}Props = { label?: string };`,
      '',
      `export function ${id}({ label = 'Example' }: ${id}Props) {`,
      `  return <div className="${kebab(name)}-${sketch.toLowerCase()}">{label}</div>;`,
      '}',
      '',
      `export function ${id}Example() {`,
      `  return <${id} label="Example" />;`,
      '}',
      '',
    ].join('\n');
  }
  const logo = subject === 'logo';
  const size = logo ? 128 : 24;
  return [
    `// Sketch ${sketch} of the ${subject} ${name}. Replace the shapes; keep currentColor and the props.`,
    `// viewBox: 0 0 ${size} ${size} (placeholder: set it to the grid of the kit's ${logo ? 'logo' : 'icons'})`,
    '',
    `export type ${id}Props = {`,
    '  size?: number;',
    '  /** Gives the graphic an accessible name; without it the graphic is hidden from assistive tech. */',
    '  title?: string;',
    ...(logo ? ["  tone?: 'colour' | 'mono';"] : []),
    '};',
    '',
    `export function ${id}({ size = ${size}, title${logo ? ", tone = 'colour'" : ''} }: ${id}Props) {`,
    '  return (',
    '    <svg',
    `      viewBox="0 0 ${size} ${size}"`,
    '      width={size}',
    '      height={size}',
    '      fill="currentColor"',
    ...(logo ? ['      data-craft-tone={tone}'] : []),
    '      aria-hidden={title === undefined ? true : undefined}',
    "      role={title === undefined ? undefined : 'img'}",
    '    >',
    '      {title === undefined ? null : <title>{title}</title>}',
    `      <rect x="4" y="4" width="${size - 8}" height="${size - 8}" />`,
    '    </svg>',
    '  );',
    '}',
    '',
  ].join('\n');
}

export const briefTemplate = (title: string): string =>
  [
    `# Brief: ${title}`,
    '',
    '## Goal',
    '',
    'What the screen must achieve, in one or two sentences.',
    '',
    '## Audience',
    '',
    'Who uses it and in what situation.',
    '',
    '## Content',
    '',
    'The real texts, numbers and items the screen shows.',
    '',
    '## Controls',
    '',
    'One line for each control: what it changes and where, its values and its default,',
    'what shows when nothing matches. Or that it leads out of the screen.',
    '',
    '## States',
    '',
    'Which states exist besides the filled one: empty, loading, error.',
    '',
  ].join('\n');

/** What the Goal of a craft brief asks for, and the sections between it and the example. */
const CRAFT_BRIEF: Record<CraftSubject, { goal: string; sections: [string, string][] }> = {
  logo: {
    goal: 'What the logo stands for and what it must say about the brand, in one or two sentences.',
    sections: [
      ['Name', 'The exact name, and whether the logo shows it as a word mark.'],
      [
        'Uses',
        'Where it appears and how small: a favicon, a header, on light and on dark grounds.',
      ],
    ],
  },
  icon: {
    goal: 'The thing or the action the icon stands for, in one sentence.',
    sections: [
      ['Uses', "Where it sits, at which sizes, and which of the kit's icons stand beside it."],
    ],
  },
  component: {
    goal: 'What the component is for and where it is used, in one or two sentences.',
    sections: [
      ['Content', 'The real texts, numbers and items its example shows.'],
      ['States', 'Which states it has: default, hover, focus, disabled, empty, loading, error.'],
    ],
  },
};

/** The brief of a craft draft: a logo, an icon or a component is no screen, so each has its own. */
export const craftBriefTemplate = (title: string, subject: CraftSubject): string => {
  const { goal, sections } = CRAFT_BRIEF[subject];
  const example = "What the person's example gives: its style and idea. It is never traced.";
  const parts: [string, string][] = [['Goal', goal], ...sections, ['Example', example]];
  return [
    `# Brief: ${title}`,
    '',
    ...parts.flatMap(([head, line]) => [`## ${head}`, '', line, '']),
  ].join('\n');
};

export const layoutTemplate = (title: string): string =>
  [
    `# Layout: ${title}`,
    '',
    '<!--',
    'Under the title, one line "Screen: <kind>"; some checks run only for some kinds.',
    `The kind is one of: ${SCREEN_KINDS.join(', ')}.`,
    'One "## <section-id>" heading per section, top to bottom.',
    'A section id is lower-case words joined by "-", for example "order-summary".',
    'Under each heading write two lines:',
    'Purpose: what the section is for',
    'Components: the kit components it uses, separated by commas',
    '-->',
    '',
    '## shared',
    '',
    '<!--',
    'Not a section. What every section needs to agree on: page width, grid gaps,',
    'and for each shared value (src/json/shared.json) the section that sets it and the sections',
    'that read it. Plain lines; agents read them as written.',
    '-->',
    '',
  ].join('\n');
