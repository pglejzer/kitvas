// The part of Figma's Plugin API that the hand-off's builder calls inside `use_figma` (plan 21,
// call 3), typed by hand from Figma's plugin documentation and the calls probe P1 ran in the
// owner's file (`docs/plans/plan-21/probes.md`). Only what the builder needs is here: a member
// added here is added to the fake too (`test/helpers/handoff/figma-fake.ts`), which throws where Figma does.
// `notify`, `setPluginData`, `createImageAsync`, `loadAllPagesAsync` and `closePlugin` are left
// out on purpose: `use_figma` forbids them.

/** Channels from 0 to 1, as Figma takes them (never 0 to 255). */
export type RGB = { readonly r: number; readonly g: number; readonly b: number };
/** For variables, gradient stops and shadows; a solid paint's `color` has no `a`. */
export type RGBA = RGB & { readonly a: number };
export type VariableAlias = { readonly type: 'VARIABLE_ALIAS'; readonly id: string };

export type SolidPaint = {
  readonly type: 'SOLID';
  /** No `a`: the paint's alpha is its `opacity`. */
  readonly color: RGB;
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly boundVariables?: { readonly color?: VariableAlias };
};
export type ColorStop = { readonly position: number; readonly color: RGBA };
/** The 2 × 3 affine matrix of a gradient, in the node's unit square. */
export type Transform = [[number, number, number], [number, number, number]];
export type GradientPaint = {
  readonly type: 'GRADIENT_LINEAR';
  readonly gradientTransform: Transform;
  readonly gradientStops: readonly ColorStop[];
  readonly opacity?: number;
  readonly visible?: boolean;
};
export type ImagePaint = {
  readonly type: 'IMAGE';
  readonly scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE';
  /** Null for the layer `upload_assets` puts the image on. */
  readonly imageHash: string | null;
  readonly opacity?: number;
  readonly visible?: boolean;
};
export type Paint = SolidPaint | GradientPaint | ImagePaint;

export type ShadowEffect = {
  readonly type: 'DROP_SHADOW' | 'INNER_SHADOW';
  readonly color: RGBA;
  readonly offset: { readonly x: number; readonly y: number };
  readonly radius: number;
  readonly spread?: number;
  readonly visible: boolean;
  readonly blendMode: 'NORMAL';
};
export type Effect = ShadowEffect;

export type FontName = { readonly family: string; readonly style: string };
export type LineHeight =
  | { readonly unit: 'AUTO' }
  | { readonly unit: 'PIXELS' | 'PERCENT'; readonly value: number };
export type LetterSpacing = { readonly unit: 'PIXELS' | 'PERCENT'; readonly value: number };
export type TextDecoration = 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';

export type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL';
/**
 * `FILL` only on a child of an auto-layout frame, so only after `appendChild`; `HUG` only on text
 * and on auto-layout frames.
 */
export type LayoutSizing = 'FIXED' | 'HUG' | 'FILL';

export const VARIABLE_SCOPES = [
  'ALL_SCOPES',
  'TEXT_CONTENT',
  'CORNER_RADIUS',
  'WIDTH_HEIGHT',
  'GAP',
  'ALL_FILLS',
  'FRAME_FILL',
  'SHAPE_FILL',
  'TEXT_FILL',
  'STROKE_COLOR',
  'STROKE_FLOAT',
  'EFFECT_FLOAT',
  'EFFECT_COLOR',
  'OPACITY',
  'FONT_FAMILY',
  'FONT_STYLE',
  'FONT_WEIGHT',
  'FONT_SIZE',
  'LINE_HEIGHT',
  'LETTER_SPACING',
  'PARAGRAPH_SPACING',
  'PARAGRAPH_INDENT',
] as const;
export type VariableScope = (typeof VARIABLE_SCOPES)[number];
export type VariableType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
export type VariableValue = RGB | RGBA | number | string | boolean | VariableAlias;
export type CodeSyntaxPlatform = 'WEB' | 'ANDROID' | 'iOS';

