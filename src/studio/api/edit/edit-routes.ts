// The editor's routes (plan 13, C3): its state, one element as written, the edits, "Save version",
// "Undo save" (plan 15) and the off-kit values. The rules are in the edit and drafts modules; a handler checks the input
// and calls them. An edit answers 200 with an `outcome` for every well-formed request.

import { type IdEntry, liveCodeFindings, translateFinding } from '../../../checks/index.ts';
import {
  type DraftStore,
  endEditSession,
  loadDraft,
  reopenEditSession,
  versionFolder,
} from '../../../drafts/index.ts';
import {
  applyEdits,
  type EditCompiler,
  type EditOp,
  editKit,
  editState,
  fileOfId,
  type ImageFiles,
  idsOf,
  inspectElement,
  offKitValues,
  sectionScss,
  sourceFiles,
  textSourceOf,
} from '../../../edit/index.ts';
import { cssVarName, type KitStore } from '../../../kit/index.ts';
import { elementIds, readSites } from '../../../render/index.ts';
import { KitvasError, type Translate } from '../../../shared/index.ts';
import { etagOf } from '../../http/etag.ts';
import { issueEntries, RequestError } from '../../http/problem.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { EmptyBody, SlugParams } from '../schemas.ts';
import {
  EditEndSchema,
  EditOutcomeSchema,
  EditRequestSchema,
  EditStateSchema,
  InspectQuerySchema,
  InspectSchema,
  OffKitSchema,
  SOURCE_PATH,
  TextSourceQuerySchema,
  TextSourceSchema,
} from './edit-schemas.ts';
import type { LiveCodeFinding } from './live-schemas.ts';
import { SessionReopenRequestSchema, SessionReopenSchema } from './session-schemas.ts';

/** A version's source files and their ETags, by path. */
type Etags = Record<string, string>;

/** What the editor needs that only `src/main.ts` and the live loop can give. */
export type EditDeps = {
  /** esbuild's `jsxDev` compile: finds an element in the current text and checks a result. */
  compiler: EditCompiler;
  /** Right before an edit's files are written, with their new ETags: the watcher's `expect`. */
  beforeWrite?: (slug: string, version: number, etags: Etags) => void;
  /** Right after an edit's files are written, with the same ETags. */
  afterWrite?: (slug: string, version: number, etags: Etags) => void;
  /** Stops the compiler; the studio calls it when it closes. */
  dispose?: () => Promise<void>;
  /** Lists a version's image files for the background image picker; none without it. */
  images?: ImageFiles | undefined;
};

export type EditRouteDeps = {
  drafts: DraftStore;
  kits: KitStore;
  now(): Date;
  t: Translate;
  /** Without it the routes that read the TSX (inspect, edits) answer 500. */
  edit?: EditDeps | undefined;
};

/**
 * An element id names a source file of the version (`sections/Hero:…` is
 * `src/tsx/sections/Hero.tsx`); one whose path would leave `src/tsx/` is refused.
 */
const namesSourceFile = (id: string): boolean => SOURCE_PATH.test(fileOfId(id));

/** `path=0,2` as places, `path=` as none; anything else is no path (the schema refuses it). */
const pathOf = (raw: string | null): number[] | null =>
  raw === null || !/^(?:\d{1,5}(?:,\d{1,5})*)?$/.test(raw)
    ? null
    : raw.split(',').flatMap((part) => (part === '' ? [] : [Number(part)]));

