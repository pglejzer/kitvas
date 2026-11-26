// What the fitter is handed: one JSON file written by `kitvas handoff brief` (plan 22, task 2).
// All paths are relative to the project root unless said otherwise.

import type { WriteSet } from './listing.ts';

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
  write: WriteSet;
  /** The version's options with the value handed off (the default); absent when it has none. */
  options?: { id: string; default: string }[];
  /** Paths of `target.json`, the rules (`reference/handoff-code.md`) and the report to write. */
  target: string;
  rules: string;
  report: string;
  /** The lines under `## Handoff` in `.kitvas/decisions.md`. */
  decisions: string[];
};
