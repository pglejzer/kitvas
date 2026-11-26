// A browser that opens a built page and reports what it saw.

import type { Pixels } from '../domain/kit/look-score.ts';
import type { PageFacts } from '../domain/page/facts.ts';
import type { LayerFacts } from '../domain/page/layers.ts';
import type { PageReport } from '../domain/page/page.ts';
import type { InventoryItem } from '../domain/rework/inventory.ts';
import type { ScanFacts } from '../domain/scan/scan-facts.ts';

export type Visit = {
  /** Absolute path of build/html/index.html. */
  page: string;
  state: string;
  width: number;
  height: number;
  /** Absolute path the full-page screenshot is written to; null: no screenshot. */
  screenshot: string | null;
  /** The extra passes after axe, in the order of ADR 0044. */
  passes: Pass[];
};

/** `reflow` runs only at 390: the page resized to 320×568. `deep` only with `kitvas check --deep`. */
export type Pass = 'focus' | 'reflow' | 'spacing' | 'deep' | 'craft';

/** A look at one example page of a kit's catalog, for `kit verify`. */
export type Inspect = {
  /** Absolute path of the catalog's build/html/index.html. */
  page: string;
  /** The query, `?example=Button.1`. */
  search: string;
  width: number;
  height: number;
  /** Custom properties to read, computed on the first element inside `#root` (or `:root`). */
  vars: string[];
};

export type InspectReport = {
  /** `document.documentElement.dataset.example` after rendering: `shown`, `failed` or absent. */
  example: 'shown' | 'failed' | null;
  /** Page errors and console errors, as text. */
  errors: string[];
  /** Requests that failed: `<url> (<reason>)`. */
  failed: string[];
  /** Computed value of each asked variable, trimmed; `''` when it has none. */
  vars: Record<string, string>;
  /**
   * Each asked variable painted by the browser as a colour, `#rrggbb` (or `#rrggbbaa` when not
   * opaque); `null` when its value is not a colour. Lets oklch, hsl and named colours be compared
   * with the kit's hex values.
   */
  colors: Record<string, string | null>;
};

/**
 * Whether a request of a scan may go out: called for every request of the page, its frames and its
 * redirects. False drops the request; for the page's own document the scan ends `blocked`.
 */
export type ScanPolicy = (url: URL) => Promise<boolean>;

/** One web page at one width, for `kit scan`. */
export type Scan = {
  url: string;
  /** One of SCAN_WIDTHS; the height is SCAN_HEIGHT. */
  width: number;
  /** Absolute folder the adapter writes `page.png` and `crops/<id>.png` into. */
  out: string;
  policy: ScanPolicy;
};

/** One live page at one width, for `rework new --url` and `craft new --url` (ADR 0045). */
export type Survey = {
  url: string;
  width: number;
  height: number;
  /** Absolute path of the screenshot to write. */
  shot: string;
  policy: ScanPolicy;
};

export type SurveyReport =
  | { state: 'surveyed'; facts: PageFacts; inventory: InventoryItem[]; viewportMeta: boolean }
  /** The page, or a redirect of it, was refused by the policy. */
  | { state: 'blocked'; url: string }
  | { state: 'failed'; error: string };

/**
 * A page at the person's address shot at one width and set beside a reference, for
 * `kitvas handoff compare` (plan 22, task 3).
 */
export type Match = {
  url: string;
  width: number;
  height: number;
  /** The region to shoot; null: the full page. */
  selector: string | null;
  /** Absolute paths: the shot to write, the reference to read. */
  shot: string;
  reference: string;
  /** Both images are scaled by one factor until neither has more pixels than this. */
  maxPixels: number;
  policy: ScanPolicy;
};

export type MatchReport =
  | { state: 'matched'; rendered: Pixels; reference: Pixels; scale: number }
  /** The page, or a redirect of it, was refused by the policy. */
  | { state: 'blocked'; url: string }
  /** No element matches the selector. */
  | { state: 'missing'; selector: string }
  | { state: 'failed'; error: string };

export type ScanReport =
  | { state: 'scanned'; facts: ScanFacts }
  /** The page, or a redirect of it, was refused by the policy. */
  | { state: 'blocked'; url: string }
  /** It did not load within SCAN_TIMEOUT_MS, or the browser failed. */
  | { state: 'failed'; error: string };

