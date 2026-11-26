// The nodes of the Figma fake (`figma-fake.ts`): pages, frames and text, with the checks Figma makes
// when a script sets something. Paints, effects and the arrays that hold them come back locked:
// changing one in place throws, as Figma's frozen values do (a plain frozen object would only
// throw in strict code).

import {
  type Effect,
  type FontName,
  FRAME_FIELDS,
  type LayoutMode,
  type LayoutSizing,
  type LetterSpacing,
  type LineHeight,
  type Paint,
  type SceneNode,
  TEXT_FIELDS,
  type TextDecoration,
  type VariableAlias,
} from '../../client/figma/api.ts';

/** A variable of the fake, as the nodes bind it. */
export type BoundVariable = {
  readonly id: string;
  readonly resolvedType: string;
  /** Its value in its collection's default mode. */
  defaultValue(): unknown;
};

/** What the nodes need of the fake. */
export type FakeState = {
  nextId(): string;
  isLoaded(font: FontName): boolean;
  /** The fake's own variable, or a throw; null stays null. */
  variable(where: string, value: unknown): BoundVariable | null;
};

export type FakeNode = FakeFrame | FakeText;
export type FakeRange =
  | { start: number; end: number; fontName: FontName }
  | { start: number; end: number; fills: Paint[] }
  | { start: number; end: number; decoration: TextDecoration };
type Sides = [number, number, number, number];
type TextCase = 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
type TextAlign = 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
type AutoResize = 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';

export function fail(where: string, message: string): never {
  throw new Error(`in ${where}: ${message}`);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A deep copy of plain data. */
export const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const fontKey = (font: FontName): string => `${font.family} ${font.style}`;

/** The value behind a proxy that throws on every write, at every depth. */
export function locked<T>(value: T, what: string): T {
  if (typeof value !== 'object' || value === null) return value;
  const refuse = (): never => {
    throw new Error(`Cannot change ${what} in place: copy it, change the copy and assign the copy`);
  };
  return new Proxy(value, {
    get: (target, key, receiver) => locked(Reflect.get(target, key, receiver), what),
    set: refuse,
    defineProperty: refuse,
    deleteProperty: refuse,
  });
}

function allowKeys(where: string, path: string, value: object, keys: readonly string[]): void {
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  if (extra.length > 0) {
    const names = extra.map((key) => `'${key}'`).join(', ');
    fail(where, `Unrecognized key(s) in object: ${names} at ${path}`);
  }
}

function checkNumber(where: string, path: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(where, `Expected "${path}" to be a number, got ${String(value)}`);
  }
  return value;
}

/** A colour channel, an opacity or a gradient position: from 0 to 1. */
export function checkUnit(where: string, path: string, value: unknown): number {
  const number = checkNumber(where, path, value);
  if (number < 0 || number > 1) {
    fail(where, `Expected "${path}" to have a value from 0 to 1, got ${number}`);
  }
  return number;
}

function checkColor(where: string, path: string, value: unknown, alpha: boolean): void {
  if (!isRecord(value)) fail(where, `Expected "${path}" to be a colour`);
  const keys = alpha ? ['r', 'g', 'b', 'a'] : ['r', 'g', 'b'];
  allowKeys(where, path, value, keys);
  for (const key of keys) checkUnit(where, `${path}.${key}`, value[key]);
}

function checkTransform(where: string, path: string, value: unknown): void {
  const rows = Array.isArray(value) ? value : [];
  const ok =
    rows.length === 2 &&
    rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 3 &&
        row.every((cell) => typeof cell === 'number' && Number.isFinite(cell)),
    );
  if (!ok) fail(where, `Expected "${path}" to be a 2 x 3 matrix`);
}

const PAINT_KEYS = ['type', 'opacity', 'visible', 'blendMode'];
const SCALE_MODES = ['FILL', 'FIT', 'CROP', 'TILE'];

