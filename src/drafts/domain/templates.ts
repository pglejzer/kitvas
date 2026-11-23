// Scaffolds kitvas writes into a new draft. Agents fill them in; they are working files in English.

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
    '## States',
    '',
    'Which states exist besides the filled one: empty, loading, error.',
    '',
  ].join('\n');

export const layoutTemplate = (title: string): string =>
  [
    `# Layout: ${title}`,
    '',
    '<!--',
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
    'which section owns state that others use. Plain lines; agents read them as written.',
    '-->',
    '',
  ].join('\n');
