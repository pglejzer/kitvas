// `kitvas kit …`: list kits, show one, check it, read one component, print its token sheet, build
// its rendered examples; for project kits also start one, verify it and use it in this project.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type CropResult,
  readVerifyFile,
  type ScanResult,
  VERIFY_FILE,
  VERIFY_STEPS,
  type VerifyFile,
  type VerifyIssue,
} from '../../checks/index.ts';
import {
  type Detected,
  detectKits,
  findComponent,
  type KitComponent,
  type KitIssue,
  type KitListItem,
  type KitSource,
  type KitStore,
  type KitSummary,
  type KitWriter,
  type LoadedKit,
  listKits,
  loadKit,
  newKit,
  type ProjectSetup,
  parseSourceFlag,
  projectIssues,
  summarizeKit,
  syncGeneratedEntry,
  tokensToCss,
} from '../../kit/index.ts';
import { buildCatalog, type CatalogReport } from '../../render/index.ts';
import {
  catalogDir,
  KitvasError,
  loadSettings,
  projectKitsDir,
  saveProjectKit,
  type Translate,
} from '../../shared/index.ts';
import { columns } from '../output/columns.ts';
import { type Command, type CommandContext, defineCommand } from '../registry.ts';
import type { RenderTools } from './build.ts';

type IssueLine = { path: string; message: string };

/** `kit verify` as the CLI answers it: the verify file, each issue with its sentence. */
export type KitVerifyView = { view: 'verify' } & Omit<VerifyFile, 'issues'> & {
    issues: (VerifyIssue & { message: string })[];
  };

export type KitView =
  | { view: 'list'; kits: KitListItem[] }
  | { view: 'show'; kit: KitSummary }
  | {
      view: 'check';
      id: string;
      valid: boolean;
      issues: IssueLine[];
      /** Without an id: project kit folders hidden by a built-in kit of the same id. */
      shadowed: { id: string; path: string; issues: IssueLine[] }[];
    }
  | { view: 'component'; id: string; component: KitComponent }
  | { view: 'css'; id: string; css: string }
  | ({ view: 'build' } & CatalogReport)
  | {
      view: 'new';
      id: string;
      path: string;
      source: KitSource;
      /** Files of an images folder that were not copied, with the reason. */
      skipped: { file: string; reason: string }[];
    }
  | ({ view: 'scan' } & ScanResult)
  | ({ view: 'crop' } & CropResult)
  | { view: 'use'; id: string }
  | ({ view: 'detect' } & Detected)
  | KitVerifyView;

const problems = (title: string, issues: IssueLine[]): string[] => [
  title,
  ...issues.map((issue) => `  ${issue.path}: ${issue.message}`),
];

const sourceLabel = (source: KitSource): string => {
  switch (source.type) {
    case 'npm':
      return `${source.package} ${source.version}`;
    case 'repo':
      return source.path;
    case 'figma':
      return source.url;
    case 'web':
      return source.urls.map(hostOf).join(', ');
    case 'images':
      return 'images';
    case 'builtin':
      return source.type;
  }
};

