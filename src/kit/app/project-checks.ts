// Use case: check a project kit against the project on disk. `loadKit` stays pure; these run in
// `kit check` and in the schema step of `kit verify`.

import type { KitIssue } from '../domain/issues.ts';
import { importTargets, isProjectKit, majorVersion, packageOf } from '../domain/sources.ts';
import type { ProjectFiles } from '../ports/project-files.ts';
import { type LoadedKit, ownKit } from './load-kit.ts';

/** The oldest React whose APIs kitvas's runtime uses (createRoot, flushSync). */
const OLDEST_REACT = 18;

/**
 * The disk checks of a project kit: every project path it names exists and stays inside the project
 * (a symlink may lead out), every package it imports is installed, and the project's React, when it
 * has one, is 18 or later. Each path and package is reported once, at its first place. [] for a
 * built-in kit.
 */
export function projectIssues(files: ProjectFiles, loaded: LoadedKit): KitIssue[] {
  // The project's additions import their own files, never the project's paths or packages.
  const kit = ownKit(loaded);
  if (!isProjectKit(kit)) return [];
  const issues: KitIssue[] = [];
  const seenPaths = new Set<string>();
  const seenPackages = new Set<string>();

  const checkPath = (path: string, at: string): void => {
    if (seenPaths.has(path)) return;
    seenPaths.add(path);
    if (!files.exists(path)) {
      issues.push({ path: at, key: 'kitIssue.fileMissing', params: { file: path } });
    } else if (!files.realInside(path)) {
      issues.push({ path: at, key: 'kitIssue.pathOutside', params: { path } });
    }
  };
  const checkPackage = (specifier: string, at: string): void => {
    const name = packageOf(specifier);
    if (seenPackages.has(name)) return;
    seenPackages.add(name);
    if (files.packageVersion(name) === undefined) {
      issues.push({ path: at, key: 'kitIssue.packageMissing', params: { name } });
    }
  };

  if (kit.source.type === 'repo') checkPath(kit.source.path, 'source.path');
  if (kit.source.type === 'npm') checkPackage(kit.source.package, 'source.package');
  const tailwind = kit.runtime.styles.tailwind;
  if (tailwind) checkPath(tailwind.entry, 'runtime.styles.tailwind.entry');
  for (const target of importTargets(kit)) {
    if (target.kind === 'project') checkPath(target.from, target.at);
    else if (target.kind === 'package') checkPackage(target.from, target.at);
  }

  const react = files.packageVersion('react');
  const major = react === undefined ? undefined : majorVersion(react);
  if (react !== undefined && major !== undefined && major < OLDEST_REACT) {
    issues.push({ path: 'framework', key: 'kitIssue.reactTooOld', params: { version: react } });
  }
  return issues;
}
