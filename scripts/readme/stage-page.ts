// The part of a recording's stage that runs in the page: a pointer that glides, a line of words under
// the picture and a card for the first picture. Every part is made with DOM calls and style
// properties, so the studio's content policy stays as it is.

export type StageSetup = { logo: string; unit: number };

type InPage = {
  glide(x: number, y: number, ms: number): Promise<void>;
  press(): void;
  say(text: string, code: string): void;
  card(label: string | null): Promise<void>;
  write(text: string, perLetter: number): Promise<void>;
};

declare global {
  interface Window {
    kitvasStage?: InPage;
  }
}

/** Runs in the page. It names nothing outside itself: the browser gets its text alone. */
export function install(setup: StageSetup): void {
  if (window.top !== window || window.kitvasStage) return;
  const u = (value: number): string => `${value * setup.unit}px`;
  const tip = { x: (5.5 * 26 * setup.unit) / 24, y: (3.2 * 26 * setup.unit) / 24 };
  const copper = '#d9773a';
  const mono = "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace";
  let root: HTMLDivElement | null = null;
  let pointer: SVGSVGElement | null = null;
  let line: HTMLDivElement | null = null;
  let cover: HTMLDivElement | null = null;
  let typed: HTMLSpanElement | null = null;
  let layers = 0;
  let lineTimer = 0;
  const place = { x: -80, y: -80 };

  const paint = (el: HTMLElement | SVGElement, values: Record<string, string>): void => {
    for (const [name, value] of Object.entries(values)) el.style.setProperty(name, value);
  };
  const make = (values: Record<string, string>, text = ''): HTMLDivElement => {
    const el = document.createElement('div');
    paint(el, values);
    el.textContent = text;
    return el;
  };

  const stage = (): HTMLDivElement => {
    if (!root?.isConnected) {
      const font = getComputedStyle(document.body).fontFamily;
      root = make({
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        margin: '0',
        padding: '0',
      });
      paint(root, {
        border: '0',
        background: 'transparent',
        overflow: 'visible',
        'pointer-events': 'none',
      });
      paint(root, { 'font-family': font, color: '#ffffff' });
      root.popover = 'manual';
      document.body.append(root);
      root.showPopover();
      line = make({
        position: 'absolute',
        left: '50%',
        // Above the editor's ask bar, which keeps its place at any size of the page.
        bottom: '74px',
        opacity: '0',
        'text-align': 'center',
      });
      paint(line, {
        transform: 'translate(-50%, 8px)',
        transition: 'opacity 220ms ease, transform 220ms ease',
      });
      // Light on the dark studio, so nobody takes the words for a part of the product.
      paint(line, { background: '#ffffff', color: '#16181c' });
      paint(line, {
        'border-radius': u(12),
        padding: `${u(11)} ${u(22)}`,
        'font-size': u(19),
        'font-weight': '550',
      });
      paint(line, { 'box-shadow': '0 10px 30px rgba(0, 0, 0, 0.45)', 'white-space': 'nowrap' });
      pointer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      pointer.setAttribute('viewBox', '0 0 24 24');
      pointer.setAttribute('width', String(26 * setup.unit));
      pointer.setAttribute('height', String(26 * setup.unit));
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrow.setAttribute('d', 'M5.5 3.2v16.6l4.4-4.1 2.9 6.6 2.7-1.2-2.9-6.5h6.1z');
      arrow.setAttribute('fill', '#16181c');
      arrow.setAttribute('stroke', '#ffffff');
      arrow.setAttribute('stroke-width', '1.4');
      arrow.setAttribute('stroke-linejoin', 'round');
      pointer.append(arrow);
      paint(pointer, {
        position: 'absolute',
        left: '0',
        top: '0',
        'transform-origin': `${tip.x}px ${tip.y}px`,
      });
      paint(pointer, { filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45))' });
      root.append(line, pointer);
      put(place.x, place.y);
    }
    // A menu or a dialog opened after the stage would cover the pointer: go back on top of it.
    const open = document.querySelectorAll(':popover-open, dialog[open]').length;
    if (open !== layers) {
      root.hidePopover();
      root.showPopover();
      layers = open;
    }
    return root;
  };

  const put = (x: number, y: number): void => {
    place.x = x;
    place.y = y;
    if (pointer) paint(pointer, { transform: `translate(${x - tip.x}px, ${y - tip.y}px)` });
  };

  const fadeOut = (el: HTMLElement, ms: number): Promise<void> =>
    new Promise((done) => {
      paint(el, { transition: `opacity ${ms}ms ease`, opacity: '0' });
      setTimeout(() => {
        el.remove();
        done();
      }, ms + 40);
    });

  window.kitvasStage = {
    glide(x, y, ms) {
      stage();
      const from = { ...place };
      return new Promise((done) => {
        const start = performance.now();
        const step = (now: number): void => {
          const t = Math.min((now - start) / ms, 1);
          const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
          put(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
          if (t < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
    },
    press() {
      const ring = make({
        position: 'absolute',
        left: `${place.x}px`,
        top: `${place.y}px`,
        width: u(38),
        height: u(38),
      });
      paint(ring, {
        'border-radius': '50%',
        border: `${u(2)} solid ${copper}`,
        'box-sizing': 'border-box',
      });
      stage().append(ring);
      const grow = [
        { transform: 'translate(-50%, -50%) scale(0.25)', opacity: 0.95 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ];
      void ring
        .animate(grow, { duration: 440, easing: 'ease-out' })
        .finished.then(() => ring.remove());
      pointer?.animate([{ scale: 1 }, { scale: 0.86 }, { scale: 1 }], { duration: 200 });
    },
    say(text, code) {
      stage();
      const el = line;
      if (!el) return;
      clearTimeout(lineTimer);
      const show = (): void => {
        el.replaceChildren(make({}, text));
        if (code)
          el.append(
            make(
              { 'font-family': mono, 'font-size': u(15), 'font-weight': '500', color: '#a04a12' },
              code,
            ),
          );
        if (code) paint(el.lastElementChild as HTMLElement, { 'margin-top': u(5) });
        paint(el, { opacity: '1', transform: 'translate(-50%, 0)' });
      };
      const shown = el.style.opacity === '1';
      if (shown || text === '') paint(el, { opacity: '0', transform: 'translate(-50%, 8px)' });
      if (text !== '') lineTimer = window.setTimeout(show, shown ? 240 : 0);
    },
    async card(label) {
      const before = cover;
      cover = null;
      typed = null;
      if (label === null) {
        if (before) await fadeOut(before, 520);
        return;
      }
      const grounds = [document.body, document.documentElement].map(
        (el) => getComputedStyle(el).backgroundColor,
      );
      const ground = grounds.find((colour) => colour !== 'rgba(0, 0, 0, 0)') ?? '#0e0f11';
      const next = make({
        position: 'absolute',
        inset: '0',
        background: ground,
        display: 'flex',
        gap: u(24),
      });
      paint(next, {
        'flex-direction': 'column',
        'align-items': 'center',
        'justify-content': 'center',
      });
      const logo = document.createElement('img');
      logo.src = setup.logo;
      logo.alt = 'kitvas';
      paint(logo, { height: u(66), 'margin-bottom': u(8) });
      const words = make({ 'font-size': u(21), color: '#a9afb8', 'font-weight': '500' }, label);
      const box = make({
        'font-family': mono,
        'font-size': u(22),
        'line-height': '1.75',
        'white-space': 'pre',
      });
      paint(box, {
        background: '#1d2025',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        color: '#f2f3f5',
      });
      paint(box, {
        'border-radius': u(14),
        padding: `${u(20)} ${u(28)}`,
        'box-sizing': 'border-box',
      });
      paint(box, { 'min-width': u(1130) });
      const row = make({ display: 'flex', 'align-items': 'center' });
      typed = document.createElement('span');
      typed.textContent = '> ';
      // A caret after the prompt, for `write` to type behind.
      const caret = document.createElement('span');
      paint(caret, {
        display: 'inline-block',
        width: '0.55em',
        height: '1.15em',
        background: copper,
      });
      paint(caret, { 'margin-left': '2px', 'border-radius': '2px' });
      const blink = [
        { opacity: 1 },
        { opacity: 1, offset: 0.5 },
        { opacity: 0, offset: 0.51 },
        { opacity: 0 },
      ];
      caret.animate(blink, { duration: 1060, iterations: Number.POSITIVE_INFINITY });
      row.append(typed, caret);
      box.append(row);
      next.append(logo, words, box);
      stage().prepend(next);
      cover = next;
      before?.remove();
    },
    write(text, perLetter) {
      const target = typed;
      return new Promise((done) => {
        let index = 0;
        const next = (): void => {
          if (!target || index >= text.length) {
            done();
            return;
          }
          target.textContent += text[index] ?? '';
          index += 1;
          setTimeout(next, perLetter * (0.55 + Math.random() * 0.9));
        };
        next();
      });
    },
  };
}