/** The host of a page URL; the text as written when it does not parse. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function renderVerify(data: KitVerifyView, t: Translate): string {
  const named = (state: string): string =>
    VERIFY_STEPS.filter((step) => data.steps[step] === state).join(', ');
  const lines = data.valid
    ? [t('kits.verify.ok', { id: data.kit, steps: named('passed') })]
    : [
        t('kits.verify.failed', { id: data.kit, count: data.issues.length }),
        ...data.issues.map((issue) => `  ${issue.step}  ${issue.path}: ${issue.message}`),
      ];
  // A valid kit can still carry advice (a component without a reference image).
  if (data.valid && data.issues.length > 0) {
    lines.push(
      t('kits.verify.advice'),
      ...data.issues.map((issue) => `  ${issue.step}  ${issue.path}: ${issue.message}`),
    );
  }
  const skipped = named('skipped');
  if (skipped) lines.push(t('kits.verify.skipped', { steps: skipped }));
  return [...lines, ...data.notes.map((note) => t(note))].join('\n');
}

function renderDetect(data: Detected, t: Translate): string {
  const { signs } = data;
  const lines = data.kits.map((kit) =>
    t(kit.stale ? 'kits.detect.kitStale' : 'kits.detect.kit', { id: kit.id, source: kit.source }),
  );
  if (lines.length === 0) lines.push(t('kits.detect.noKits'));
  lines.push(
    data.active === null ? t('kits.detect.noActive') : t('kits.detect.active', { id: data.active }),
  );
  if (signs.components.length > 0) {
    lines.push(t('kits.detect.components', { folders: signs.components.join(', ') }));
  }
  if (signs.packages.length > 0) {
    lines.push(t('kits.detect.packages', { names: signs.packages.join(', ') }));
  }
  if (signs.figma.length > 0) lines.push(t('kits.detect.figma', { urls: signs.figma.join(' ') }));
  if (signs.components.length + signs.packages.length + signs.figma.length === 0) {
    lines.push(t('kits.detect.noSigns'));
  }
  return lines.join('\n');
}

function renderView(data: KitView, t: Translate): string {
  switch (data.view) {
    case 'list': {
      if (data.kits.length === 0) return t('kits.list.empty');
      return columns(
        data.kits.map((kit) => [
          kit.id,
          kit.valid ? `${kit.name} ${kit.version}` : t('kits.list.invalid'),
        ]),
      ).join('\n');
    }
    case 'show': {
      const { kit } = data;
      const lines = [
        t('kits.show.title', { name: kit.name, version: kit.version, id: kit.id }),
        t('kits.show.counts', {
          components: kit.components.length,
          tokens: kit.tokens,
          icons: kit.icons,
        }),
        ...columns(kit.components.map((c) => [`  ${c.name}`, c.category, c.description])),
      ];
      if (kit.gaps.length > 0) lines.push(t('kits.show.gaps', { count: kit.gaps.length }));
      if (kit.issues > 0) lines.push(t('kits.show.issues', { count: kit.issues, id: kit.id }));
      return lines.join('\n');
    }
    case 'check': {
      const lines = data.valid
        ? [t('kits.check.ok', { id: data.id })]
        : problems(t('kits.check.failed', { id: data.id, count: data.issues.length }), data.issues);
      for (const hidden of data.shadowed) {
        const title = t('kits.check.failed', { id: hidden.path, count: hidden.issues.length });
        lines.push(...problems(title, hidden.issues));
      }
      return lines.join('\n');
    }
    case 'component':
      return [
        t('kits.component.title', { name: data.component.name, id: data.id }),
        JSON.stringify(data.component, null, 2),
      ].join('\n');
    case 'css':
      return data.css;
    case 'build': {
      const counts = { id: data.id, shown: data.shown.length, skipped: data.skipped.length };
      if (!data.built) {
        return [
          t('kits.build.failed', { id: data.id, count: data.errors.length }),
          ...data.errors.map(
            (error) => `  ${error.file}:${error.line}:${error.column} ${error.message}`,
          ),
        ].join('\n');
      }
      return t(data.cached ? 'kits.build.cached' : 'kits.build.ok', { ...counts, path: data.path });
    }
    case 'new':
      return [
        t('kits.new.ok', { id: data.id, source: sourceLabel(data.source), path: data.path }),
        ...data.skipped.map((item) =>
          t('kits.new.skipped', { file: item.file, reason: t(item.reason) }),
        ),
      ].join('\n');
    case 'scan':
      return [
        t('kits.scan.ok', { count: data.pages.length, id: data.id }),
        ...data.pages.map((page) => t('kits.scan.page', page)),
      ].join('\n');
    case 'crop':
      return [
        t('kits.crop.ok', { count: data.written.length, id: data.id }),
        ...data.errors.map((error) => t('kits.crop.failed', error)),
      ].join('\n');
    case 'use':
      return t('kits.use.ok', { id: data.id });
    case 'detect':
      return renderDetect(data, t);
    case 'verify':
      return renderVerify(data, t);
  }
}

export type KitDeps = {
  /** Both layers: built-in kits, then the project's `.kitvas/kits/`. */
  kits: KitStore;
  /** Writes into project kit folders: `kit new`, `generated/kit.ts`. */
  kitWriter: KitWriter;
  /** The project on disk, for the project checks and `kit new`. */
  projectFiles(project: string): ProjectSetup;
  /** `render` is called once per catalog build, so the bundler and Sass only start when needed. */
  render(): RenderTools;
  /** `kit verify`: the checks module's verifyKit, with its tools. */
  verify(project: string, id: string): Promise<VerifyFile>;
  /** `kit scan`: the checks module's scanKit, with its browser and address lookup. */
  scan(
    project: string,
    id: string,
    options: { urls: string[]; allowPrivate: boolean },
  ): Promise<ScanResult>;
  /** `kit crop`: the checks module's cropKit, with its browser. */
  crop(project: string, id: string): Promise<CropResult>;
};