/** A frame's fields a FLOAT variable can stand for (`setBoundVariable`). */
export const FRAME_FIELDS = [
  'itemSpacing',
  'counterAxisSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'topLeftRadius',
  'topRightRadius',
  'bottomRightRadius',
  'bottomLeftRadius',
  'strokeWeight',
  'strokeTopWeight',
  'strokeRightWeight',
  'strokeBottomWeight',
  'strokeLeftWeight',
  'width',
  'height',
  'opacity',
] as const;
export type FrameField = (typeof FRAME_FIELDS)[number];
/** A text node's fields: FLOAT for sizes and the weight, STRING for the family and the style. */
export const TEXT_FIELDS = [
  'fontSize',
  'fontWeight',
  'fontFamily',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export type Variable = {
  readonly id: string;
  name: string;
  readonly resolvedType: VariableType;
  readonly variableCollectionId: string;
  scopes: readonly VariableScope[];
  /** By mode id. */
  readonly valuesByMode: Readonly<Record<string, VariableValue>>;
  readonly codeSyntax: Readonly<Partial<Record<CodeSyntaxPlatform, string>>>;
  setValueForMode(modeId: string, value: VariableValue): void;
  /** `setVariableCodeSyntax('WEB', 'var(--kit-color-ink)')`. */
  setVariableCodeSyntax(platform: CodeSyntaxPlatform, value: string): void;
  remove(): void;
};

export type VariableCollection = {
  readonly id: string;
  name: string;
  /** A new collection has one mode, `Mode 1`. */
  readonly modes: readonly { readonly modeId: string; readonly name: string }[];
  readonly defaultModeId: string;
  readonly variableIds: readonly string[];
  renameMode(modeId: string, name: string): void;
  remove(): void;
};

export type VariablesApi = {
  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;
  getLocalVariablesAsync(type?: VariableType): Promise<Variable[]>;
  getVariableByIdAsync(id: string): Promise<Variable | null>;
  createVariableCollection(name: string): VariableCollection;
  createVariable(name: string, collection: VariableCollection, type: VariableType): Variable;
  /** A copy of the paint bound to the variable: assign the copy; the paint passed in is unchanged. */
  setBoundVariableForPaint(
    paint: SolidPaint,
    field: 'color',
    variable: Variable | null,
  ): SolidPaint;
};

type SceneBase = {
  readonly id: string;
  name: string;
  readonly removed: boolean;
  readonly parent: FrameNode | PageNode | null;
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  /** Both at least 0.01. */
  resize(width: number, height: number): void;
  remove(): void;
  opacity: number;
  visible: boolean;
  /** Figma's in-progress shimmer over the node: on a section's frame until its layers are in. */
  placeholder: boolean;
  /** Read only in place: assign a new array, never change the one read. */
  fills: readonly Paint[];
  /** `ABSOLUTE` only inside an auto-layout frame. */
  layoutPositioning: 'AUTO' | 'ABSOLUTE';
  layoutSizingHorizontal: LayoutSizing;
  layoutSizingVertical: LayoutSizing;
  /** Field (`itemSpacing`, `fills`) to its variables. */
  readonly boundVariables: Readonly<Record<string, VariableAlias | readonly VariableAlias[]>>;
};

export type FrameNode = SceneBase & {
  readonly type: 'FRAME';
  readonly children: readonly SceneNode[];
  /** Moves the child here, from wherever it was. */
  appendChild(child: SceneNode): void;
  insertChild(index: number, child: SceneNode): void;
  /** Depth first, the node itself left out. */
  findOne(test: (node: SceneNode) => boolean): SceneNode | null;
  findAll(test?: (node: SceneNode) => boolean): SceneNode[];
  layoutMode: LayoutMode;
  /** `WRAP` only on a `HORIZONTAL` frame; anywhere else it throws. */
  layoutWrap: 'NO_WRAP' | 'WRAP';
  primaryAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  itemSpacing: number;
  /** The gap between wrapped lines; null when it follows `itemSpacing`. */
  counterAxisSpacing: number | null;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  strokes: readonly Paint[];
  strokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  strokeWeight: number;
  strokeTopWeight: number;
  strokeRightWeight: number;
  strokeBottomWeight: number;
  strokeLeftWeight: number;
  topLeftRadius: number;
  topRightRadius: number;
  bottomRightRadius: number;
  bottomLeftRadius: number;
  effects: readonly Effect[];
  clipsContent: boolean;
  setBoundVariable(field: FrameField, variable: Variable | null): void;
};

/** Every text property, `characters` first, needs the node's font loaded before it is written. */
export type TextNode = SceneBase & {
  readonly type: 'TEXT';
  characters: string;
  /** A new text node is Inter Regular; the font set must be loaded. */
  fontName: FontName;
  fontSize: number;
  lineHeight: LineHeight;
  letterSpacing: LetterSpacing;
  textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textCase: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textDecoration: TextDecoration;
  /** `HEIGHT`: a fixed width, wrapped, the height follows; set before the width's `resize`. */
  textAutoResize: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
  setRangeFontName(start: number, end: number, font: FontName): void;
  setRangeFills(start: number, end: number, fills: readonly Paint[]): void;
  setRangeTextDecoration(start: number, end: number, decoration: TextDecoration): void;
  setBoundVariable(field: TextField, variable: Variable | null): void;
};

export type SceneNode = FrameNode | TextNode;

export type PageNode = {
  readonly type: 'PAGE';
  readonly id: string;
  name: string;
  readonly children: readonly SceneNode[];
  appendChild(child: SceneNode): void;
  findOne(test: (node: SceneNode) => boolean): SceneNode | null;
  findAll(test?: (node: SceneNode) => boolean): SceneNode[];
};

export type DocumentNode = { readonly type: 'DOCUMENT'; readonly children: readonly PageNode[] };

/** The `figma` global of a `use_figma` script. */
export type FigmaApi = {
  readonly root: DocumentNode;
  /** Read only here: switch with `setCurrentPageAsync`, at most once a call. */
  readonly currentPage: PageNode;
  setCurrentPageAsync(page: PageNode): Promise<void>;
  /** A page at the end of the document. */
  createPage(): PageNode;
  /** A frame of 100 × 100 on the current page, filled white, no auto layout. */
  createFrame(): FrameNode;
  /** An auto-layout frame on the current page that hugs its children. */
  createAutoLayout(direction?: 'HORIZONTAL' | 'VERTICAL'): FrameNode;
  /** A text node on the current page, in Inter Regular. */
  createText(): TextNode;
  /** The SVG as a frame of vectors on the current page. */
  createNodeFromSvg(svg: string): FrameNode;
  /** Rejects for a font Figma does not have. */
  loadFontAsync(font: FontName): Promise<void>;
  listAvailableFontsAsync(): Promise<{ fontName: FontName }[]>;
  getNodeByIdAsync(id: string): Promise<PageNode | SceneNode | null>;
  readonly variables: VariablesApi;
};
