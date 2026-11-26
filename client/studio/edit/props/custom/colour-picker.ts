// The colour panel under a "Custom" colour row (plan 19, task T5; spec goal 14; the owner's mock
// `docs/design/mocks/custom-picker-mock.html`): a saturation and brightness square, a hue and an
// alpha slider, the eyedropper where the browser has one, a field that takes `#rgb`, `#rrggbb`,
// `#rrggbbaa`, `rgb()` and `hsl()`, a percent field for the opacity, a contrast warning and the
// line "Off kit · nearest <token>". The skin may hold no gradient and no literal colour, so the
// square and both sliders are canvases painted here: colours are data. The canvas shows the colour
// while the pointer or a key moves (`onPreview`); a release, Enter or a blur writes it once;
// Escape puts the old value back and writes nothing (`gesture.ts`).

import type { TokenOption } from '../../../../../src/edit/index.ts';
import { iconButton } from '../../../ui/icon.ts';
import { text } from '../../texts.ts';
import { nearestToken } from '../kit-value.ts';
import { formatColour, type Hsva, hsvOf, readColour, rgbaOf } from './colour-math.ts';
import { el, field } from './dom.ts';
import { createGesture } from './gesture.ts';
import { type Editor, offKitLine } from './number-field.ts';

export type ColourPickerOptions = {
  label: string;
  /** The colour the picker starts at: the source's raw value, else what the element shows. */
  value: string | null;
  /** The raw value the source holds, `null` when it holds a token or nothing. */
  held: string | null;
  tokens: readonly TokenOption[];
  /** The words of a live check this colour would fail, `null` for none. */
  warn?(css: string): string | null;
  /** The colour now, or `null` to take the preview back. */
  onPreview(css: string | null): void;
  onPick(css: string): void;
  onUse(token: TokenOption): void;
  /** Escape: the old colour is back; the row closes the panel. */
  onCancel?(): void;
};

/** Where an unreadable start is drawn: a mid grey. */
const FALLBACK: Hsva = { h: 215, s: 0, v: 0.5, a: 1 };
/** The canvases' own pixels; CSS stretches them to the panel. */
const SQUARE = { w: 256, h: 132 };
const TRACK = { w: 256, h: 12 };

