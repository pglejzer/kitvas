// `kitvas build <slug>`: the latest version of a draft as a page.

import type { KitWriter, LoadedKit } from '../../../kit/index.ts';
import {
  type BuildFs,
  type BuildReport,
  type Bundler,
  buildDraft,
  type StylePipeline,
  type UtilityCss,
} from '../../../render/index.ts';
import { type Command, defineCommand } from '../../registry.ts';
import { type DraftDeps, openDrafts, slugAt } from './draft.ts';

export type RenderTools = {
  bundler: Bundler;
  styles: StylePipeline;
  fs: BuildFs;
  runtimeFiles: string[];
  /** Tailwind's CSS for Tailwind kits; it starts a worker only when a build needs one. */
  utility: UtilityCss;
  /** Writes a project kit's generated entry; builds call it before they read the kit. */
  kitWriter?: KitWriter | undefined;
  /** Refuses a kit a draft may not use (a failed `kit verify`); see RenderDeps.kitGate. */
  kitGate?: ((kit: LoadedKit) => void) | undefined;
};

/** `render` is called once per build, so the bundler and Sass only start when they are needed. */
export type BuildDeps = DraftDeps & { render(): RenderTools };

export type BuildView = Omit<BuildReport, 'warnings'> & {
  warnings: { path: string; message: string }[];
};

/** Stops what the tools keep running: esbuild, the Sass compiler, a Tailwind worker. */
export async function disposeRenderTools(tools: RenderTools): Promise<void> {
  await tools.bundler.dispose();
  await tools.styles.dispose();
  await tools.utility.dispose();
}

export function createBuildCommand(deps: BuildDeps): Command {
  return defineCommand<BuildView>({
    name: 'build',
    summary: 'command.build.summary',
    async run(ctx) {
      const drafts = openDrafts(deps, ctx);
      const slug = slugAt(ctx, 0);
      const tools = deps.render();
      try {
        const report = await buildDraft({ drafts, kits: deps.kits, ...tools }, slug);
        return {
          ...report,
          warnings: report.warnings.map((issue) => ({
            path: issue.path,
            message: ctx.t(issue.key, issue.params),
          })),
        };
      } finally {
        await disposeRenderTools(tools);
      }
    },
    render(data, t) {
      if (!data.built) {
        return [
          t('render.build.failed', { slug: data.slug, count: data.errors.length }),
          ...data.errors.map(
            (error) => `  ${error.file}:${error.line}:${error.column} ${error.message}`,
          ),
        ].join('\n');
      }
      const head = t(data.cached ? 'render.build.cached' : 'render.build.ok', {
        slug: data.slug,
        version: data.version,
        elements: data.elements,
        path: data.path,
      });
      return [head, ...data.warnings.map((warning) => `  ${warning.message}`)].join('\n');
    },
  });
}