function checkStops(where: string, path: string, value: unknown): void {
  const stops = Array.isArray(value) ? value : [];
  if (stops.length < 2) fail(where, `Expected "${path}" to hold two stops or more`);
  stops.forEach((stop, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(stop)) fail(where, `Expected "${at}" to be a colour stop`);
    allowKeys(where, at, stop, ['position', 'color', 'boundVariables']);
    checkUnit(where, `${at}.position`, stop.position);
    checkColor(where, `${at}.color`, stop.color, true);
  });
}

export function checkPaint(where: string, path: string, value: unknown): Paint {
  if (!isRecord(value)) fail(where, `Expected "${path}" to be a paint`);
  if (value.opacity !== undefined) checkUnit(where, `${path}.opacity`, value.opacity);
  const visible = value.visible;
  if (visible !== undefined && typeof visible !== 'boolean') {
    fail(where, `Expected "${path}.visible" to be a boolean`);
  }
  const type = value.type;
  if (type === 'SOLID') {
    allowKeys(where, path, value, [...PAINT_KEYS, 'color', 'boundVariables']);
    checkColor(where, `${path}.color`, value.color, false);
  } else if (type === 'GRADIENT_LINEAR') {
    allowKeys(where, path, value, [...PAINT_KEYS, 'gradientTransform', 'gradientStops']);
    checkTransform(where, `${path}.gradientTransform`, value.gradientTransform);
    checkStops(where, `${path}.gradientStops`, value.gradientStops);
  } else if (type === 'IMAGE') {
    allowKeys(where, path, value, [...PAINT_KEYS, 'scaleMode', 'imageHash', 'scalingFactor']);
    const mode = value.scaleMode;
    if (typeof mode !== 'string' || !SCALE_MODES.includes(mode)) {
      fail(where, `Expected "${path}.scaleMode" to be one of ${SCALE_MODES.join(', ')}`);
    }
    const hash = value.imageHash;
    if (hash !== null && typeof hash !== 'string') {
      fail(where, `Expected "${path}.imageHash" to be a string or null`);
    }
  } else {
    fail(where, `Expected "${path}.type" to be SOLID, GRADIENT_LINEAR or IMAGE`);
  }
  return plain(value) as Paint;
}

export function checkPaints(where: string, value: unknown): Paint[] {
  if (!Array.isArray(value)) fail(where, 'Expected an array of paints');
  return value.map((paint, index) => checkPaint(where, `[${index}]`, paint));
}

const EFFECT_KEYS = ['type', 'color', 'offset', 'radius', 'spread', 'visible', 'blendMode'];

function checkEffect(where: string, path: string, effect: unknown): Effect {
  if (!isRecord(effect)) fail(where, `Expected "${path}" to be an effect`);
  if (effect.type !== 'DROP_SHADOW' && effect.type !== 'INNER_SHADOW') {
    fail(where, `Expected "${path}.type" to be DROP_SHADOW or INNER_SHADOW`);
  }
  allowKeys(where, path, effect, [...EFFECT_KEYS, 'showShadowBehindNode', 'boundVariables']);
  checkColor(where, `${path}.color`, effect.color, true);
  const offset = effect.offset;
  if (!isRecord(offset)) fail(where, `Expected "${path}.offset" to be { x, y }`);
  checkNumber(where, `${path}.offset.x`, offset.x);
  checkNumber(where, `${path}.offset.y`, offset.y);
  if (checkNumber(where, `${path}.radius`, effect.radius) < 0) {
    fail(where, `Expected "${path}.radius" to be 0 or more`);
  }
  if (effect.spread !== undefined) checkNumber(where, `${path}.spread`, effect.spread);
  if (typeof effect.visible !== 'boolean')
    fail(where, `Expected "${path}.visible" to be a boolean`);
  if (effect.blendMode !== 'NORMAL') fail(where, `Expected "${path}.blendMode" to be NORMAL`);
  return plain(effect) as Effect;
}

function checkEffects(where: string, value: unknown): Effect[] {
  if (!Array.isArray(value)) fail(where, 'Expected an array of effects');
  return value.map((effect, index) => checkEffect(where, `[${index}]`, effect));
}

/** The variables a list of paints is bound to. */
export function paintAliases(paints: readonly Paint[]): VariableAlias[] {
  return paints.flatMap((paint) =>
    paint.type === 'SOLID' && paint.boundVariables?.color ? [paint.boundVariables.color] : [],
  );
}