type Dropper = new () => { open(): Promise<{ sRGBHex: string }> };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function canvasOf(className: string, size: { w: number; h: number }): HTMLCanvasElement {
  const canvas = el('canvas', className);
  canvas.width = size.w;
  canvas.height = size.h;
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

function paintSquare(canvas: HTMLCanvasElement, hue: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.fillStyle = `hsl(${Math.round(hue)} 100% 50%)`;
  ctx.fillRect(0, 0, width, height);
  const white = ctx.createLinearGradient(0, 0, width, 0);
  white.addColorStop(0, 'rgb(255 255 255 / 1)');
  white.addColorStop(1, 'rgb(255 255 255 / 0)');
  ctx.fillStyle = white;
  ctx.fillRect(0, 0, width, height);
  const black = ctx.createLinearGradient(0, 0, 0, height);
  black.addColorStop(0, 'rgb(0 0 0 / 0)');
  black.addColorStop(1, 'rgb(0 0 0 / 1)');
  ctx.fillStyle = black;
  ctx.fillRect(0, 0, width, height);
}

function paintHue(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  for (let step = 0; step <= 6; step += 1) {
    gradient.addColorStop(step / 6, `hsl(${step * 60} 100% 50%)`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** The alpha track: a checker in the panel's own two tones, the colour fading in over it. */
function paintAlpha(canvas: HTMLCanvasElement, rgb: string, tones: [string, string]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const cell = height / 2;
  for (let x = 0; x < width / cell; x += 1) {
    for (let y = 0; y < 2; y += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? tones[0] : tones[1];
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, `rgb(${rgb} / 0)`);
  gradient.addColorStop(1, `rgb(${rgb} / 1)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** A part of the panel that is a slider: named, with a value in words, focusable. */
function slider(className: string, label: string): HTMLElement {
  const node = el('div', className);
  node.setAttribute('role', 'slider');
  node.setAttribute('aria-label', label);
  node.tabIndex = 0;
  return node;
}

export function colourPicker(options: ColourPickerOptions): Editor {
  const start = readColour(options.value ?? '');
  const origin: Hsva = start === null ? FALLBACK : hsvOf(start);
  const heldRgba = options.held === null ? null : readColour(options.held);
  /** The picker's own state: a grey keeps its hue while the person drags. */
  let hsva: Hsva = { ...origin };
  let touched = options.held !== null;

  const gesture = createGesture({
    value: heldRgba === null ? null : formatColour(heldRgba),
    preview: options.onPreview,
    write: options.onPick,
  });

  const root = el('div', 'props-colour k-pop');
  root.dataset.customEditor = '';

  const squareCanvas = canvasOf('props-cp-canvas', SQUARE);
  const square = slider('props-cp-square', text('props.colour.square'));
  const squareKnob = el('i', 'props-cp-knob');
  square.append(squareCanvas, squareKnob);

  const hueCanvas = canvasOf('props-cp-canvas', TRACK);
  const hue = slider('props-cp-track', text('props.colour.hue'));
  const hueKnob = el('i', 'props-cp-knob');
  hue.append(hueCanvas, hueKnob);
  hue.setAttribute('aria-valuemin', '0');
  hue.setAttribute('aria-valuemax', '360');

  const alphaCanvas = canvasOf('props-cp-canvas', TRACK);
  const alpha = slider('props-cp-track', text('props.colour.alpha'));
  const alphaKnob = el('i', 'props-cp-knob');
  alpha.append(alphaCanvas, alphaKnob);
  alpha.setAttribute('aria-valuemin', '0');
  alpha.setAttribute('aria-valuemax', '100');

  const tracks = el('div', 'props-cp-tracks');
  tracks.append(hue, alpha);
  const tools = el('div', 'props-cp-row');
  const dropper = (window as unknown as { EyeDropper?: Dropper }).EyeDropper;
  if ('EyeDropper' in window && dropper !== undefined) {
    const button = iconButton('pipette', text('props.colour.eyedropper'));
    button.addEventListener('click', () => {
      void new dropper()
        .open()
        .then((result) => {
          const picked = readColour(result.sRGBHex);
          if (picked === null) return;
          move({ ...hsvOf(picked, hsva.h), a: hsva.a });
          gesture.end();
        })
        .catch(() => undefined);
    });
    tools.append(button);
  }
  tools.append(tracks);

  const swatch = el('span', 'k-swatch props-cp-swatch');
  const value = field(
    'props-cp-input',
    'custom',
    text('props.colour.value', { property: options.label }),
    '',
  );
  value.dataset.editorFocus = '';
  value.autocomplete = 'off';
  value.spellcheck = false;
  const valueBox = el('div', 'k-field props-cp-field');
  valueBox.append(swatch, value);
  const percent = field('props-cp-input', 'custom-alpha', text('props.colour.alphaValue'), '');
  percent.inputMode = 'numeric';
  percent.autocomplete = 'off';
  const percentBox = el('div', 'k-field props-cp-field props-cp-pct');
  percentBox.append(percent, el('span', 'props-cp-unit', '%'));
  const fields = el('div', 'props-cp-row');
  fields.append(valueBox, percentBox);

  const problem = el('span', 'props-error');
  problem.setAttribute('role', 'status');
  problem.hidden = true;
  const warning = el('span', 'props-warn');
  warning.hidden = true;
  const line = offKitLine((token) => options.onUse(token));

  root.append(square, tools, fields, problem, warning, line.root);

  const tones = (): [string, string] | null => {
    if (!root.isConnected) return null;
    const style = getComputedStyle(root);
    const one = style.getPropertyValue('--st-color-raised-strong').trim();
    const two = style.getPropertyValue('--st-color-pop').trim();
    return one === '' || two === '' ? null : [one, two];
  };

  /** Shows the state; `typing` leaves the text field alone while the person types in it. */
  function draw(typing: 'value' | 'alpha' | null = null): void {
    const rgba = rgbaOf(hsva);
    const rgb = `${rgba.r} ${rgba.g} ${rgba.b}`;
    const css = formatColour(rgba);
    paintSquare(squareCanvas, hsva.h);
    paintHue(hueCanvas);
    const pair = tones();
    if (pair !== null) paintAlpha(alphaCanvas, rgb, pair);
    squareKnob.style.left = `${hsva.s * 100}%`;
    squareKnob.style.top = `${(1 - hsva.v) * 100}%`;
    squareKnob.style.background = `rgb(${rgb})`;
    hueKnob.style.left = `${(hsva.h / 360) * 100}%`;
    hueKnob.style.background = `hsl(${Math.round(hsva.h)} 100% 50%)`;
    alphaKnob.style.left = `${hsva.a * 100}%`;
    alphaKnob.style.background = `rgb(${rgb} / ${hsva.a})`;
    swatch.style.background = `rgb(${rgb} / ${hsva.a})`;
    square.setAttribute(
      'aria-valuetext',
      text('props.colour.squareValue', {
        saturation: Math.round(hsva.s * 100),
        brightness: Math.round(hsva.v * 100),
      }),
    );
    hue.setAttribute('aria-valuenow', String(Math.round(hsva.h)));
    hue.setAttribute(
      'aria-valuetext',
      text('props.colour.hueValue', { degrees: Math.round(hsva.h) }),
    );
    alpha.setAttribute('aria-valuenow', String(Math.round(hsva.a * 100)));
    alpha.setAttribute('aria-valuetext', `${Math.round(hsva.a * 100)}%`);
    if (typing !== 'value') value.value = touched || start !== null ? css : '';
    if (typing !== 'alpha') percent.value = String(Math.round(hsva.a * 100));
    const shown = touched || options.held !== null ? css : null;
    line.show(shown, shown === null ? null : nearestToken(shown, options.tokens));
    const words = shown === null ? null : (options.warn?.(shown) ?? null);
    warning.hidden = words === null;
    if (words !== null) warning.textContent = words;
  }

  function move(next: Hsva, typing: 'value' | 'alpha' | null = null): void {
    hsva = next;
    touched = true;
    problem.hidden = true;
    value.setAttribute('aria-invalid', 'false');
    gesture.move(formatColour(rgbaOf(hsva)));
    draw(typing);
  }

  /** Escape: the colour the picker opened with, the canvas shows the old value again. */
  function revert(): void {
    gesture.cancel();
    hsva = { ...origin };
    touched = options.held !== null;
    problem.hidden = true;
    value.setAttribute('aria-invalid', 'false');
    draw();
  }

  /** A drag with the pointer captured: every move previews, the release writes. */
  function drag(target: HTMLElement, at: (x: number, y: number) => void): void {
    const place = (event: PointerEvent): void => {
      const box = target.getBoundingClientRect();
      const x = box.width === 0 ? 0 : clamp01((event.clientX - box.left) / box.width);
      const y = box.height === 0 ? 0 : clamp01((event.clientY - box.top) / box.height);
      at(x, y);
    };
    target.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      target.focus();
      target.setPointerCapture(event.pointerId);
      place(event);
    });
    target.addEventListener('pointermove', (event) => {
      if (target.hasPointerCapture(event.pointerId)) place(event);
    });
    target.addEventListener('pointerup', (event) => {
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      gesture.end();
    });
    target.addEventListener('pointercancel', revert);
  }

  /** Arrow keys (Shift: ten steps) call `by(dx, dy)` in steps; the release of the key writes. */
  function keys(
    target: HTMLElement,
    vertical: boolean,
    by: (dx: number, dy: number) => void,
  ): void {
    target.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const step = event.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: vertical ? [0, step] : [step, 0],
        ArrowDown: vertical ? [0, -step] : [-step, 0],
      };
      const delta = arrows[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      by(delta[0], delta[1]);
    });
    target.addEventListener('keyup', (event) => {
      if (event.key.startsWith('Arrow')) gesture.end();
    });
  }

  drag(square, (x, y) => move({ ...hsva, s: x, v: 1 - y }));
  drag(hue, (x) => move({ ...hsva, h: Math.min(360, x * 360) }));
  drag(alpha, (x) => move({ ...hsva, a: Math.round(x * 100) / 100 }));
  keys(square, true, (dx, dy) =>
    move({ ...hsva, s: clamp01(hsva.s + dx / 100), v: clamp01(hsva.v + dy / 100) }),
  );
  keys(hue, false, (dx) => move({ ...hsva, h: Math.min(360, Math.max(0, hsva.h + dx)) }));
  keys(alpha, false, (dx) =>
    move({ ...hsva, a: clamp01(Math.round((hsva.a + dx / 100) * 100) / 100) }),
  );

  /** What the typed text means: a colour with no alpha of its own keeps the alpha set. */
  const typed = (): Hsva | null => {
    const read = readColour(value.value);
    if (read === null) return null;
    const own = /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$|^(?:rgba|hsla)\(|\//i.test(value.value.trim());
    return hsvOf({ ...read, a: own ? read.a : hsva.a }, hsva.h);
  };
  const commitValue = (): void => {
    if (value.value.trim() === '') return;
    const next = typed();
    if (next === null) {
      value.setAttribute('aria-invalid', 'true');
      problem.textContent = text('props.colour.invalid');
      problem.hidden = false;
      return;
    }
    move(next);
    gesture.end();
  };
  value.addEventListener('input', () => {
    const next = typed();
    if (next !== null) move(next, 'value');
  });
  value.addEventListener('change', commitValue);
  value.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitValue();
    }
  });
  const commitAlpha = (): void => {
    const number = Number(percent.value.trim());
    if (percent.value.trim() === '' || !Number.isFinite(number)) {
      percent.setAttribute('aria-invalid', 'true');
      return;
    }
    percent.setAttribute('aria-invalid', 'false');
    move({ ...hsva, a: clamp01(number / 100) });
    gesture.end();
  };
  percent.addEventListener('input', () => {
    const number = Number(percent.value.trim());
    if (percent.value.trim() !== '' && Number.isFinite(number)) {
      move({ ...hsva, a: clamp01(number / 100) }, 'alpha');
    }
  });
  percent.addEventListener('change', commitAlpha);
  percent.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitAlpha();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
      move({ ...hsva, a: clamp01(Math.round(hsva.a * 100 + step) / 100) });
    }
  });
  percent.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') gesture.end();
  });
  // Escape anywhere in the panel: the old value is back, nothing is written, the panel closes.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    revert();
    options.onCancel?.();
  });

  draw();
  // The alpha track reads the panel's tones, which it has only once it is in the page.
  requestAnimationFrame(() => draw());
  return {
    root,
    focus: () => value.focus(),
    hidden: (on) => {
      root.hidden = on;
      if (!on) draw();
    },
  };
}
