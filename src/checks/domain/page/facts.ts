// What a browser visit measures on a draft page, as plain data for the pure rules (ADR 0044).

/** x, y, width, height in CSS px, page coordinates at scroll 0. */
export type Box = [number, number, number, number];
/** A painted colour, `#rrggbbaa` (alpha `ff` when opaque). */
export type Colour = string;
export type Landmark =
  | 'banner'
  | 'navigation'
  | 'main'
  | 'contentinfo'
  | 'complementary'
  | 'form'
  | 'search'
  | 'dialog'
  | 'region';

export type NodeStyle = {
  fontSize: number;
  fontWeight: number;
  /** px; `normal` counts as 1.2 × fontSize. */
  lineHeight: number;
  /** First family, lower case, unquoted. */
  fontFamily: string;
  textAlign: string;
  color: Colour;
  /** The node's own background colour. */
  background: Colour;
  /** What is painted behind the node: its own and its ancestors' backgrounds composited over white, opaque. */
  ground: Colour;
  backgroundImage: boolean;
  /** Top, right, bottom, left; 0 when the side's style is none or its colour is fully transparent. */
  border: [number, number, number, number];
  /** Colour of the widest visible side; '' when none. */
  borderColor: Colour;
  /** Top-left radius in px. */
  radius: number;
  /** '' when none, else the computed value. */
  shadow: string;
  position: string;
  display: string;
  overflowX: string;
  overflowY: string;
  textOverflow: string;
  /** -webkit-line-clamp; 0 when none. */
  lineClamp: number;
  objectFit: string;
  hyphens: string;
  /** SVG paint, `currentColor` resolved; '' when none or not an SVG element. */
  fill: Colour;
  stroke: Colour;
};

/**
 * Set on text blocks only: a non-inline element whose children are all inline. It counts the
 * block's whole inline content.
 */
export type TextFacts = {
  /** Whitespace collapsed. */
  chars: number;
  lines: number;
  /** Characters on the widest line: chars × widest line width ÷ sum of line widths (spike 2). */
  longest: number;
  /** The first 80 characters, whitespace collapsed. */
  sample: string;
};

export type FieldFacts = {
  control: 'input' | 'select' | 'textarea';
  /** The input type, lower case; 'select' or 'textarea' for those. */
  type: string;
  name: string;
  /** '' for password fields. */
  value: string;
  placeholder: string;
  /** `required` or aria-required=true. */
  required: boolean;
  /** aria-invalid=true. */
  invalid: boolean;
  autocomplete: string;
  /** How the field is named. */
  label: 'visible' | 'hidden' | 'aria' | 'placeholder' | 'none';
  labelText: string;
  /** Null unless label is 'visible'. */
  labelBox: Box | null;
  /** The aria-describedby and aria-errormessage targets, in order. */
  described: { text: string; box: Box | null; errorMessage: boolean }[];
  /** Node index of the nearest fieldset, role=group or role=radiogroup; -1 when none. */
  group: number;
  /** The group's legend or accessible name; '' when none. */
  groupName: string;
  /** Node index of the form; -1 when none. */
  form: number;
  /** A mark in the label text: `*` or "required" gives 'required'; "optional" gives 'optional'. */
  mark: 'required' | 'optional' | null;
};

export type ActionFacts = {
  kind: 'button' | 'link';
  /** Accessible name (Playwright's or the same rules: aria-labelledby, aria-label, text, title, alt). */
  name: string;
  /** Visible text. */
  text: string;
  /** The raw href attribute; null for buttons. */
  href: string | null;
  submit: boolean;
  disabled: boolean;
  /** aria-haspopup or aria-expanded is present. */
  menu: boolean;
  /** aria-current; null when absent. */
  current: string | null;
  /** Rendered lines of the visible label (line boxes grouped by top); 1 when it has none to measure. */
  lines: number;
};

export type ImageFacts = {
  natural: [number, number];
  /** Has width and height attributes, or a CSS aspect-ratio other than auto. */
  sized: boolean;
  alt: string | null;
  /** The current source is an SVG (`.svg` path or `data:image/svg+xml`). */
  vector: boolean;
};

