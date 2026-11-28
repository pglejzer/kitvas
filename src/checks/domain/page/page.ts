// The browser checks: what one visit of the page reports, turned into findings.

import { elementPlace, type IdEntry } from '../code/ids.ts';
import { type Message, type RawFinding, toolText } from '../findings/finding.ts';
import type { CraftFacts } from './craft-facts.ts';
import type { DeepFacts, PageFacts } from './facts.ts';
import type { UsageRecord } from './usage.ts';

/** Every state is checked at these sizes: a phone and a laptop. */
export const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
] as const;

/** The rules axe runs: WCAG 2.0, 2.1 and 2.2, levels A and AA. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  /** `element` is the nearest element id around the node axe reports. */
  nodes: { element: string | null; summary: string }[];
};

export type PageReport = {
  /** The root element got content. */
  rendered: boolean;
  /** Collected until axe was injected. */
  console: { type: 'error' | 'warning'; text: string }[];
  pageErrors: string[];
  failedRequests: { url: string; reason: string }[];
  violations: AxeViolation[];
  usage: UsageRecord[];
  /** The screenshot was written. */
  shot: boolean;
  /** What the page measured; null when it did not load. */
  facts: PageFacts | null;
  /** The deep passes; null without `--deep` or at the deep widths. */
  deep: DeepFacts | null;
  /** axe's `color-contrast` results it could not decide: text over images, gradients, overlays. */
  contrastUnsure: { node: number; element: string | null }[];
  /** A craft board's sketches and kit icons, measured by the `craft` pass; null otherwise. */
  craft: CraftFacts | null;
};

/** Which visit a finding comes from. */
export type Seen = {
  state: string;
  width: number;
  ids: IdEntry[];
  /** Element id to kit component name, from the usage records of the version. */
  components: ReadonlyMap<string, string>;
};

/** Usage records as a map from element id to component name. */
export function componentsOf(usage: UsageRecord[]): Map<string, string> {
  return new Map(usage.map((record) => [record.id, record.component]));
}

const SERIOUS = new Set(['critical', 'serious']);
/** Chrome's line for a request that failed; the request is reported on its own. */
const LOAD_FAILED = /^Failed to load resource\b/;

const hint = (key: string): Message => ({ key, params: {} });

/** `file:///…/v1/build/img/a.png` becomes `build/img/a.png`; other addresses stay as they are. */
export function buildPath(url: string): string {
  const at = url.lastIndexOf('/build/');
  if (!url.startsWith('file:') || at === -1) return url;
  const path = url.slice(at + 1);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * A console message as a person reads it: without the format string React logs first
 * (`%o\n\n%s\n\n%s`), whose values the browser only appends, and without the lines of a stack.
 */
export function consoleText(text: string): string {
  return text
    .replace(/^(?:\s*%[sdifoOc])+\s*/, '')
    .split('\n')
    .filter((line) => !/^\s+at /.test(line))
    .join('\n')
    .trim();
}

export function a11yFindings(violations: AxeViolation[], seen: Seen): RawFinding[] {
  return violations.flatMap((violation) =>
    violation.nodes.map((node): RawFinding => {
      // Restyling a kit component does not fix it, so a person decides.
      const component = node.element ? seen.components.get(node.element) : undefined;
      return {
        check: 'a11y',
        rule: `a11y/${violation.id}`,
        severity: component || !SERIOUS.has(violation.impact ?? '') ? 'review' : 'fix',
        ...elementPlace(seen.ids, node.element),
        element: node.element,
        message: toolText(violation.help),
        hint: component
          ? { key: 'checkHint.kitInternal', params: { component } }
          : toolText(node.summary.trim()),
        states: [seen.state],
        widths: [seen.width],
      };
    }),
  );
}

export function runtimeFindings(report: PageReport, seen: Seen): RawFinding[] {
  const findings: RawFinding[] = [];
  const add = (rule: string, severity: RawFinding['severity'], message: Message, help: Message) =>
    findings.push({
      check: 'runtime',
      rule,
      severity,
      file: null,
      line: 0,
      column: 0,
      element: null,
      message,
      hint: help,
      states: [seen.state],
      widths: [seen.width],
    });

  if (!report.rendered) {
    add(
      'runtime/blank',
      'fix',
      { key: 'checkRule.blank', params: { state: seen.state } },
      hint('checkHint.blank'),
    );
  }
  for (const text of report.pageErrors) {
    add('runtime/page-error', 'fix', toolText(text), hint('checkHint.console'));
  }
  for (const message of report.console) {
    if (LOAD_FAILED.test(message.text)) continue;
    const error = message.type === 'error';
    add(
      error ? 'runtime/console-error' : 'runtime/console-warning',
      error ? 'fix' : 'review',
      toolText(message.text),
      hint('checkHint.console'),
    );
  }
  for (const request of report.failedRequests) {
    add(
      'runtime/request-failed',
      'fix',
      {
        key: 'checkRule.requestFailed',
        params: { url: buildPath(request.url), reason: request.reason },
      },
      hint('checkHint.requestFailed'),
    );
  }
  return findings;
}
