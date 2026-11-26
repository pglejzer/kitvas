// A fake of the `figma` global that the hand-off's scripts run against (plan 21, Review Focus 1). It
// implements `FigmaApi` (`client/figma/api.ts`) and throws where Figma does: a colour channel over
// 1, an `a` in a solid paint's colour, text written before its font is loaded, `FILL` or
// `ABSOLUTE` outside an auto-layout parent, a second page switch in one call, a paint, an effect or
// a fills array changed in place, `WRAP` on a frame that is not horizontal, and the calls
// `use_figma` forbids; a resized frame is FIXED on both sides, as in Figma. `runScript` runs a
// script the way `use_figma` does: wrapped in an async function, here in `node:vm`; each run starts
// with no font loaded and one page switch left, and its return comes back as JSON.

import { createContext, Script } from 'node:vm';
import {
  type CodeSyntaxPlatform,
  type FigmaApi,
  type FontName,
  type LayoutSizing,
  type PageNode,
  type Paint,
  type SolidPaint,
  VARIABLE_SCOPES,
  type Variable,
  type VariableCollection,
  type VariableScope,
  type VariableType,
  type VariableValue,
} from '../../../client/figma/api.ts';
import {
  type BoundVariable,
  checkPaint,
  checkUnit,
  FakeFrame,
  type FakeNode,
  FakePage,
  type FakeState,
  FakeText,
  fail,
  fontKey,
  locked,
  paintAliases,
  plain,
} from './figma-fake-nodes.ts';

/** One node of the document as plain data. */
export type FakeNodeData = {
  id: string;
  type: 'FRAME' | 'TEXT';
  name: string;
  /** The parent's id: a page's for a node at the top of one. */
  parent: string;
  /** The page's name. */
  page: string;
  /** The children's ids, in order. */
  children: string[];
  box: [number, number, number, number];
  opacity: number;
  visible: boolean;
  /** Figma's in-progress shimmer is on. */
  placeholder: boolean;
  fills: Paint[];
  positioning: 'AUTO' | 'ABSOLUTE';
  sizing: [LayoutSizing, LayoutSizing];
  /** A field or a paint (`itemSpacing`, `fills.0`, `strokes.0`) to its variable's name. */
  bound: Record<string, string>;
  frame: ReturnType<FakeFrame['read']> | null;
  text: ReturnType<FakeText['read']> | null;
};

export type FakeDocument = {
  /** The current page's name. */
  currentPage: string;
  pages: { id: string; name: string; children: string[] }[];
  /** Every node on a page by its name, in the order they were made. */
  nodes: Record<string, FakeNodeData[]>;
  collections: { id: string; name: string; modes: string[]; variables: string[] }[];
  variables: {
    id: string;
    name: string;
    collection: string;
    type: VariableType;
    scopes: VariableScope[];
    codeSyntax: Partial<Record<CodeSyntaxPlatform, string>>;
    /** By mode name. */
    values: Record<string, VariableValue>;
  }[];
};

export type FakeCall = { name: string; args: unknown[] };

const WEIGHTS = ['Regular', 'Medium', 'Semi Bold', 'Bold'];
/** The fonts the fake has when none are given: Inter in four weights, upright and italic. */
export const FAKE_FONTS: FontName[] = WEIGHTS.flatMap((weight) => [
  { family: 'Inter', style: weight },
  { family: 'Inter', style: weight === 'Regular' ? 'Italic' : `${weight} Italic` },
]);

