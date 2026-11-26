// `kitvas handoff figma | sent | list`: the hand-over package of a draft for Figma, and the record of
// what was sent (plan 21). Offline: the skill calls Figma's tools and sends the package's files.

import { resolve } from 'node:path';
import type { MeasuredLayers } from '../../checks/index.ts';
import {
  type HandoffFiles,
  type HandoffSend,
  type PreparedFigma,
  prepareFigma,
  readRecord,
  recordSend,
} from '../../handoff/index.ts';
import type { RenderDeps } from '../../render/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import type { CommandContext } from '../registry.ts';
import { disposeRenderTools, type RenderTools } from './build.ts';
import { type DraftDeps, openDrafts, slugAt } from './draft.ts';

export type FigmaCommandDeps = DraftDeps & {
  render(): RenderTools;
  /** The checks module's `measureLayers` over these render tools and the browser. */
  measure(
    render: RenderDeps,
    input: { slug: string; state: string; widths: number[] },
  ): Promise<MeasuredLayers>;
  files: HandoffFiles;
  /** A fresh send id: lowercase letters and digits, 4 to 32 of them. */
  newSendId(): string;
  now(): Date;
};

export type FigmaView =
  | ({ view: 'figma' } & PreparedFigma)
  | { view: 'sent'; slug: string; send: HandoffSend; count: number }
  | { view: 'list'; slug: string; sends: HandoffSend[] };

/** The widths of the frames when none are asked for: the laptop and the phone. */
export const DEFAULT_WIDTHS = [1280, 390];
const WIDTH_MIN = 200;
const WIDTH_MAX = 4000;
const WIDTHS_MAX = 5;
const SECTION_ID = /^[a-z][a-z0-9-]{0,62}$/;

const invalid = (at: string, reason: string): KitvasError =>
  new KitvasError('HANDOFF_INVALID', { at, reason });

/** `--widths 1280,390`: whole numbers from 200 to 4000, each once, at most five. */
export function parseWidths(text: string | undefined): number[] {
  if (text === undefined) return [...DEFAULT_WIDTHS];
  const parts = text.split(',').map((part) => part.trim());
  const widths = parts.map((part) => (/^\d{1,5}$/.test(part) ? Number(part) : Number.NaN));
  const bad = widths.findIndex((width) => !(width >= WIDTH_MIN && width <= WIDTH_MAX));
  if (bad >= 0) throw invalid('widths', parts[bad] ?? '');
  if (new Set(widths).size !== widths.length) throw invalid('widths', 'twice');
  if (widths.length > WIDTHS_MAX) throw invalid('widths', 'count');
  return widths;
}

/** `--sections a,b`: layout ids. */
export function parseSections(text: string | undefined): string[] | null {
  if (text === undefined) return null;
  const ids = text.split(',').map((part) => part.trim());
  const bad = ids.find((id) => !SECTION_ID.test(id));
  if (bad !== undefined) throw invalid('sections', bad);
  return [...new Set(ids)];
}

export async function runFigma(deps: FigmaCommandDeps, ctx: CommandContext): Promise<FigmaView> {
  const drafts = openDrafts(deps, ctx);
  const slug = slugAt(ctx, 1);
  const input = {
    slug,
    widths: parseWidths(ctx.flags.widths),
    state: ctx.flags.state ?? '',
    sections: parseSections(ctx.flags.sections),
    resume: ctx.flags.resume,
  };
  const tools = deps.render();
  try {
    const render: RenderDeps = { drafts, kits: deps.kits, ...tools };
    const prepared = await prepareFigma(
      {
        drafts,
        kits: deps.kits,
        files: deps.files,
        measure: (request) => deps.measure(render, request),
        bundler: tools.bundler,
        newSendId: deps.newSendId,
        t: ctx.t,
      },
      input,
    );
    return { view: 'figma', ...prepared };
  } finally {
    await disposeRenderTools(tools);
  }
}

export function runSent(deps: FigmaCommandDeps, ctx: CommandContext): FigmaView {
  const drafts = openDrafts(deps, ctx);
  const slug = slugAt(ctx, 1);
  const file = ctx.flags.result;
  if (file === undefined) {
    throw new KitvasError('USAGE', { detail: ctx.t('handoff.usage.result') });
  }
  const text = deps.files.readText(resolve(ctx.cwd, file));
  if (text === undefined) throw invalid('result', 'missing');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw invalid('result', 'json');
  }
  const record = recordSend({ drafts, now: deps.now }, slug, raw);
  const send = record.sends[0];
  if (send === undefined) throw new KitvasError('INTERNAL', { detail: 'empty record' });
  return { view: 'sent', slug, send, count: record.sends.length };
}

export function runList(deps: FigmaCommandDeps, ctx: CommandContext): FigmaView {
  const drafts = openDrafts(deps, ctx);
  const slug = slugAt(ctx, 1);
  return { view: 'list', slug, sends: readRecord(drafts, slug).sends };
}

function sendWhere(send: HandoffSend): string {
  return send.target === 'figma' ? send.file.url : `${send.to || '.'} (${send.scope})`;
}

export function renderFigma(data: FigmaView, t: Translate): string {
  if (data.view === 'sent') {
    return t('handoff.sent.ok', {
      target: data.send.target,
      slug: data.slug,
      version: data.send.version,
      state: data.send.state,
      count: data.count,
    });
  }
  if (data.view === 'list') {
    if (data.sends.length === 0) return t('handoff.list.none', { slug: data.slug });
    return data.sends
      .map((send) =>
        t('handoff.list.row', {
          at: send.at,
          target: send.target,
          version: send.version,
          state: send.state,
          where: sendWhere(send),
        }),
      )
      .join('\n');
  }
  const { counts } = data;
  const lines = [
    t('handoff.figma.head', {
      slug: data.slug,
      version: data.version,
      state: data.state,
      sendId: data.sendId,
      widths: data.widths.join(', '),
      sections: counts.sections,
      layers: counts.layers,
      texts: counts.texts,
      images: counts.images,
      icons: counts.icons,
    }),
    t('handoff.figma.variables', {
      kit: data.kit,
      variables: counts.variables,
      unbound: data.unbound,
    }),
    t('handoff.figma.scripts', {
      scripts: counts.scripts,
      characters: counts.characters,
      manifest: data.manifest,
    }),
    t('handoff.figma.checks', {
      state: data.checks.state,
      errors: data.checks.errors,
      warnings: data.checks.warnings,
    }),
  ];
  if (data.fonts.length > 0) {
    const fonts = data.fonts.map((font) => `${font.family} ${font.weights.join('/')}`).join(', ');
    lines.push(t('handoff.figma.fonts', { fonts }));
  }
  const last = data.earlier[0];
  if (last !== undefined) {
    lines.push(
      t('handoff.figma.earlier', {
        count: data.earlier.length,
        state: last.state,
        at: last.at,
        url: last.url,
      }),
    );
  }
  for (const out of data.leftOut) {
    lines.push(t('handoff.figma.leftOut', { what: out.what, reason: out.reason }));
  }
  return lines.join('\n');
}