/** Takes `node` out of its parent's children. */
function detach(node: FakeNode): void {
  const owner = node.owner;
  if (owner === null) return;
  const index = owner.kids.indexOf(node);
  if (index >= 0) owner.kids.splice(index, 1);
  node.owner = null;
}

/** Moves `child` into `parent` at `index`, from wherever it was. */
function adopt(where: string, parent: FakePage | FakeFrame, child: unknown, index: number): void {
  if (!(child instanceof FakeFrame) && !(child instanceof FakeText)) {
    fail(where, 'Expected a node made in this file');
  }
  child.alive(where);
  if (index < 0 || index > parent.kids.length) fail(where, `Index ${index} is out of range`);
  for (let up: FakePage | FakeFrame | null = parent; up instanceof FakeFrame; up = up.owner) {
    if (up === child) fail(where, 'A node cannot be moved inside itself');
  }
  const wasHere = child.owner === parent;
  detach(child);
  const place = wasHere ? Math.min(index, parent.kids.length) : index;
  parent.kids.splice(place, 0, child);
  child.owner = parent;
}

/** Everything under `parent`, depth first. */
function descendants(parent: FakePage | FakeFrame): FakeNode[] {
  return parent.kids.flatMap((kid) =>
    kid instanceof FakeFrame ? [kid, ...descendants(kid)] : [kid],
  );
}

export class FakePage {
  readonly type = 'PAGE' as const;
  readonly id: string;
  readonly kids: FakeNode[] = [];
  #name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.#name = name;
  }

  get name(): string {
    return this.#name;
  }
  set name(value: string) {
    if (typeof value !== 'string') fail('set_name', 'Expected a string');
    this.#name = value;
  }
  get children(): readonly SceneNode[] {
    return [...this.kids];
  }
  appendChild(child: SceneNode): void {
    adopt('appendChild', this, child, this.kids.length);
  }
  findOne(test: (node: SceneNode) => boolean): SceneNode | null {
    return descendants(this).find((node) => test(node)) ?? null;
  }
  findAll(test?: (node: SceneNode) => boolean): SceneNode[] {
    return descendants(this).filter((node) => test === undefined || test(node));
  }
  setPluginData(): never {
    return fail('setPluginData', 'setPluginData is not available in use_figma');
  }
}

export class FakeScene {
  readonly id: string;
  owner: FakePage | FakeFrame | null = null;
  /** Field to the variable bound to it, by `setBoundVariable`. */
  readonly bindings = new Map<string, VariableAlias>();
  x = 0;
  y = 0;
  opacity = 1;
  visible = true;
  /** Figma's in-progress shimmer. */
  placeholder = false;
  protected readonly state: FakeState;
  protected ownName: string | null = null;
  #removed = false;
  #width: number;
  #height: number;
  #fills: Paint[];
  #positioning: 'AUTO' | 'ABSOLUTE' = 'AUTO';
  #sizing: [LayoutSizing, LayoutSizing];

  constructor(state: FakeState, size: [number, number], fills: Paint[], sizing: LayoutSizing) {
    this.state = state;
    this.id = state.nextId();
    this.#width = size[0];
    this.#height = size[1];
    this.#fills = fills;
    this.#sizing = [sizing, sizing];
  }