export type FactNode = {
  /** Index of the parent in `nodes`; -1 when the parent is the walk's root (#root or body) or outside the cap. */
  parent: number;
  /** Element id: the node's own data-ks, else the nearest ancestor's; null outside any. */
  ks: string | null;
  ownKs: boolean;
  /** Lower case. */
  tag: string;
  /** The element's id attribute; null when absent. */
  domId: string | null;
  /** The explicit role attribute, if any. */
  role: string | null;
  /** 1–6 for h1–h6 or role=heading with aria-level; 0 when not a heading. */
  heading: number;
  /** The nearest landmark, the node itself included. */
  landmark: Landmark | null;
  box: Box;
  /** Visually hidden: a box of 1 px or less in a dimension, clipped to nothing, off the page, or cut away by an `overflow: hidden|clip` ancestor (ADR 0047). */
  hidden: boolean;
  style: NodeStyle;
  text: TextFacts | null;
  /** Only when overflow-x or overflow-y is hidden or clip: scrollWidth, clientWidth, scrollHeight, clientHeight. */
  scroll: [number, number, number, number] | null;
  field: FieldFacts | null;
  action: ActionFacts | null;
  image: ImageFacts | null;
  /** aria-busy=true. */
  busy: boolean;
  /** role status, alert or progressbar, or an aria-live value; null when none. */
  live: string | null;
};

export type FocusStop = {
  node: number;
  /** Some visible style differs from the unfocused element (computed style, or a pixel change when nothing computed changed). */
  changed: boolean;
  /** The indicator colour: outline, else box-shadow, else border when it changed; null when none. */
  ring: Colour | null;
  /** The ground just outside the node's box. */
  ringGround: Colour | null;
  /** The outline is the browser's own (`auto` style). */
  defaultRing: boolean;
  covered: 'none' | 'partly' | 'fully';
};

export type FixedBar = { node: number; edge: 'top' | 'bottom' | 'other'; height: number };

export type PageFacts = {
  viewport: [number, number];
  scrollWidth: number;
  bodyFontSize: number;
  /** Visible elements under #root (a draft) or body (a live page) in document order (w > 0, h > 0, visibility not hidden), at most FACTS_NODE_CAP. */
  nodes: FactNode[];
  truncated: boolean;
  /** Fixed and sticky elements, measured one viewport down the page. */
  fixed: FixedBar[];
  /** Tab order; empty when the pass did not run or failed. */
  focus: FocusStop[];
  /** The 390 visit only: the same page resized to REFLOW_VIEWPORT. */
  reflow: { scrollWidth: number; over: number[] } | null;
  /** Nodes newly clipped or overlapping after SPACING_OVERRIDE; null when the pass did not run or failed. */
  spacing: { clipped: number[]; overlapping: number[] } | null;
};

export type DeepFacts = {
  /** Short leaf texts made 3× longer, compared with the baseline. */
  longText: { clipped: number[]; over: number[] };
  /** Number-only texts replaced by LONG_NUMBER, compared with the baseline. */
  longNumber: { clipped: number[]; over: number[] };
  /** The 390 visit only, with reduced motion emulated. */
  motion: { running: number[]; autoplay: number[]; pause: boolean } | null;
  /** The 390 visit only: characters of visible text at LANDSCAPE_VIEWPORT and at 390×844, and whether html or body is rotated. */
  orientation: { landscape: number; portrait: number; rotated: boolean } | null;
  /** Pixel-sampled contrast of the nodes in `contrastUnsure`. */
  contrast: { node: number; ratio: number; large: boolean }[];
};

export const FACTS_NODE_CAP = 3000;
export const FOCUS_STOP_CAP = 60;
export const REFLOW_VIEWPORT = { width: 320, height: 568 } as const;
export const LANDSCAPE_VIEWPORT = { width: 844, height: 390 } as const;
/** The tablet width every check visits besides the phone and the laptop (ADR 0074): measured only. */
export const TABLET_VIEWPORT = { width: 768, height: 1024 } as const;
/** The widths only `--deep` visits, measured only (ADR 0073). */
export const DEEP_VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const;
/** WCAG 1.4.12. */
export const SPACING_OVERRIDE =
  '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
export const LONG_NUMBER = '-1,234,567,890.12';
