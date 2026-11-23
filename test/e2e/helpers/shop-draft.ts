// What the /kitvas:compose agents would write for the `shop` draft with the Base kit: a brief, a
// layout of two sections, two states, and the files of each section. Version 2 changes the hero.
// Everything here must stay clean under all five checks: catalog components with catalog props
// only, `--kit-*` tokens only, real texts, a level 1 heading first, no plain controls.

export type SectionSource = {
  /** The section id of layout.md. */
  id: string;
  /** The component the section file exports, as `kitvas context` names it. */
  component: string;
  tsx: string;
  scss: string;
};

export const BRIEF = [
  '# Brief: Shop',
  '',
  '## Goal',
  '',
  'Let people who rent bikes see their latest orders and start a new one.',
  '',
  '## Audience',
  '',
  'Riders on a phone at a bike station, and the shop team at a desk.',
  '',
  '## Content',
  '',
  'Two orders: a city bike for 2 hours, paid, and a cargo bike for 1 day, waiting for payment.',
  '',
  '## States',
  '',
  'With orders: the two orders. No orders yet: a short note and a way to place the first one.',
  '',
].join('\n');

const layout = (heroComponents: string): string =>
  [
    '# Layout: Shop',
    '',
    '## hero',
    'Purpose: Say what the shop offers and start a new order.',
    `Components: ${heroComponents}`,
    '',
    '## orders',
    'Purpose: List the latest orders, or say that there are none yet.',
    'Components: Card, Stack, Heading, Text, Badge',
    '',
  ].join('\n');

export const LAYOUT_V1 = layout('Stack, Heading, Text, Button');
/** Version 2 shows a Badge in the hero instead of the second button. */
export const LAYOUT_V2 = layout('Stack, Heading, Text, Button, Badge');

export const STATE_IDS = ['filled', 'empty'];

export const STATES = `${JSON.stringify(
  {
    schemaVersion: 1,
    default: 'filled',
    states: [
      { id: 'filled', label: 'With orders' },
      { id: 'empty', label: 'No orders yet' },
    ],
  },
  null,
  2,
)}\n`;

const HERO_SCSS = [
  '.hero {',
  '  padding: var(--kit-space-xl) var(--kit-space-lg);',
  '',
  '  @media (min-width: 768px) {',
  '    padding: var(--kit-space-3xl) var(--kit-space-2xl);',
  '  }',
  '}',
  '',
].join('\n');

const ORDERS_SCSS = [
  '.orders {',
  '  margin: 0 var(--kit-space-lg) var(--kit-space-xl);',
  '',
  '  @media (min-width: 768px) {',
  '    margin: 0 var(--kit-space-2xl) var(--kit-space-3xl);',
  '  }',
  '}',
  '',
].join('\n');

const HERO_V1_TSX = [
  "import { Button, Heading, Stack, Text } from '@kit';",
  '',
  'export function Hero({ state }: { state: string }) {',
  "  const empty = state === 'empty';",
  '  return (',
  '    <Stack as="header" gap="md" className="hero">',
  '      <Heading level={1}>Bike Shop</Heading>',
  '      <Text>Rent a city bike or a cargo bike by the hour or by the day.</Text>',
  '      <Stack direction="row" gap="sm" wrap>',
  "        <Button>{empty ? 'Place a first order' : 'New order'}</Button>",
  '        <Button variant="outline">See prices</Button>',
  '      </Stack>',
  '    </Stack>',
  '  );',
  '}',
  '',
].join('\n');

/** The same tree with a new title and text, and a Badge where the outline button was. */
const HERO_V2_TSX = [
  "import { Badge, Button, Heading, Stack, Text } from '@kit';",
  '',
  'export function Hero({ state }: { state: string }) {',
  "  const empty = state === 'empty';",
  '  return (',
  '    <Stack as="header" gap="md" className="hero">',
  '      <Heading level={1}>City bikes to rent</Heading>',
  '      <Text>Pick a bike at a station near you and ride within ten minutes.</Text>',
  '      <Stack direction="row" gap="sm" align="center" wrap>',
  "        <Button>{empty ? 'Place a first order' : 'New order'}</Button>",
  '        <Badge tone="good">Open today until 22:00</Badge>',
  '      </Stack>',
  '    </Stack>',
  '  );',
  '}',
  '',
].join('\n');

const ORDERS_TSX = [
  "import { Badge, Card, Heading, Stack, Text } from '@kit';",
  '',
  'export function Orders({ state }: { state: string }) {',
  '  return (',
  '    <Card as="section" padding="lg" className="orders">',
  '      <Stack gap="md">',
  '        <Heading level={2}>Latest orders</Heading>',
  "        {state === 'empty' ? (",
  '          <Text>No orders yet. Place a first order and it shows up here.</Text>',
  '        ) : (',
  '          <Stack gap="sm">',
  '            <Stack direction="row" justify="between" align="center" wrap>',
  '              <Text>City bike, 2 hours</Text>',
  '              <Badge tone="good">Paid</Badge>',
  '            </Stack>',
  '            <Stack direction="row" justify="between" align="center" wrap>',
  '              <Text>Cargo bike, 1 day</Text>',
  '              <Badge tone="review">Waiting for payment</Badge>',
  '            </Stack>',
  '          </Stack>',
  '        )}',
  '      </Stack>',
  '    </Card>',
  '  );',
  '}',
  '',
].join('\n');

export const SECTIONS_V1: SectionSource[] = [
  { id: 'hero', component: 'Hero', tsx: HERO_V1_TSX, scss: HERO_SCSS },
  { id: 'orders', component: 'Orders', tsx: ORDERS_TSX, scss: ORDERS_SCSS },
];

export const HERO_V2: SectionSource = {
  id: 'hero',
  component: 'Hero',
  tsx: HERO_V2_TSX,
  scss: HERO_SCSS,
};

/** Names a section imports from `@kit`. */
export function kitImports(tsx: string): string[] {
  const clause = /import\s*\{([^}]*)\}\s*from\s*'@kit'/.exec(tsx)?.[1] ?? '';
  return clause
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/** `--kit-*` names a style sheet uses. */
export function tokensUsed(scss: string): string[] {
  return [...scss.matchAll(/var\(\s*(--kit-[A-Za-z0-9-]+)/g)].map((match) => match[1] ?? '');
}
