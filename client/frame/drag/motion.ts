// A state switch with motion. Elements that kept their id glide from where they were seen to
// where they are laid out now (FLIP), new ones fade in. With less motion asked for, or too many
// changes, the prototype's root only fades. The arithmetic is in `flip.ts`.

import {
  type Box,
  EASING,
  type Entry,
  FADE_MS,
  MOTION_MS,
  motionKind,
  planMotion,
  prefersLessMotion,
  stepTransform,
} from './flip.ts';

/** Elements that make a box even when their `display` is inline. */
const REPLACED = new Set([
  'img',
  'video',
  'canvas',
  'iframe',
  'embed',
  'object',
  'svg',
  'input',
  'select',
  'textarea',
  'button',
]);

export type Motion = {
  /** Calls `render`, which must update the DOM before it returns, and animates the change. */
  change(render: () => void): Promise<void>;
};

const box = (element: Element): Box => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

/** The `[data-ks]` elements with a key that tells elements of one id apart: `<id>#<n>`. */
function keyed(): { element: Element; key: string }[] {
  const seen = new Map<string, number>();
  const list: { element: Element; key: string }[] = [];
  for (const element of document.querySelectorAll('[data-ks]')) {
    const id = element.getAttribute('data-ks') ?? '';
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    list.push({ element, key: `${id}#${count}` });
  }
  return list;
}

const around = (element: Element): Element | null =>
  element.parentElement?.closest('[data-ks]') ?? null;

/**
 * Elements a transform must not touch: a transformed element becomes the containing block of the
 * fixed and absolutely placed elements inside it, which would jump for the length of the motion.
 */
function pinnedBy(elements: Element[], styles: CSSStyleDeclaration[]): Set<Element> {
  const pinned = new Set<Element>();
  for (const [index, element] of elements.entries()) {
    const position = styles[index]?.position;
    let holder: Element | null = null;
    if (position === 'absolute') {
      if (!(element instanceof HTMLElement) || !element.offsetParent) continue;
      holder = element.offsetParent;
    } else if (position !== 'fixed') {
      continue;
    }
    for (let up = around(element); up && up !== holder; up = around(up)) {
      if (holder && !holder.contains(up)) break;
      pinned.add(up);
    }
  }
  return pinned;
}

/** A browser without one of these properties gives '' for it. */
const TRANSFORMS = ['transform', 'translate', 'rotate', 'scale'];

function isTransformed(style: CSSStyleDeclaration): boolean {
  return TRANSFORMS.some((name) => {
    const value = style.getPropertyValue(name);
    return value !== '' && value !== 'none';
  });
}

const lessMotion = (): boolean =>
  prefersLessMotion(typeof matchMedia === 'function' ? (query) => matchMedia(query) : undefined);

const transformable = (element: Element): boolean =>
  element instanceof HTMLElement || (element instanceof SVGSVGElement && !element.ownerSVGElement);

/** The entries `planMotion` needs, read from the page after the new state rendered. */
function entriesAfter(before: Map<string, Box>) {
  const list = keyed();
  const elements = list.map((item) => item.element);
  const styles = elements.map((element) => getComputedStyle(element));
  const pinned = pinnedBy(elements, styles);
  const index = new Map(elements.map((element, at) => [element, at]));
  const entries: Entry[] = list.map(({ element, key }, at) => {
    const style = styles[at];
    const parent = around(element);
    const kind = motionKind({
      display: style?.display ?? 'none',
      replaced: REPLACED.has(element.localName),
      transformable: transformable(element),
      transformed: style ? isTransformed(style) : true,
      pinned: pinned.has(element),
    });
    return {
      parent: parent ? (index.get(parent) ?? -1) : -1,
      first: before.get(key),
      last: box(element),
      kind,
    };
  });
  return { elements, styles, entries };
}

export function createMotion(): Motion {
  const running = new Set<Animation>();

  const play = (animation: Animation): Promise<void> => {
    running.add(animation);
    const done = (): void => {
      running.delete(animation);
    };
    // A cancelled animation rejects `finished`; for the motion it has simply ended.
    return animation.finished.then(done, done);
  };

  const stop = (): void => {
    for (const animation of running) animation.cancel();
    running.clear();
  };

  const fadeRoot = (): Promise<void> => {
    const root = document.getElementById('root') ?? document.body;
    const opacity = getComputedStyle(root).opacity;
    const timing = { duration: FADE_MS, easing: EASING };
    return play(root.animate([{ opacity: 0 }, { opacity }], timing));
  };

  return {
    change(render) {
      if (lessMotion()) {
        stop();
        render();
        return fadeRoot();
      }
      // Seen boxes, taken while an earlier motion still runs, so a new one starts from there.
      const before = new Map(keyed().map(({ element, key }) => [key, box(element)]));
      stop();
      render();
      const { elements, styles, entries } = entriesAfter(before);
      const plan = planMotion(entries);
      if (plan.crowded) return fadeRoot();
      const timing = { duration: MOTION_MS, easing: EASING };
      const played: Promise<void>[] = [];
      for (const { index, step } of plan.moves) {
        const keyframes = [
          { transform: stepTransform(step), transformOrigin: '0 0' },
          { transform: 'none', transformOrigin: '0 0' },
        ];
        const element = elements[index];
        if (element) played.push(play(element.animate(keyframes, timing)));
      }
      for (const index of plan.fades) {
        const element = elements[index];
        const opacity = styles[index]?.opacity ?? '1';
        if (element) played.push(play(element.animate([{ opacity: 0 }, { opacity }], timing)));
      }
      return Promise.all(played).then(() => undefined);
    },
  };
}