  alive(where: string): void {
    if (this.#removed) fail(where, `The node with id "${this.id}" does not exist`);
  }
  get removed(): boolean {
    return this.#removed;
  }
  get name(): string {
    return this.ownName ?? this.autoName();
  }
  set name(value: string) {
    this.alive('set_name');
    if (typeof value !== 'string') fail('set_name', 'Expected a string');
    this.ownName = value;
  }
  get parent(): FakePage | FakeFrame | null {
    return this.owner;
  }
  get width(): number {
    return this.#width;
  }
  get height(): number {
    return this.#height;
  }
  resize(width: number, height: number): void {
    this.alive('resize');
    const sides = [checkNumber('resize', 'width', width), checkNumber('resize', 'height', height)];
    if (sides.some((side) => side < 0.01)) {
      fail('resize', `Expected width and height to be at least 0.01, got ${width} x ${height}`);
    }
    this.#width = width;
    this.#height = height;
  }
  remove(): void {
    this.alive('remove');
    detach(this as unknown as FakeNode);
    this.drop();
  }
  /** Marks the node, and what is inside it, as removed. */
  drop(): void {
    this.#removed = true;
  }
  get fills(): readonly Paint[] {
    return locked(this.#fills, 'fills');
  }
  set fills(value: readonly Paint[]) {
    this.alive('set_fills');
    this.#fills = checkPaints('set_fills', value);
  }
  get layoutPositioning(): 'AUTO' | 'ABSOLUTE' {
    return this.#positioning;
  }
  set layoutPositioning(value: 'AUTO' | 'ABSOLUTE') {
    const where = 'set_layoutPositioning';
    this.alive(where);
    if (value !== 'AUTO' && value !== 'ABSOLUTE') fail(where, 'Expected AUTO or ABSOLUTE');
    if (value === 'ABSOLUTE' && !this.inAutoLayout()) {
      fail(where, 'ABSOLUTE can only be set on children of auto-layout frames');
    }
    this.#positioning = value;
  }
  get layoutSizingHorizontal(): LayoutSizing {
    return this.#sizing[0];
  }
  set layoutSizingHorizontal(value: LayoutSizing) {
    this.#sizing[0] = this.checkSizing('set_layoutSizingHorizontal', value);
  }
  get layoutSizingVertical(): LayoutSizing {
    return this.#sizing[1];
  }
  set layoutSizingVertical(value: LayoutSizing) {
    this.#sizing[1] = this.checkSizing('set_layoutSizingVertical', value);
  }
  get boundVariables(): Readonly<Record<string, VariableAlias | readonly VariableAlias[]>> {
    const own: Record<string, VariableAlias | VariableAlias[]> = Object.fromEntries(this.bindings);
    const fills = paintAliases(this.#fills);
    if (fills.length > 0) own.fills = fills;
    return locked(own, 'boundVariables');
  }
  setPluginData(): never {
    return fail('setPluginData', 'setPluginData is not available in use_figma');
  }

  protected autoName(): string {
    return 'Frame';
  }
  /** `HUG` is for text and auto-layout frames. */
  protected canHug(): boolean {
    return false;
  }
  protected inAutoLayout(): boolean {
    return this.owner instanceof FakeFrame && this.owner.layoutMode !== 'NONE';
  }
  /** Both sides back to FIXED, as Figma's `resize` does on a frame. */
  protected fixSizing(): void {
    this.#sizing = ['FIXED', 'FIXED'];
  }
  /** Binds or unbinds a field; the variable's value, or null when unbound. */
  protected bind(field: string, variable: unknown, expected: string): unknown {
    const where = 'setBoundVariable';
    this.alive(where);
    const found = this.state.variable(where, variable);
    if (found === null) {
      this.bindings.delete(field);
      return null;
    }
    if (found.resolvedType !== expected) {
      fail(where, `${field} takes a ${expected} variable, got ${found.resolvedType}`);
    }
    this.bindings.set(field, { type: 'VARIABLE_ALIAS', id: found.id });
    return found.defaultValue();
  }
  private checkSizing(where: string, value: unknown): LayoutSizing {
    this.alive(where);
    if (value !== 'FIXED' && value !== 'HUG' && value !== 'FILL') {
      fail(where, `Expected FIXED, HUG or FILL, got ${String(value)}`);
    }
    if (value === 'FILL' && !this.inAutoLayout()) {
      fail(where, 'FILL can only be set on children of auto-layout frames');
    }
    if (value === 'HUG' && !this.canHug()) {
      fail(where, 'HUG can only be set on auto-layout frames and text nodes');
    }
    return value;
  }
}

export class FakeFrame extends FakeScene {
  readonly type = 'FRAME' as const;
  readonly kids: FakeNode[] = [];
  /** The markup of a frame made by `createNodeFromSvg`. */
  readonly svg: string | null;
  layoutMode: LayoutMode;
  primaryAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' = 'MIN';
  counterAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE' = 'MIN';
  itemSpacing = 0;
  counterAxisSpacing: number | null = null;
  paddingTop = 0;
  paddingRight = 0;
  paddingBottom = 0;
  paddingLeft = 0;
  strokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER' = 'INSIDE';
  strokeTopWeight = 1;
  strokeRightWeight = 1;
  strokeBottomWeight = 1;
  strokeLeftWeight = 1;
  topLeftRadius = 0;
  topRightRadius = 0;
  bottomRightRadius = 0;
  bottomLeftRadius = 0;
  clipsContent: boolean;
  #strokes: Paint[] = [];
  #effects: Effect[] = [];
  #wrap: 'NO_WRAP' | 'WRAP' = 'NO_WRAP';

  constructor(
    state: FakeState,
    made: { mode: LayoutMode; fills: Paint[]; size: [number, number]; svg: string | null },
  ) {
    super(state, made.size, made.fills, made.mode === 'NONE' ? 'FIXED' : 'HUG');
    this.layoutMode = made.mode;
    this.svg = made.svg;
    this.clipsContent = made.mode === 'NONE' && made.svg === null;
  }

  override drop(): void {
    super.drop();
    for (const kid of this.kids) kid.drop();
  }
  /** As in Figma, a resized frame is FIXED on both sides: FILL and HUG come after the resize. */
  override resize(width: number, height: number): void {
    super.resize(width, height);
    this.fixSizing();
  }
  /** Figma's documented rule: wrapping is for horizontal auto layout only. */
  get layoutWrap(): 'NO_WRAP' | 'WRAP' {
    return this.#wrap;
  }
  set layoutWrap(value: 'NO_WRAP' | 'WRAP') {
    if (value !== 'NO_WRAP' && value !== 'WRAP') fail('set_layoutWrap', 'Expected NO_WRAP or WRAP');
    if (value === 'WRAP' && this.layoutMode !== 'HORIZONTAL') {
      fail('set_layoutWrap', 'WRAP can only be set on a horizontal auto-layout frame');
    }
    this.#wrap = value;
  }
  get children(): readonly SceneNode[] {
    return [...this.kids];
  }
  appendChild(child: SceneNode): void {
    this.alive('appendChild');
    adopt('appendChild', this, child, this.kids.length);
  }
  insertChild(index: number, child: SceneNode): void {
    this.alive('insertChild');
    adopt('insertChild', this, child, index);
  }
  findOne(test: (node: SceneNode) => boolean): SceneNode | null {
    return descendants(this).find((node) => test(node)) ?? null;
  }
  findAll(test?: (node: SceneNode) => boolean): SceneNode[] {
    return descendants(this).filter((node) => test === undefined || test(node));
  }
  get strokes(): readonly Paint[] {
    return locked(this.#strokes, 'strokes');
  }
  set strokes(value: readonly Paint[]) {
    this.alive('set_strokes');
    this.#strokes = checkPaints('set_strokes', value);
  }
  get strokeWeight(): number {
    return this.strokeTopWeight;
  }
  set strokeWeight(value: number) {
    checkNumber('set_strokeWeight', 'strokeWeight', value);
    this.strokeTopWeight = value;
    this.strokeRightWeight = value;
    this.strokeBottomWeight = value;
    this.strokeLeftWeight = value;
  }
  get effects(): readonly Effect[] {
    return locked(this.#effects, 'effects');
  }
  set effects(value: readonly Effect[]) {
    this.alive('set_effects');
    this.#effects = checkEffects('set_effects', value);
  }
  setBoundVariable(field: (typeof FRAME_FIELDS)[number], variable: unknown): void {
    if (!(FRAME_FIELDS as readonly string[]).includes(field)) {
      fail('setBoundVariable', `${String(field)} cannot be bound on a frame`);
    }
    const value = this.bind(field, variable, 'FLOAT');
    if (typeof value !== 'number') return;
    if (field === 'width') this.resize(value, this.height);
    else if (field === 'height') this.resize(this.width, value);
    else if (field === 'strokeWeight') this.strokeWeight = value;
    else if (field === 'counterAxisSpacing') this.counterAxisSpacing = value;
    else this[field] = value;
  }
  /** As plain data: padding and stroke weights `[top, right, bottom, left]`, radii from top left. */
  read() {
    const padding: Sides = [
      this.paddingTop,
      this.paddingRight,
      this.paddingBottom,
      this.paddingLeft,
    ];
    const weights: Sides = [
      this.strokeTopWeight,
      this.strokeRightWeight,
      this.strokeBottomWeight,
      this.strokeLeftWeight,
    ];
    const radii: Sides = [
      this.topLeftRadius,
      this.topRightRadius,
      this.bottomRightRadius,
      this.bottomLeftRadius,
    ];
    return {
      layoutMode: this.layoutMode,
      layoutWrap: this.layoutWrap,
      primaryAxisAlignItems: this.primaryAxisAlignItems,
      counterAxisAlignItems: this.counterAxisAlignItems,
      itemSpacing: this.itemSpacing,
      counterAxisSpacing: this.counterAxisSpacing,
      padding,
      strokes: plain(this.#strokes),
      strokeAlign: this.strokeAlign,
      strokeWeights: weights,
      radii,
      effects: plain(this.#effects),
      clipsContent: this.clipsContent,
      svg: this.svg,
    };
  }
  /** The variables the strokes are bound to. */
  strokeAliases(): VariableAlias[] {
    return paintAliases(this.#strokes);
  }

  protected override canHug(): boolean {
    return this.layoutMode !== 'NONE';
  }
}

/** Every property a script writes on a text node needs the node's font loaded first. */
export class FakeText extends FakeScene {
  readonly type = 'TEXT' as const;
  readonly ranges: FakeRange[] = [];
  #align: TextAlign = 'LEFT';
  #autoResize: AutoResize = 'WIDTH_AND_HEIGHT';
  #characters = '';
  #fontName: FontName = { family: 'Inter', style: 'Regular' };
  #fontSize = 12;
  #lineHeight: LineHeight = { unit: 'AUTO' };
  #letterSpacing: LetterSpacing = { unit: 'PERCENT', value: 0 };
  #textCase: TextCase = 'ORIGINAL';
  #decoration: TextDecoration = 'NONE';

  constructor(state: FakeState) {
    super(state, [0.01, 14], [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }], 'HUG');
  }

  get characters(): string {
    return this.#characters;
  }
  set characters(value: string) {
    this.requireFont('set_characters');
    if (typeof value !== 'string') fail('set_characters', 'Expected a string');
    this.#characters = value;
    this.ranges.length = 0;
  }
  get fontName(): FontName {
    return locked(this.#fontName, 'fontName');
  }
  set fontName(value: FontName) {
    const where = 'set_fontName';
    this.alive(where);
    if (!isRecord(value) || typeof value.family !== 'string' || typeof value.style !== 'string') {
      fail(where, 'Expected { family, style }');
    }
    const font = { family: value.family, style: value.style };
    this.requireLoaded(where, [font]);
    this.#fontName = font;
    // One font for the whole text: the ranges' own fonts are gone.
    const others = this.ranges.filter((range) => !('fontName' in range));
    this.ranges.splice(0, this.ranges.length, ...others);
  }
  get fontSize(): number {
    return this.#fontSize;
  }
  set fontSize(value: number) {
    this.requireFont('set_fontSize');
    if (checkNumber('set_fontSize', 'fontSize', value) < 1) {
      fail('set_fontSize', 'Expected a font size of 1 or more');
    }
    this.#fontSize = value;
  }
  get lineHeight(): LineHeight {
    return locked(this.#lineHeight, 'lineHeight');
  }
  set lineHeight(value: LineHeight) {
    this.requireFont('set_lineHeight');
    this.#lineHeight = plain(value);
  }
  get letterSpacing(): LetterSpacing {
    return locked(this.#letterSpacing, 'letterSpacing');
  }
  set letterSpacing(value: LetterSpacing) {
    this.requireFont('set_letterSpacing');
    this.#letterSpacing = plain(value);
  }
  get textCase(): TextCase {
    return this.#textCase;
  }
  set textCase(value: TextCase) {
    this.requireFont('set_textCase');
    this.#textCase = value;
  }
  get textDecoration(): TextDecoration {
    return this.#decoration;
  }
  set textDecoration(value: TextDecoration) {
    this.requireFont('set_textDecoration');
    this.#decoration = value;
  }
  // Figma's typings: setting either of these two needs the font loaded.
  get textAlignHorizontal(): TextAlign {
    return this.#align;
  }
  set textAlignHorizontal(value: TextAlign) {
    this.requireFont('set_textAlignHorizontal');
    this.#align = value;
  }
  get textAutoResize(): AutoResize {
    return this.#autoResize;
  }
  set textAutoResize(value: AutoResize) {
    this.requireFont('set_textAutoResize');
    this.#autoResize = value;
  }
  setRangeFontName(start: number, end: number, font: FontName): void {
    const where = 'setRangeFontName';
    this.alive(where);
    this.checkRange(where, start, end);
    const fontName = { family: font.family, style: font.style };
    this.requireLoaded(where, [fontName]);
    this.ranges.push({ start, end, fontName });
  }
  setRangeFills(start: number, end: number, fills: readonly Paint[]): void {
    const where = 'setRangeFills';
    this.alive(where);
    this.checkRange(where, start, end);
    this.ranges.push({ start, end, fills: checkPaints(where, fills) });
  }
  setRangeTextDecoration(start: number, end: number, decoration: TextDecoration): void {
    const where = 'setRangeTextDecoration';
    this.requireFont(where);
    this.checkRange(where, start, end);
    this.ranges.push({ start, end, decoration });
  }
  setBoundVariable(field: (typeof TEXT_FIELDS)[number], variable: unknown): void {
    const where = 'setBoundVariable';
    if (!(TEXT_FIELDS as readonly string[]).includes(field)) {
      fail(where, `${String(field)} cannot be bound on a text node`);
    }
    this.requireFont(where);
    const type = field === 'fontFamily' || field === 'fontStyle' ? 'STRING' : 'FLOAT';
    const value = this.bind(field, variable, type);
    if (typeof value !== 'number') return;
    if (field === 'fontSize') this.#fontSize = value;
    if (field === 'lineHeight') this.#lineHeight = { unit: 'PIXELS', value };
    if (field === 'letterSpacing') this.#letterSpacing = { unit: 'PIXELS', value };
  }
  /** The text as plain data. */
  read() {
    return {
      characters: this.#characters,
      fontName: plain(this.#fontName),
      fontSize: this.#fontSize,
      lineHeight: plain(this.#lineHeight),
      letterSpacing: plain(this.#letterSpacing),
      align: this.textAlignHorizontal,
      textCase: this.#textCase,
      decoration: this.#decoration,
      autoResize: this.textAutoResize,
      ranges: plain(this.ranges),
    };
  }

  protected override autoName(): string {
    return this.#characters === '' ? 'Text' : this.#characters;
  }
  protected override canHug(): boolean {
    return true;
  }
  /** Throws as Figma does when a font is not loaded. */
  private requireLoaded(where: string, fonts: readonly FontName[]): void {
    const missing = fonts.find((font) => !this.state.isLoaded(font));
    if (missing === undefined) return;
    const { family, style } = missing;
    throw new Error(
      `in ${where}: Cannot write to node with unloaded font "${fontKey(missing)}". Please call figma.loadFontAsync({ family: "${family}", style: "${style}" }) and await the returned promise first.`,
    );
  }
  /** The node's font and every font set on a range of it must be loaded. */
  private requireFont(where: string): void {
    this.alive(where);
    const set = this.ranges.flatMap((range) => ('fontName' in range ? [range.fontName] : []));
    this.requireLoaded(where, [this.#fontName, ...set]);
  }
  private checkRange(where: string, start: number, end: number): void {
    checkNumber(where, 'start', start);
    checkNumber(where, 'end', end);
    if (start < 0 || end > this.#characters.length || start >= end) {
      fail(where, `Expected 0 <= start < end <= ${this.#characters.length}`);
    }
  }
}
