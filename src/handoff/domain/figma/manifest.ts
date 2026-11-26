// The package's manifest (`manifest.json`): the steps of a send to Figma in order, as the skill runs
// them, and what `kitvas handoff figma --json` answers about the package. Types only.

import type { HandoffTree } from './tree.ts';

export type FigmaStep =
  | { kind: 'script'; file: string; description: string; writes: boolean }
  /** `targets`: the script whose return is the `nodeIds` list, in the order of `items`. */
  | { kind: 'assets'; targets: string; items: { file: string; contentType: string }[] };

export type FigmaManifest = {
  schemaVersion: 1;
  slug: string;
  version: number;
  kit: string;
  sendId: string;
  /** `kitvas · pricing`. */
  page: string;
  frames: { width: number; name: string }[];
  steps: FigmaStep[];
};

export type FigmaPackage = {
  slug: string;
  version: number;
  kit: string;
  state: string;
  sendId: string;
  dir: string;
  manifest: string;
  widths: number[];
  counts: HandoffTree['counts'] & {
    sections: number;
    variables: number;
    scripts: number;
    characters: number;
  };
  unbound: number;
  fonts: { family: string; weights: number[] }[];
  checks: { state: 'clean' | 'findings' | 'stale' | 'none'; errors: number; warnings: number };
  /** Earlier sends of this draft to Figma, newest first. */
  earlier: { at: string; version: number; url: string; state: 'sent' | 'partial' }[];
};
