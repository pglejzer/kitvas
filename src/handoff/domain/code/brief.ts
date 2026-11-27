// What the fitter is handed: one JSON file written by `kitvas handoff brief` (plan 22, task 2).
// All paths are relative to the project root unless said otherwise.

import type { WriteSet } from './listing.ts';

/** A token the draft uses, with its uses. */
export type UsedToken = {
  var: string;
  path: string;
  css: string;
  project: string | null;
  uses: number;
};

/**
 * The used tokens the kit has itself, and the ones the project added to it (`addedPaths`, dot
 * paths): the project has no variable for an added token, it creates one, so the brief lists
 * those apart, with no `project`.
 */
export function splitAddedTokens(
  used: readonly UsedToken[],
  addedPaths: readonly string[],
): { tokens: UsedToken[]; added: { var: string; path: string; css: string; uses: number }[] } {
  const added = new Set(addedPaths);
  return {
    tokens: used.filter((token) => !added.has(token.path)),
    added: used
      .filter((token) => added.has(token.path))
      .map(({ var: name, path, css, uses }) => ({ var: name, path, css, uses })),
  };
}

export type CodeBrief = {
  schemaVersion: 1;
  slug: string;
  version: number;
  kind: 'screen' | 'rework' | 'craft';
  kit: string;
  draft: {
    layout: string | null;
    sections: { id: string; tsx: string; scss: string | null; why: string | null }[];
    data: string[];
    images: string[];
    shots: { state: string; width: number; path: string }[];
  };
  components: {
    name: string;
    /** The import in the draft's TSX. */
    from: string;
    origin: 'kit' | 'addition' | 'draft';
    /** For a kit with source `npm` or `repo`: the project's own module behind the component. */
    project: string | null;
    uses: number;
  }[];
  tokens: {
    /** `--kit-space-md`. */
    var: string;
    path: string;
    css: string;
    /** The project's own variable, when the kit's `cssVarMap` names one. */
    project: string | null;
    uses: number;
  }[];
  /**
   * The tokens the draft uses that the project added to the kit (`.kitvas/additions/<kit>/`): not
   * part of the design system, so the project creates each one; absent when the draft uses none.
   */
  added?: { var: string; path: string; css: string; uses: number }[];
  write: WriteSet;
  /** The version's options with the value handed off (the default); absent when it has none. */
  options?: { id: string; default: string }[];
  /**
   * The version's shared values (ADR 0086, 0088): what a person chooses on the page, such as a date
   * range, kept by the page and handed to the sections. `values` is null for free text. `setIn` and
   * `readIn` are the draft's TSX files that set the value and that read it. Absent when it has none.
   */
  shared?: {
    id: string;
    label: string;
    default: string;
    values: { id: string; label: string }[] | null;
    setIn: string[];
    readIn: string[];
  }[];
  /** Paths of `target.json`, the rules (`reference/handoff-code.md`) and the report to write. */
  target: string;
  rules: string;
  report: string;
  /** The lines under `## Handoff` in `.kitvas/decisions.md`. */
  decisions: string[];
};
