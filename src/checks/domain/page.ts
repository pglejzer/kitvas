// The browser checks: what one visit of the page reports, turned into findings.

import { type Message, type RawFinding, toolText } from './finding.ts';
import { elementPlace, type IdEntry } from './ids.ts';
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
};

/** Which visit a finding comes from. */
export type Seen = { state: string; width: number; ids: IdEntry[] };

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

export function a11yFindings(violations: AxeViolation[], seen: Seen): RawFinding[] {
  return violations.flatMap((violation) =>
    violation.nodes.map(
      (node): RawFinding => ({
        check: 'a11y',
        rule: `a11y/${violation.id}`,
        severity: SERIOUS.has(violation.impact ?? '') ? 'fix' : 'review',
        ...elementPlace(seen.ids, node.element),
        element: node.element,
        message: toolText(violation.help),
        hint: toolText(node.summary.trim()),
        states: [seen.state],
        widths: [seen.width],
      }),
    ),
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
