// Use case: the layers of a draft's latest version at the widths asked for, for the hand-off to
// Figma (plan 21, task 1). The draft is built as `runChecks` builds it; a draft that does not build
// is walked at no width. One browser walks the built page at each width, each walk in a fresh
// context of its own, and is closed at the end whatever happens.

import { type BuildError, buildDraft, type RenderDeps } from '../../render/index.ts';
import { DEEP_VIEWPORTS, TABLET_VIEWPORT } from '../domain/page/facts.ts';
import type { LayerFacts } from '../domain/page/layers.ts';
import { VIEWPORTS } from '../domain/page/page.ts';
import type { Browser } from '../ports/browser.ts';

export type MeasuredLayers = {
  version: number;
  /** False when the build had errors: nothing was walked. */
  built: boolean;
  /** The build's errors, then each walk that failed as `<width>: <reason>`. */
  errors: string[];
  /** One per width that was walked, in the order asked for. */
  frames: { width: number; facts: LayerFacts }[];
};

export type MeasureLayersDeps = { render: RenderDeps; browser: Browser };

export type MeasureLayersInput = { slug: string; state: string; widths: number[] };

/** The sizes the checks visit; a width they know is walked at their height. */
const KNOWN_SIZES = [...VIEWPORTS, TABLET_VIEWPORT, ...DEEP_VIEWPORTS];
/** Any other width is walked at the laptop's height. */
const OTHER_HEIGHT = 900;
const CANNOT = 'this browser cannot walk the layers of a page';

const heightOf = (width: number): number =>
  KNOWN_SIZES.find((size) => size.width === width)?.height ?? OTHER_HEIGHT;

/** A build error as one line: the file inside the draft version and the line, then the message. */
const errorLine = ({ file, line, message }: BuildError): string => {
  if (file === '') return message;
  return `${file}${line > 0 ? `:${line}` : ''}: ${message}`;
};

export async function measureLayers(
  deps: MeasureLayersDeps,
  input: MeasureLayersInput,
): Promise<MeasuredLayers> {
  const build = await buildDraft(deps.render, input.slug);
  const errors = build.errors.map(errorLine);
  const frames: MeasuredLayers['frames'] = [];
  if (!build.built || input.widths.length === 0) {
    return { version: build.version, built: build.built, errors, frames };
  }
  const session = await deps.browser.open();
  try {
    for (const width of input.widths) {
      const visit = { page: build.path, state: input.state, width, height: heightOf(width) };
      const report = await session.layers?.(visit);
      if (report === undefined) {
        errors.push(CANNOT);
        break;
      }
      if (report.state === 'walked') frames.push({ width, facts: report.facts });
      else errors.push(`${width}: ${report.error}`);
    }
  } finally {
    await session.close();
  }
  return { version: build.version, built: true, errors, frames };
}
