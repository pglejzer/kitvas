// Public API of the edit module. Adapters are wired in src/main.ts, not exported here.

export * from './app/apply-edits.ts';
export * from './app/edit-state.ts';
export * from './app/history/element-history.ts';
export * from './app/history/restore.ts';
export * from './app/inspect.ts';
export type { ItemScope } from './app/inspect-item.ts';
export * from './app/kit-lens/kit-lens.ts';
export * from './app/locate.ts';
export * from './app/locks/lock-restore.ts';
export * from './app/structure/palette.ts';
export * from './app/structure/reset.ts';
export * from './app/structure/section-files.ts';
export * from './app/structure/structure.ts';
export * from './app/style/off-kit.ts';
export * from './domain/ops.ts';
export * from './domain/structure/apply-structure.ts';
export * from './domain/structure/patch.ts';
export * from './domain/structure/renames.ts';
export * from './domain/structure/subtree.ts';
export * from './domain/style/apply-scss.ts';
export * from './domain/style/source.ts';
export * from './domain/tsx/apply-tsx.ts';
export * from './domain/tsx/kit-imports.ts';
export * from './domain/tsx/nearest.ts';
export * from './domain/types.ts';
export type * from './ports/compiler.ts';