/** The scopes Figma takes for each type of variable. */
const SCOPES_OF: Record<VariableType, readonly VariableScope[]> = {
  COLOR: [
    'ALL_SCOPES',
    'ALL_FILLS',
    'FRAME_FILL',
    'SHAPE_FILL',
    'TEXT_FILL',
    'STROKE_COLOR',
    'EFFECT_COLOR',
  ],
  FLOAT: [
    'ALL_SCOPES',
    'TEXT_CONTENT',
    'CORNER_RADIUS',
    'WIDTH_HEIGHT',
    'GAP',
    'OPACITY',
    'STROKE_FLOAT',
    'EFFECT_FLOAT',
    'FONT_WEIGHT',
    'FONT_SIZE',
    'LINE_HEIGHT',
    'LETTER_SPACING',
    'PARAGRAPH_SPACING',
    'PARAGRAPH_INDENT',
  ],
  STRING: ['ALL_SCOPES', 'TEXT_CONTENT', 'FONT_FAMILY', 'FONT_STYLE'],
  BOOLEAN: ['ALL_SCOPES'],
};
const VARIABLE_TYPES: readonly string[] = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'];
const PLATFORMS: readonly string[] = ['WEB', 'ANDROID', 'iOS'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isScope = (text: string): text is VariableScope =>
  (VARIABLE_SCOPES as readonly string[]).includes(text);

/** Figma refuses a variable name that is empty or holds `.`, `{` or `}`. */
function checkVariableName(where: string, name: unknown): string {
  if (typeof name !== 'string' || name.trim() === '' || /[.{}]/.test(name)) {
    fail(where, `Invalid variable name ${JSON.stringify(name)}`);
  }
  return name;
}

/** A colour variable takes an `a`, unlike a paint's colour. */
function checkColorValue(where: string, value: unknown): VariableValue {
  if (!isRecord(value)) fail(where, 'Expected a colour { r, g, b, a }');
  const extra = Object.keys(value).filter((key) => !['r', 'g', 'b', 'a'].includes(key));
  if (extra.length > 0) fail(where, `Unrecognized key(s) in object: '${extra.join("', '")}'`);
  for (const key of ['r', 'g', 'b']) checkUnit(where, `value.${key}`, value[key]);
  if (value.a !== undefined) checkUnit(where, 'value.a', value.a);
  return plain(value) as VariableValue;
}

function checkValue(where: string, type: VariableType, value: unknown): VariableValue {
  if (isRecord(value) && value.type === 'VARIABLE_ALIAS' && typeof value.id === 'string') {
    return { type: 'VARIABLE_ALIAS', id: value.id };
  }
  if (type === 'COLOR') return checkColorValue(where, value);
  const kind = type === 'FLOAT' ? 'number' : type === 'STRING' ? 'string' : 'boolean';
  if (typeof value !== kind || (typeof value === 'number' && !Number.isFinite(value))) {
    fail(where, `Expected a ${type} value, got ${JSON.stringify(value)}`);
  }
  return plain(value) as VariableValue;
}

class FakeCollection {
  readonly id: string;
  removed = false;
  readonly #fake: FakeFigma;
  readonly #modes: { modeId: string; name: string }[];
  #name: string;

  constructor(fake: FakeFigma, id: string, name: string) {
    this.#fake = fake;
    this.id = id;
    this.#name = name;
    this.#modes = [{ modeId: `${id.split(':').at(-1) ?? '0'}:0`, name: 'Mode 1' }];
  }

  get name(): string {
    return this.#name;
  }
  set name(value: string) {
    if (typeof value !== 'string' || value.trim() === '') fail('set_name', 'Expected a name');
    this.#name = value;
  }
  get modes(): readonly { readonly modeId: string; readonly name: string }[] {
    return locked(this.#modes, 'modes');
  }
  get defaultModeId(): string {
    return this.#modes[0]?.modeId ?? '';
  }
  get variableIds(): readonly string[] {
    return this.#fake.variablesOf(this).map((variable) => variable.id);
  }
  modeName(modeId: string): string | undefined {
    return this.#modes.find((mode) => mode.modeId === modeId)?.name;
  }
  renameMode(modeId: string, name: string): void {
    const mode = this.#modes.find((each) => each.modeId === modeId);
    if (mode === undefined) fail('renameMode', `No mode with id "${modeId}"`);
    if (typeof name !== 'string' || name.trim() === '') fail('renameMode', 'Expected a name');
    mode.name = name;
  }
  remove(): void {
    this.removed = true;
  }
}

class FakeVariable implements BoundVariable {
  readonly id: string;
  readonly resolvedType: VariableType;
  readonly collection: FakeCollection;
  removed = false;
  readonly #values: Record<string, VariableValue> = {};
  readonly #syntax: Partial<Record<CodeSyntaxPlatform, string>> = {};
  #name: string;
  #scopes: VariableScope[] = ['ALL_SCOPES'];

  constructor(id: string, name: string, collection: FakeCollection, type: VariableType) {
    this.id = id;
    this.#name = name;
    this.collection = collection;
    this.resolvedType = type;
    const start: Record<VariableType, VariableValue> = {
      COLOR: { r: 0, g: 0, b: 0, a: 1 },
      FLOAT: 0,
      STRING: '',
      BOOLEAN: false,
    };
    this.#values[collection.defaultModeId] = start[type];
  }

  get name(): string {
    return this.#name;
  }
  set name(value: string) {
    this.#name = checkVariableName('set_name', value);
  }
  get variableCollectionId(): string {
    return this.collection.id;
  }
  get scopes(): readonly VariableScope[] {
    return locked(this.#scopes, 'scopes');
  }
  set scopes(value: readonly VariableScope[]) {
    const where = 'set_scopes';
    const list: unknown = value;
    if (!Array.isArray(list)) fail(where, 'Expected an array of scopes');
    const allowed = SCOPES_OF[this.resolvedType];
    this.#scopes = list.map((scope) => {
      if (typeof scope !== 'string' || !isScope(scope))
        fail(where, `Unknown scope ${String(scope)}`);
      if (!allowed.includes(scope)) {
        fail(where, `Invalid scope ${scope} for a ${this.resolvedType} variable`);
      }
      return scope;
    });
  }
  get valuesByMode(): Readonly<Record<string, VariableValue>> {
    return locked(this.#values, 'valuesByMode');
  }
  get codeSyntax(): Readonly<Partial<Record<CodeSyntaxPlatform, string>>> {
    return locked(this.#syntax, 'codeSyntax');
  }
  setValueForMode(modeId: string, value: VariableValue): void {
    const where = 'setValueForMode';
    if (this.collection.modeName(modeId) === undefined) fail(where, `No mode with id "${modeId}"`);
    this.#values[modeId] = checkValue(where, this.resolvedType, value);
  }
  setVariableCodeSyntax(platform: CodeSyntaxPlatform, value: string): void {
    const where = 'setVariableCodeSyntax';
    if (!PLATFORMS.includes(platform)) fail(where, `Unknown platform ${String(platform)}`);
    if (typeof value !== 'string') fail(where, 'Expected a string');
    this.#syntax[platform] = value;
  }
  remove(): void {
    this.removed = true;
  }
  defaultValue(): unknown {
    return this.#values[this.collection.defaultModeId];
  }
  /** As plain data, the values by mode name. */
  read(): FakeDocument['variables'][number] {
    const values: Record<string, VariableValue> = {};
    for (const [modeId, value] of Object.entries(this.#values)) {
      values[this.collection.modeName(modeId) ?? modeId] = plain(value);
    }
    return {
      id: this.id,
      name: this.#name,
      collection: this.collection.name,
      type: this.resolvedType,
      scopes: [...this.#scopes],
      codeSyntax: { ...this.#syntax },
      values,
    };
  }
}

class FakeVariables {
  readonly #fake: FakeFigma;

  constructor(fake: FakeFigma) {
    this.#fake = fake;
  }

  async getLocalVariableCollectionsAsync(): Promise<VariableCollection[]> {
    this.#fake.log('variables.getLocalVariableCollectionsAsync', []);
    return this.#fake.liveCollections();
  }
  async getLocalVariablesAsync(type?: VariableType): Promise<Variable[]> {
    this.#fake.log('variables.getLocalVariablesAsync', type === undefined ? [] : [type]);
    const all = this.#fake.liveVariables();
    return all.filter((variable) => type === undefined || variable.resolvedType === type);
  }
  async getVariableByIdAsync(id: string): Promise<Variable | null> {
    this.#fake.log('variables.getVariableByIdAsync', [id]);
    return this.#fake.liveVariables().find((variable) => variable.id === id) ?? null;
  }
  createVariableCollection(name: string): VariableCollection {
    this.#fake.log('variables.createVariableCollection', [name]);
    if (typeof name !== 'string' || name.trim() === '') {
      fail('createVariableCollection', 'Expected a name');
    }
    return this.#fake.addCollection(name);
  }
  createVariable(name: string, collection: VariableCollection, type: VariableType): Variable {
    const where = 'createVariable';
    this.#fake.log(`variables.${where}`, [name, collection?.id, type]);
    if (!(collection instanceof FakeCollection) || collection.removed) {
      fail(where, 'Expected a variable collection of this file, passed as itself');
    }
    if (!VARIABLE_TYPES.includes(type)) fail(where, `Unknown variable type ${String(type)}`);
    const checked = checkVariableName(where, name);
    if (this.#fake.variablesOf(collection).some((variable) => variable.name === checked)) {
      fail(where, `A variable named "${checked}" is already in this collection`);
    }
    return this.#fake.addVariable(checked, collection, type);
  }
  setBoundVariableForPaint(
    paint: SolidPaint,
    field: 'color',
    variable: Variable | null,
  ): SolidPaint {
    const where = 'setBoundVariableForPaint';
    this.#fake.log(`variables.${where}`, [field, variable?.id ?? null]);
    const checked = checkPaint(where, 'paint', paint);
    if (checked.type !== 'SOLID') fail(where, 'Only a solid paint can be bound to a colour');
    if (field !== 'color') fail(where, `Unknown field ${String(field)}`);
    const bound = this.#fake.state.variable(where, variable);
    const { boundVariables: _, ...rest } = checked;
    if (bound === null) return rest;
    if (bound.resolvedType !== 'COLOR') {
      fail(where, `Expected a COLOR variable, got ${bound.resolvedType}`);
    }
    return { ...rest, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: bound.id } } };
  }
}

class FakeDocumentNode {
  readonly type = 'DOCUMENT' as const;
  readonly #pages: FakePage[];

  constructor(pages: FakePage[]) {
    this.#pages = pages;
  }

  get children(): readonly PageNode[] {
    return [...this.#pages];
  }
}

class FakeFigma {
  readonly calls: FakeCall[] = [];
  readonly pages: FakePage[] = [];
  readonly root: FakeDocumentNode;
  readonly variables: FakeVariables;
  readonly state: FakeState;
  readonly #nodes: FakeNode[] = [];
  readonly #collections: FakeCollection[] = [];
  readonly #variables: FakeVariable[] = [];
  readonly #fonts: FontName[];
  readonly #loaded = new Set<string>();
  #counter = 1;
  #switches = 0;
  #current: FakePage;

  constructor(fonts: readonly FontName[]) {
    this.#fonts = fonts.map((font) => ({ family: font.family, style: font.style }));
    this.root = new FakeDocumentNode(this.pages);
    this.variables = new FakeVariables(this);
    this.state = {
      nextId: () => `1:${this.#counter++}`,
      isLoaded: (font) => this.#loaded.has(fontKey(font)),
      variable: (where, value) => {
        if (value === null) return null;
        if (!(value instanceof FakeVariable) || value.removed) {
          fail(where, 'Expected a variable of this file');
        }
        return value;
      },
    };
    this.#current = this.addPage('Page 1');
  }

  /** A new call of `use_figma`: no font loaded, one page switch left. */
  beginRun(): void {
    this.#loaded.clear();
    this.#switches = 0;
  }
  log(name: string, args: unknown[]): void {
    this.calls.push({ name, args });
  }

  get currentPage(): PageNode {
    return this.#current;
  }
  set currentPage(_page: PageNode) {
    this.log('currentPage', []);
    fail(
      'set_currentPage',
      'Setting figma.currentPage is not supported in use_figma: await figma.setCurrentPageAsync(page)',
    );
  }
  async setCurrentPageAsync(page: PageNode): Promise<void> {
    const where = 'setCurrentPageAsync';
    this.log(where, [page?.id]);
    if (!(page instanceof FakePage)) fail(where, 'Expected a page of this file');
    this.#switches += 1;
    if (this.#switches > 1) fail(where, 'A use_figma call switches the page at most once');
    this.#current = page;
  }
  createPage(): PageNode {
    this.log('createPage', []);
    return this.addPage(`Page ${this.pages.length + 1}`);
  }
  createFrame(): FakeFrame {
    this.log('createFrame', []);
    const white: Paint = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };
    const size: [number, number] = [100, 100];
    return this.place(new FakeFrame(this.state, { mode: 'NONE', fills: [white], size, svg: null }));
  }
  createAutoLayout(direction: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL'): FakeFrame {
    this.log('createAutoLayout', [direction]);
    if (direction !== 'HORIZONTAL' && direction !== 'VERTICAL') {
      fail('createAutoLayout', `Expected HORIZONTAL or VERTICAL, got ${String(direction)}`);
    }
    const size: [number, number] = [100, 100];
    return this.place(new FakeFrame(this.state, { mode: direction, fills: [], size, svg: null }));
  }
  createText(): FakeText {
    this.log('createText', []);
    return this.place(new FakeText(this.state));
  }
  createNodeFromSvg(svg: string): FakeFrame {
    this.log('createNodeFromSvg', [svg]);
    if (typeof svg !== 'string' || !/^\s*<svg[\s>][\s\S]*<\/svg>\s*$/.test(svg)) {
      fail('createNodeFromSvg', 'Failed to parse the SVG');
    }
    const side = (name: string): number => {
      const found = new RegExp(`\\s${name}="([\\d.]+)`).exec(svg)?.[1];
      return found === undefined ? 24 : Math.max(0.01, Number(found));
    };
    const size: [number, number] = [side('width'), side('height')];
    return this.place(new FakeFrame(this.state, { mode: 'NONE', fills: [], size, svg }));
  }
  async loadFontAsync(font: FontName): Promise<void> {
    this.log('loadFontAsync', [font]);
    if (!isRecord(font) || typeof font.family !== 'string' || typeof font.style !== 'string') {
      fail('loadFontAsync', 'Expected { family, style }');
    }
    const known = this.#fonts.some((each) => fontKey(each) === fontKey(font));
    if (!known) fail('loadFontAsync', `The font "${fontKey(font)}" could not be loaded`);
    this.#loaded.add(fontKey(font));
  }
  async listAvailableFontsAsync(): Promise<{ fontName: FontName }[]> {
    this.log('listAvailableFontsAsync', []);
    return this.#fonts.map((font) => ({ fontName: { ...font } }));
  }
  async getNodeByIdAsync(id: string): Promise<PageNode | FakeNode | null> {
    this.log('getNodeByIdAsync', [id]);
    const page = this.pages.find((each) => each.id === id);
    if (page !== undefined) return page;
    const live = (node: FakeNode): boolean => !node.removed && this.pageOf(node) !== undefined;
    return this.#nodes.find((node) => node.id === id && live(node)) ?? null;
  }
  // The calls `use_figma` forbids, so that a script that makes one fails as it would in Figma.
  notify(): never {
    return this.#forbidden('notify');
  }
  closePlugin(): never {
    return this.#forbidden('closePlugin');
  }
  createImageAsync(): never {
    return this.#forbidden('createImageAsync');
  }
  loadAllPagesAsync(): never {
    return this.#forbidden('loadAllPagesAsync');
  }

  addCollection(name: string): FakeCollection {
    const collection = new FakeCollection(this, `VariableCollectionId:1:${this.#counter++}`, name);
    this.#collections.push(collection);
    return collection;
  }
  addVariable(name: string, collection: FakeCollection, type: VariableType): FakeVariable {
    const variable = new FakeVariable(`VariableID:1:${this.#counter++}`, name, collection, type);
    this.#variables.push(variable);
    return variable;
  }
  liveCollections(): FakeCollection[] {
    return this.#collections.filter((collection) => !collection.removed);
  }
  liveVariables(): FakeVariable[] {
    return this.#variables.filter((variable) => !variable.removed && !variable.collection.removed);
  }
  variablesOf(collection: FakeCollection): FakeVariable[] {
    return this.liveVariables().filter((variable) => variable.collection === collection);
  }

  snapshot(): FakeDocument {
    const names = new Map(this.#variables.map((variable) => [variable.id, variable.name]));
    const nameOf = (id: string): string => names.get(id) ?? id;
    const nodes: Record<string, FakeNodeData[]> = {};
    for (const node of this.#nodes) {
      const page = this.pageOf(node);
      if (node.removed || page === undefined) continue;
      const data = this.readNode(node, page, nameOf);
      nodes[data.name] = [...(nodes[data.name] ?? []), data];
    }
    return {
      currentPage: this.#current.name,
      pages: this.pages.map((page) => ({
        id: page.id,
        name: page.name,
        children: page.kids.map((kid) => kid.id),
      })),
      nodes,
      collections: this.liveCollections().map((collection) => ({
        id: collection.id,
        name: collection.name,
        modes: collection.modes.map((mode) => mode.name),
        variables: this.variablesOf(collection).map((variable) => variable.name),
      })),
      variables: this.liveVariables().map((variable) => variable.read()),
    };
  }

  #forbidden(name: string): never {
    this.log(name, []);
    return fail(name, `figma.${name} is not available in use_figma`);
  }
  private addPage(name: string): FakePage {
    const page = new FakePage(`0:${this.#counter++}`, name);
    this.pages.push(page);
    return page;
  }
  /** A new node goes on the current page, as in Figma. */
  private place<T extends FakeNode>(node: T): T {
    this.#nodes.push(node);
    this.#current.appendChild(node);
    return node;
  }
  private pageOf(node: FakeNode): FakePage | undefined {
    let up = node.owner;
    while (up instanceof FakeFrame) up = up.owner;
    return up ?? undefined;
  }
  private readNode(node: FakeNode, page: FakePage, nameOf: (id: string) => string): FakeNodeData {
    const bound: Record<string, string> = {};
    for (const [field, alias] of node.bindings) bound[field] = nameOf(alias.id);
    const fills = plain([...node.fills]);
    const mark = (list: string, paints: readonly Paint[]): void => {
      paints.forEach((paint, index) => {
        const alias = paintAliases([paint])[0];
        if (alias !== undefined) bound[`${list}.${index}`] = nameOf(alias.id);
      });
    };
    mark('fills', fills);
    if (node instanceof FakeFrame) mark('strokes', node.read().strokes);
    return {
      id: node.id,
      type: node.type,
      name: node.name,
      parent: node.owner?.id ?? page.id,
      page: page.name,
      children: node instanceof FakeFrame ? node.kids.map((kid) => kid.id) : [],
      box: [node.x, node.y, node.width, node.height],
      opacity: node.opacity,
      visible: node.visible,
      placeholder: node.placeholder,
      fills,
      positioning: node.layoutPositioning,
      sizing: [node.layoutSizingHorizontal, node.layoutSizingVertical],
      bound,
      frame: node instanceof FakeFrame ? node.read() : null,
      text: node instanceof FakeText ? node.read() : null,
    };
  }
}

export type FigmaFake = {
  figma: FigmaApi;
  /** Every call on `figma` and `figma.variables`, in order: `{ name: 'createFrame', args: [] }`. */
  calls: FakeCall[];
  /** The document as plain data: pages, nodes by name, collections and variables. */
  snapshot(): FakeDocument;
};

/** A document with one page, `Page 1`, and the given fonts (FAKE_FONTS when none are given). */
export function createFigmaFake(options?: {
  fonts?: { family: string; style: string }[];
}): FigmaFake {
  const fake = new FakeFigma(options?.fonts ?? FAKE_FONTS);
  const figma: FigmaApi = fake;
  return { figma, calls: fake.calls, snapshot: () => fake.snapshot() };
}

function messageOf(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const { message } = cause;
    if (typeof message === 'string') return message;
  }
  return String(cause);
}

/**
 * Runs a generated script the way `use_figma` does: the code is the body of an async function, so
 * top-level `await` and `return` work, with `figma` as its one global. A throw comes back as an
 * Error with Figma's message; the return comes back as JSON, as the tool gives it.
 */
export async function runScript(code: string, figma: FigmaApi): Promise<unknown> {
  if (figma instanceof FakeFigma) figma.beginRun();
  const quiet = (): undefined => undefined;
  const context = createContext({ figma, console: { log: quiet, warn: quiet, error: quiet } });
  let result: unknown;
  try {
    const script = new Script(`(async () => {\n${code}\n})()`, { filename: 'use_figma.js' });
    result = await script.runInContext(context);
  } catch (cause) {
    throw new Error(messageOf(cause));
  }
  return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
}