export function createKitCommand(deps: KitDeps): Command {
  const idAt = (ctx: CommandContext, index: number): string =>
    ctx.positionals[index] ?? loadSettings({ home: ctx.home, cwd: ctx.cwd }).kit;
  const requiredId = (ctx: CommandContext, command: string): string => {
    const id = ctx.positionals[1];
    if (!id) throw new KitvasError('USAGE', { detail: ctx.t('kits.usage.id', { command }) });
    return id;
  };
  const requireWorkspace = (ctx: CommandContext): void => {
    if (!loadSettings({ home: ctx.home, cwd: ctx.cwd }).workspace.exists) {
      throw new KitvasError('WORKSPACE_MISSING');
    }
  };
  const lines = (ctx: CommandContext, issues: KitIssue[]): IssueLine[] =>
    issues.map((issue) => ({ path: issue.path, message: ctx.t(issue.key, issue.params) }));
  /** loadKit's issues plus, for a kit of the project, the checks against the project on disk. */
  const allIssues = (loaded: LoadedKit): KitIssue[] =>
    loaded.project === undefined
      ? loaded.issues
      : [...loaded.issues, ...projectIssues(deps.projectFiles(loaded.project), loaded)];

  return defineCommand<KitView>({
    name: 'kit',
    summary: 'command.kit.summary',
    async run(ctx) {
      const sub = ctx.positionals[0] ?? 'show';
      switch (sub) {
        case 'list':
          return { view: 'list', kits: listKits(deps.kits) };
        case 'show':
          return { view: 'show', kit: summarizeKit(loadKit(deps.kits, idAt(ctx, 1))) };
        case 'check': {
          const explicit = ctx.positionals[1] !== undefined;
          const id = idAt(ctx, 1);
          const issues = allIssues(loadKit(deps.kits, id));
          const hidden: string[] = explicit ? [] : (deps.kits.shadowedIds?.() ?? []);
          return {
            view: 'check',
            id,
            valid: issues.length === 0,
            issues: lines(ctx, issues),
            shadowed: hidden.map((hiddenId) => ({
              id: hiddenId,
              path: join(projectKitsDir(ctx.cwd), hiddenId),
              issues: lines(ctx, [
                { path: 'id', key: 'kitIssue.idTaken', params: { id: hiddenId } },
              ]),
            })),
          };
        }
        case 'component': {
          const name = ctx.positionals[1];
          if (!name) throw new KitvasError('USAGE', { detail: ctx.t('kits.usage.component') });
          const id = idAt(ctx, 2);
          return { view: 'component', id, component: findComponent(loadKit(deps.kits, id), name) };
        }
        case 'css': {
          const id = idAt(ctx, 1);
          const loaded = loadKit(deps.kits, id);
          return { view: 'css', id, css: tokensToCss(loaded.tokens, ':root', loaded.cssVarMap) };
        }
        case 'build': {
          const id = idAt(ctx, 1);
          requireWorkspace(ctx);
          syncGeneratedEntry(deps.kitWriter, loadKit(deps.kits, id));
          const tools = deps.render();
          try {
            const report = await buildCatalog(
              { kits: deps.kits, ...tools },
              id,
              catalogDir(ctx.cwd, id),
            );
            return { view: 'build', ...report };
          } finally {
            await tools.bundler.dispose();
            await tools.styles.dispose();
            await tools.utility.dispose();
          }
        }
        case 'new': {
          const id = requiredId(ctx, 'new');
          const from = parseSourceFlag(ctx.flags.from);
          if (!from) throw new KitvasError('USAGE', { detail: ctx.t('kits.usage.from') });
          requireWorkspace(ctx);
          const created = newKit(
            {
              kits: deps.kits,
              kitWriter: deps.kitWriter,
              files: deps.projectFiles(ctx.cwd),
              kitsDir: projectKitsDir(ctx.cwd),
            },
            id,
            from,
          );
          return { view: 'new', ...created };
        }
        case 'scan': {
          const id = requiredId(ctx, 'scan');
          requireWorkspace(ctx);
          const result = await deps.scan(ctx.cwd, id, {
            urls: ctx.flags.url,
            allowPrivate: ctx.flags.allowPrivate,
          });
          return { view: 'scan', ...result };
        }
        case 'crop': {
          const id = requiredId(ctx, 'crop');
          requireWorkspace(ctx);
          return { view: 'crop', ...(await deps.crop(ctx.cwd, id)) };
        }
        case 'use': {
          const id = requiredId(ctx, 'use');
          requireWorkspace(ctx);
          syncGeneratedEntry(deps.kitWriter, loadKit(deps.kits, id));
          saveProjectKit(ctx.cwd, id);
          return { view: 'use', id };
        }
        case 'detect': {
          const settings = loadSettings({ home: ctx.home, cwd: ctx.cwd });
          const verifiedHash = (id: string): string | undefined => {
            try {
              const text = readFileSync(join(catalogDir(ctx.cwd, id), VERIFY_FILE), 'utf8');
              return readVerifyFile(text)?.hash;
            } catch {
              return undefined;
            }
          };
          return {
            view: 'detect',
            ...detectKits({
              kits: deps.kits,
              files: deps.projectFiles(ctx.cwd),
              verifiedHash,
              activeKit: settings.kit,
            }),
          };
        }
        case 'verify': {
          const id = idAt(ctx, 1);
          requireWorkspace(ctx);
          // verifyKit writes generated/kit.ts itself once the schema step passes; loading the kit
          // here first would turn a kit.json that fails the schema into an error instead of a report.
          const file = await deps.verify(ctx.cwd, id);
          return {
            view: 'verify',
            ...file,
            issues: file.issues.map((issue) => ({
              ...issue,
              message: ctx.t(issue.key, issue.params),
            })),
          };
        }
        default:
          throw new KitvasError('USAGE', { detail: ctx.t('kits.usage.unknown', { name: sub }) });
      }
    },
    render: renderView,
  });
}
