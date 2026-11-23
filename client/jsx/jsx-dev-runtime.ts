// kitvas's JSX dev runtime. esbuild bundles it into every prototype in place of React's:
// it marks the elements written in the draft with their element id, then hands over to React.

import { Fragment, jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime';

/** Replaced at build time: "<file>:<line>:<column>" of a JSX element in the draft, to its id. */
declare const __KITVAS_IDS__: Record<string, string>;

type Source = { fileName?: string; lineNumber?: number; columnNumber?: number };
type Props = Record<string, unknown>;
type DevCall = (
  type: unknown,
  props: Props,
  key: unknown,
  isStatic: boolean,
  source?: Source,
  self?: unknown,
) => unknown;

const IDS: Record<string, string> = __KITVAS_IDS__;
const ATTRIBUTE = 'data-ks';
const react = reactJsxDEV as unknown as DevCall;

type Primitive = string | number | boolean | null;
type Usage = { id: string; component: string; props: Record<string, Primitive> };
type Scope = { __KITVAS_KIT__?: Record<string, unknown>; __KITVAS_USAGE__?: Map<string, Usage> };

/** Props that React or kitvas set, not the draft. */
const NOT_PROPS = new Set(['key', 'ref', ATTRIBUTE]);
/** Enough for any screen; a loop that runs away does not fill the page's memory. */
const USAGE_LIMIT = 5000;
const scope = globalThis as Scope;
let kitNames: Map<unknown, string> | undefined;

/** The export name of a kit component, once the entry has put the kit on `globalThis`. */
function kitName(type: unknown): string | undefined {
  if (!kitNames) {
    const kit = scope.__KITVAS_KIT__;
    if (!kit) return undefined;
    kitNames = new Map(Object.entries(kit).map(([name, value]) => [value, name]));
  }
  return kitNames.get(type);
}

/** Notes which kit component the draft rendered where, with which props, for the ds check. */
function recordUsage(id: string, type: unknown, props: Props): void {
  const component = kitName(type);
  if (component === undefined) return;
  const seen: Record<string, Primitive> = {};
  for (const [name, value] of Object.entries(props)) {
    if (NOT_PROPS.has(name) || value === undefined) continue;
    const plain =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    seen[name] = plain ? value : null;
  }
  scope.__KITVAS_USAGE__ ??= new Map();
  const store = scope.__KITVAS_USAGE__;
  const key = `${id} ${JSON.stringify(seen)}`;
  if (store.size < USAGE_LIMIT && !store.has(key)) store.set(key, { id, component, props: seen });
}

export { Fragment };

/**
 * A host element keeps the id as an attribute. A component gets it as a prop; one that forwards
 * its rest props puts it on its root node, where the id given by the draft wins over nothing.
 */
export const jsxDEV: DevCall = (type, props, key, isStatic, source, self) => {
  let marked = props;
  if (source?.fileName && type !== Fragment && props[ATTRIBUTE] === undefined) {
    const file = source.fileName.split('\\').join('/');
    const id = IDS[`${file}:${source.lineNumber}:${source.columnNumber}`];
    if (id !== undefined) {
      marked = { ...props, [ATTRIBUTE]: id };
      recordUsage(id, type, props);
    }
  }
  return react(type, marked, key, isStatic, source, self);
};
