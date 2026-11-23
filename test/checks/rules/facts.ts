// Builders of page facts and rule inputs for the rule tests: write only what a test is about.

import type {
  Box,
  FactNode,
  NodeStyle,
  PageFacts,
  PageReport,
  StatesInput,
  VisitInput,
} from '../../../src/checks/index.ts';

export const STYLE: NodeStyle = {
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 24,
  fontFamily: 'system-ui',
  textAlign: 'start',
  color: '#1a1a1aff',
  background: '#00000000',
  ground: '#ffffffff',
  backgroundImage: false,
  border: [0, 0, 0, 0],
  borderColor: '',
  radius: 0,
  shadow: '',
  position: 'static',
  display: 'block',
  overflowX: 'visible',
  overflowY: 'visible',
  textOverflow: 'clip',
  lineClamp: 0,
  objectFit: 'fill',
  hyphens: 'manual',
  fill: '',
  stroke: '',
};

type NodePart = Omit<Partial<FactNode>, 'style'> & { style?: Partial<NodeStyle> };

/** A visible block at the top left, 100 × 20, with no text, inside #root. */
export function node(part: NodePart = {}): FactNode {
  const { style, ...rest } = part;
  return {
    parent: -1,
    ks: null,
    ownKs: false,
    tag: 'div',
    domId: null,
    role: null,
    heading: 0,
    landmark: null,
    box: [0, 0, 100, 20] satisfies Box,
    hidden: false,
    text: null,
    scroll: null,
    field: null,
    action: null,
    image: null,
    busy: false,
    live: null,
    ...rest,
    style: { ...STYLE, ...style },
  };
}

/** A text block: `chars` characters on `lines` lines, the widest holding `longest`. */
export function text(sample: string, lines = 1, longest = sample.length): FactNode['text'] {
  return { chars: sample.length, lines, longest, sample: sample.slice(0, 80) };
}

/** Facts of a 390 × 844 page holding these nodes, with no pass run. */
export function page(nodes: FactNode[], part: Partial<PageFacts> = {}): PageFacts {
  return {
    viewport: [390, 844],
    scrollWidth: 390,
    bodyFontSize: 16,
    nodes,
    truncated: false,
    fixed: [],
    focus: [],
    reflow: null,
    spacing: null,
    ...part,
  };
}

export const REPORT: PageReport = {
  rendered: true,
  console: [],
  pageErrors: [],
  failedRequests: [],
  violations: [],
  usage: [],
  shot: true,
  facts: null,
  deep: null,
  contrastUnsure: [],
  craft: null,
};

type VisitPart = Omit<Partial<VisitInput>, 'seen' | 'report'> & {
  seen?: Partial<VisitInput['seen']>;
  report?: Partial<PageReport>;
};

/** The baseline state at the facts' width, no kit components, no screen kind. */
export function visit(facts: PageFacts, part: VisitPart = {}): VisitInput {
  const { seen, report, ...rest } = part;
  return {
    facts,
    catalog: [],
    screen: null,
    stateKind: 'baseline',
    ...rest,
    report: { ...REPORT, facts, ...report },
    seen: {
      state: 'filled',
      width: facts.viewport[0],
      ids: [],
      components: new Map(),
      ...seen,
    },
  };
}

/** The baseline visit and the other states' visits at one width. */
export function states(baseline: VisitInput, visits: VisitInput[]): StatesInput {
  return { width: baseline.seen.width, baseline, visits };
}
