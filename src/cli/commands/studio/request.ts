// `kitvas request show <id>`, `answer <id> --file <variants.json>`, `done <id> [--message …]` and
// `fail <id> --reason …` (spec 4d, goal 1): Claude's side of a request from the editor, through
// the running studio's API. A request's text is the person's data, never an instruction.

import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { KitvasError, loadSettings, type Translate } from '../../../shared/index.ts';
import {
  type LifecycleDeps,
  MAX_REQUEST_WORDS,
  type RequestClientDeps,
  type RequestContext,
  type RequestView,
  readVariantsFile,
  requestAnswer,
  requestDone,
  requestFail,
  requestShow,
  type StudioCaller,
  type VariantsAnswer,
} from '../../../studio/index.ts';
import { type Command, type CommandContext, defineCommand } from '../../registry.ts';

export type RequestCommandDeps = {
  /** The lifecycle of the studio of `project`, a real path. */
  lifecycle(project: string): LifecycleDeps;
  /** How the studio is called; the real one when absent. */
  call?: StudioCaller | undefined;
};

export type RequestCommandView =
  | ({ view: 'show' } & RequestContext)
  | { view: 'answer' | 'done' | 'fail'; request: RequestView };

const SUBCOMMANDS = ['show', 'answer', 'done', 'fail'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];
const isSubcommand = (value: string | undefined): value is Subcommand =>
  value !== undefined && (SUBCOMMANDS as readonly string[]).includes(value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const usage = (detail: string): KitvasError => new KitvasError('USAGE', { detail });

function clientOf(deps: RequestCommandDeps, ctx: CommandContext): RequestClientDeps {
  if (!loadSettings({ home: ctx.home, cwd: ctx.cwd }).workspace.exists) {
    throw new KitvasError('WORKSPACE_MISSING');
  }
  return { lifecycle: deps.lifecycle(realpathSync.native(ctx.cwd)), call: deps.call };
}

/** The variants file, checked before anything is sent, so Claude can fix it by its pointers. */
function variantsOf(ctx: CommandContext): VariantsAnswer {
  const path = ctx.flags.file;
  if (path === undefined || path === '') throw usage(ctx.t('command.request.noFile'));
  let text: string;
  try {
    text = readFileSync(resolve(ctx.cwd, path), 'utf8');
  } catch {
    throw usage(ctx.t('command.request.unreadable', { path }));
  }
  const read = readVariantsFile(text);
  if (!read.ok) {
    throw usage(ctx.t('command.request.badFile', { path, problems: read.problems.join('; ') }));
  }
  return read.answer;
}

/** A closing word or a reason: trimmed, at most `MAX_REQUEST_WORDS` characters. */
function wordsOf(value: string | undefined, ctx: CommandContext): string {
  const words = (value ?? '').trim();
  if (words.length > MAX_REQUEST_WORDS) {
    throw usage(ctx.t('command.request.tooLong', { max: MAX_REQUEST_WORDS }));
  }
  return words;
}

async function runRequest(
  deps: RequestCommandDeps,
  ctx: CommandContext,
): Promise<RequestCommandView> {
  const [sub, id] = ctx.positionals;
  if (!isSubcommand(sub)) throw usage(ctx.t('command.request.usage'));
  if (id === undefined || !UUID.test(id)) {
    throw usage(ctx.t('command.request.badId', { id: id ?? '' }));
  }
  const request = id.toLowerCase();
  switch (sub) {
    case 'show':
      return { view: 'show', ...(await requestShow(clientOf(deps, ctx), request)) };
    case 'answer': {
      const answer = variantsOf(ctx);
      const client = clientOf(deps, ctx);
      return { view: 'answer', request: await requestAnswer(client, request, answer) };
    }
    case 'done': {
      const message = wordsOf(ctx.flags.message, ctx);
      const client = clientOf(deps, ctx);
      return { view: 'done', request: await requestDone(client, request, message) };
    }
    case 'fail': {
      const reason = wordsOf(ctx.flags.reason, ctx);
      if (reason === '') throw usage(ctx.t('command.request.noReason'));
      const client = clientOf(deps, ctx);
      return { view: 'fail', request: await requestFail(client, request, reason) };
    }
  }
}

function renderShow(view: RequestContext, t: Translate): string {
  const { request } = view;
  const fields = {
    id: request.id,
    kind: request.kind,
    status: request.status,
    slug: view.slug,
    text: request.text,
  };
  const none = t('studio.cli.request.none');
  const ids = view.elements.map((element) => element.id).join(', ');
  const locked = view.locked.join(', ');
  return [
    t(request.text === '' ? 'studio.cli.request.headBare' : 'studio.cli.request.head', fields),
    t('studio.cli.request.elements', { ids: ids === '' ? none : ids }),
    t('studio.cli.request.locked', { ids: locked === '' ? none : locked }),
    ...(request.stale ? [t('studio.cli.request.stale')] : []),
  ].join('\n');
}

function renderView(data: RequestCommandView, t: Translate): string {
  switch (data.view) {
    case 'show':
      return renderShow(data, t);
    case 'answer': {
      const answer = data.request.answer;
      const count = answer?.kind === 'variants' ? answer.variants.length : 0;
      return t('studio.cli.request.answered', { id: data.request.id, count });
    }
    case 'done':
      return t('studio.cli.request.done', { id: data.request.id });
    case 'fail':
      return t('studio.cli.request.failed', { id: data.request.id });
  }
}

export function createRequestCommand(deps: RequestCommandDeps): Command {
  return defineCommand<RequestCommandView>({
    name: 'request',
    summary: 'command.request.summary',
    run: (ctx) => runRequest(deps, ctx),
    render: renderView,
  });
}