/** One box cut out of an image, for `kit crop`. */
export type Crop = {
  /** Absolute path of a PNG, JPEG or WebP file. */
  image: string;
  /** x, y, width, height in the image's pixels; clamped to the image. */
  box: [number, number, number, number];
  /** Image pixels per CSS pixel; the crop is scaled by 1 / scale. */
  scale: number;
  /** Absolute path of the PNG to write. */
  out: string;
};

export type CropReport =
  | { state: 'written'; width: number; height: number }
  | { state: 'failed'; error: string };

/** One rendered catalog example and its reference, decoded for `lookScore`. */
export type Capture = {
  /** Absolute path of the catalog's build/html/index.html. */
  page: string;
  /** The query, `?example=Button.1`. */
  search: string;
  width: number;
  height: number;
  /** Absolute path the example's screenshot (its root element's box) is written to. */
  shot: string;
  /** Absolute path of the reference image. */
  reference: string;
};

export type CaptureReport = {
  /** Page errors, an example that failed, a missing element, an image too large to decode. */
  errors: string[];
  /** The example's root element on white; undefined when it could not be captured. */
  rendered: Pixels | undefined;
  /** The reference on white; undefined when it could not be read or is over PIXELS_MAX. */
  reference: Pixels | undefined;
};

/** A built draft page walked for its layers at one width, for the hand-off to Figma (plan 21). */
export type LayerVisit = { page: string; state: string; width: number; height: number };

export type LayerReport =
  | { state: 'walked'; facts: LayerFacts }
  | { state: 'failed'; error: string };

/**
 * Catalog examples shot as PNG files one after another in one context, for the editor's Insert
 * pane (ADR 0075). Unlike `capture` nothing is compared: the page's own background is in the shot.
 */
export type ShotBatch = {
  /** Absolute path of the catalog's build/html/index.html. */
  page: string;
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  scale: number;
  shots: PreviewShot[];
};

export type PreviewShot = {
  /** The query, `?example=Button.1`. */
  search: string;
  /** The element shot: the first that matches this selector. */
  target: string;
  /** True: its box widened by the reach of its shadow, as `capture` takes it. False: the box exactly. */
  reach: boolean;
  /** Absolute path of the PNG to write. */
  out: string;
};

export type ShotReport =
  /** `width` and `height` in CSS pixels; `backdrop` is the page's background as `#rrggbb`. */
  | { state: 'written'; width: number; height: number; backdrop: string | null }
  | { state: 'failed'; error: string };

export interface BrowserSession {
  /** `chrome`, `msedge` or `chromium`. */
  readonly name: string;
  /** One visit in a fresh context, closed before it returns. */
  visit(visit: Visit): Promise<PageReport>;
  /** One look at a catalog example in a fresh context. Optional so test fakes need not have it. */
  inspect?(input: Inspect): Promise<InspectReport>;
  /** One web page in a fresh context with no stored state. */
  scan?(input: Scan): Promise<ScanReport>;
  /** Cuts boxes out of images, in order; one report per input. */
  crop?(inputs: Crop[]): Promise<CropReport[]>;
  /** Screenshots a catalog example and decodes it with its reference. */
  capture?(input: Capture): Promise<CaptureReport>;
  /** Walks a built draft page for the layers the hand-off sends to Figma. */
  layers?(visit: LayerVisit): Promise<LayerReport>;
  /** Writes each shot of a batch as a PNG; one report per shot, in order. */
  shoot?(input: ShotBatch): Promise<ShotReport[]>;
  /** A live page for rework and craft: shot, page facts and inventory. */
  survey?(input: Survey): Promise<SurveyReport>;
  /** The person's page shot and scaled beside a reference, for the hand-off's comparison. */
  match?(input: Match): Promise<MatchReport>;
  close(): Promise<void>;
}

export interface Browser {
  /** Starts a browser. Throws BROWSER_MISSING when none can be started. */
  open(): Promise<BrowserSession>;
}

/** A browser the studio keeps running for its check jobs, reached through `endpoint`. */
export interface SharedBrowser {
  /** `chrome`, `msedge` or `chromium`. */
  readonly name: string;
  /** Playwright's WebSocket address. A secret: whoever has it can drive the browser. */
  readonly endpoint: string;
  /** The browser's process id, when known. */
  readonly pid: number | undefined;
  /** Settles when the browser has gone, whoever ended it. */
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

export interface BrowserHost {
  /** Starts a browser others connect to. Throws BROWSER_MISSING when none can be started. */
  serve(): Promise<SharedBrowser>;
}

export interface BrowserInstaller {
  /** Downloads Chromium and returns the folder. Throws BROWSER_INSTALL_FAILED. */
  install(): Promise<string>;
}