export function editRoutes(deps: EditRouteDeps): ApiRoute[] {
  const editor = (): EditDeps => {
    if (deps.edit) return deps.edit;
    throw new KitvasError('INTERNAL', { detail: deps.t('studio.edit.noEditor') });
  };

  /** Every op names an element of a source file; the pointer says which one does not. */
  const checkOps = (ops: EditOp[]): void => {
    const errors = ops.flatMap((op, index) =>
      idsOf(op).every(namesSourceFile)
        ? []
        : [
            {
              pointer: `/ops/${index}${'id' in op ? '/id' : ''}`,
              detail: deps.t('studio.edit.badElement'),
            },
          ],
    );
    if (errors.length > 0) throw new RequestError('BODY_INVALID', {}, { errors });
  };

  const sectionScssOf = (slug: string, version: number, tsxFile: string): string | null =>
    sectionScss(deps.drafts, slug, version, tsxFile);

  /** The ETags of every source file of a version, as they are on disk now. */
  const versionEtags = (slug: string, version: number): Etags => {
    const base = versionFolder(version);
    const etags: Etags = {};
    for (const file of sourceFiles(deps.drafts, slug, version)) {
      const text = deps.drafts.readText(slug, `${base}/${file}`);
      if (text !== undefined) etags[file] = etagOf(text);
    }
    return etags;
  };

  /**
   * The hook for `applyEdits`. The first edit of a session copied the whole version just before
   * (a version other than the request's), so the watcher must expect every copied file too, not
   * only the written ones, or it reports the copies as someone else's. A later edit names only
   * its own files: a file Claude changed a moment ago is never taken for the editor's.
   */
  const expectWrite =
    (hook: NonNullable<EditDeps['beforeWrite']>, asked: number) =>
    (slug: string, version: number, etags: Etags): void => {
      const copied = version === asked ? {} : versionEtags(slug, version);
      hook(slug, version, { ...copied, ...etags });
    };

  /** Where the elements of a written TSX file are now, compiled as the build compiles it. */
  const idsNow = async (compiler: EditCompiler, file: string, text: string): Promise<IdEntry[]> => {
    if (!file.endsWith('.tsx')) return [];
    const code = await compiler.jsxDev(text, file);
    const sites = code === null ? undefined : readSites(code);
    return sites === undefined ? [] : elementIds(file, sites);
  };

  /**
   * Spec 4c, goal 5: the code findings of the files an applied request wrote, worded. The edit is
   * written by then, so a check that cannot run answers none rather than failing the edit.
   */
  const liveOf = async (
    slug: string,
    ops: readonly EditOp[],
    outcome: { version: number; etags: Etags; renames: Record<string, string> },
    compiler: EditCompiler,
  ): Promise<LiveCodeFinding[]> => {
    try {
      const kit = editKit(deps.kits, loadDraft(deps.drafts, slug).kit.id);
      if (kit === null) return [];
      const base = versionFolder(outcome.version);
      const files = Object.keys(outcome.etags).flatMap((file) => {
        const text = deps.drafts.readText(slug, `${base}/${file}`);
        return text === undefined ? [] : [{ file, text }];
      });
      const found = await Promise.all(files.map(({ file, text }) => idsNow(compiler, file, text)));
      const ids = found.flat();
      const owners = ops.flatMap((op) =>
        op.op === 'setStyle' || op.op === 'removeStyle'
          ? [{ className: op.className, element: outcome.renames[op.id] ?? op.id }]
          : [],
      );
      const raw = liveCodeFindings({
        files,
        catalog: kit.kit.components,
        tokens: new Set(kit.tokens.map((token) => cssVarName(token.path))),
        sizes: kit.tokens.flatMap((token) =>
          token.type === 'dimension'
            ? [{ name: cssVarName(token.path), value: token.value.value, unit: token.value.unit }]
            : [],
        ),
        ids,
        owners,
      });
      return raw.map((finding) => {
        const worded = translateFinding(finding, deps.t);
        return {
          rule: worded.rule.slice(0, 80),
          severity: worded.severity,
          file: (worded.file ?? '').slice(0, 200),
          line: Math.max(0, worded.line),
          element: worded.element === null ? null : worded.element.slice(0, 200),
          message: worded.message.slice(0, 1_000),
        };
      });
    } catch {
      return [];
    }
  };

  return [
    apiRoute({
      id: 'getEditState',
      summary: 'What the editor needs first: the latest version, the session, ETags and tokens.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/edits',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: EditStateSchema },
      handle: ({ params }) => ({
        status: 200,
        body: editState({ drafts: deps.drafts, kits: deps.kits, etag: etagOf }, params.slug),
      }),
    }),
    apiRoute({
      id: 'inspectElement',
      summary: 'One element of the latest version as its source writes it. Query: `id`.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/inspect',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: InspectSchema },
      handle: async ({ params, query }) => {
        const parsed = InspectQuerySchema.safeParse({ id: query.get('id') });
        if (!parsed.success || !namesSourceFile(parsed.data.id)) {
          throw new RequestError(
            'REQUEST_INVALID',
            { detail: deps.t('studio.edit.badId') },
            parsed.success ? {} : { errors: issueEntries(parsed.error.issues) },
          );
        }
        const inspected = await inspectElement(
          {
            drafts: deps.drafts,
            kits: deps.kits,
            compiler: editor().compiler,
            etag: etagOf,
            images: editor().images,
          },
          params.slug,
          parsed.data.id,
        );
        return { status: 200, body: inspected };
      },
    }),
    apiRoute({
      id: 'checkTextSource',
      summary:
        'Whether the text a copy of an element shows has one string literal of its file behind it (ADR 0060). Query: `id`, `text`, `path`.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/text-source',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: TextSourceSchema },
      handle: async ({ params, query }) => {
        const parsed = TextSourceQuerySchema.safeParse({
          id: query.get('id'),
          text: query.get('text'),
          path: pathOf(query.get('path')),
        });
        if (!parsed.success || !namesSourceFile(parsed.data.id)) {
          throw new RequestError(
            'REQUEST_INVALID',
            { detail: deps.t('studio.edit.badId') },
            parsed.success ? {} : { errors: issueEntries(parsed.error.issues) },
          );
        }
        const { id, text, path } = parsed.data;
        const reason = await textSourceOf(
          { drafts: deps.drafts, compiler: editor().compiler },
          params.slug,
          id,
          text,
          path,
        );
        return { status: 200, body: { reason } };
      },
    }),
    apiRoute({
      id: 'applyEdits',
      summary:
        'Writes a gesture of edits; the first one starts a version. Always 200 with an outcome.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/edits',
      policy: 'write',
      params: SlugParams,
      request: EditRequestSchema,
      response: { status: 200, schema: EditOutcomeSchema },
      handle: async ({ params, body }) => {
        checkOps(body.ops);
        const edit = editor();
        const { slug } = params;
        const outcome = await applyEdits(
          {
            drafts: deps.drafts,
            kits: deps.kits,
            compiler: edit.compiler,
            now: () => deps.now(),
            etag: etagOf,
            sectionScss: sectionScssOf,
            ...(edit.beforeWrite
              ? { beforeWrite: expectWrite(edit.beforeWrite, body.version) }
              : {}),
          },
          {
            slug,
            version: body.version,
            ops: body.ops,
            etags: body.etags,
            ...(body.force === undefined ? {} : { force: body.force }),
          },
        );
        if (outcome.outcome !== 'applied') return { status: 200, body: outcome };
        edit.afterWrite?.(slug, outcome.version, outcome.etags);
        const live = await liveOf(slug, body.ops, outcome, edit.compiler);
        return { status: 200, body: { ...outcome, live } };
      },
    }),
    apiRoute({
      id: 'endEditSession',
      summary: '"Save version": ends the editing session; the next edit starts a new version.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/edits/end',
      policy: 'write',
      params: SlugParams,
      request: EmptyBody,
      response: { status: 200, schema: EditEndSchema },
      handle: ({ params }) => ({ status: 200, body: endEditSession(deps.drafts, params.slug) }),
    }),
    apiRoute({
      id: 'reopenEditSession',
      summary: '"Undo save": opens the ended session again while its version is still the latest.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/edits/reopen',
      policy: 'write',
      params: SlugParams,
      request: SessionReopenRequestSchema,
      response: { status: 200, schema: SessionReopenSchema },
      handle: ({ params, body }) => {
        const result = reopenEditSession(deps.drafts, params.slug, body);
        if (!result.reopened) {
          throw new KitvasError('EDIT_SESSION_TAKEN', {
            slug: params.slug,
            version: body.version,
            latest: result.version,
          });
        }
        return { status: 200, body: { version: result.version, reopened: true } };
      },
    }),
    apiRoute({
      id: 'listOffKit',
      summary: 'Raw values outside the kit in the latest version, with the nearest kit token.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/off-kit',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: OffKitSchema },
      handle: ({ params }) => ({
        status: 200,
        body: offKitValues({ drafts: deps.drafts, kits: deps.kits }, params.slug),
      }),
    }),
  ];
}
