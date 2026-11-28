// Where a project kit's imports point: package specifiers or paths inside the person's project.
// Pure rules shared by the kit checks, the generated entry and the builds, so all of them read a
// target the same way.

import { KIT_PATH, type Kit, PACKAGE_SPECIFIER, PROJECT_PATH } from './contract.ts';
import type { KitIssue } from './issues.ts';

/** A JavaScript name: what a provider import or a binding may name. */
export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** A JSX prop name: a JavaScript name, or words joined by `-` (`data-theme`, `aria-label`). */
const PROP_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*(?:-[A-Za-z0-9_$]+)*$/;

/** `kit`: a file of the written kit's own `components/` folder. */
export type TargetKind = 'package' | 'project' | 'kit';

/** `@mui/material/Button` -> `@mui/material`, `clsx/lite` -> `clsx`. */
export function packageOf(specifier: string): string {
  return specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');
}

/** The major number of an installed version: `18.3.1` -> 18, `19.0.0-rc.1` -> 19. */
export function majorVersion(version: string): number | undefined {
  const match = /^(\d+)/.exec(version.trim());
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/**
 * A package specifier (C1 PACKAGE_SPECIFIER) without `.` or `..` segments: the pattern lets a
 * subpath hold them, and `@acme/ui/../../x` would climb out of node_modules.
 */
export function isPackageSpecifier(from: string): boolean {
  return (
    PACKAGE_SPECIFIER.test(from) && !from.split('/').some((part) => part === '.' || part === '..')
  );
}

/** A kit learned for the person's project (any source but built-in), as opposed to one shipped with kitvas. */
export const isProjectKit = (kit: Kit): boolean => kit.source.type !== 'builtin';

/** A kit whose components an agent wrote into its own `components/` folder (Figma, web, images, code). */
export const isWrittenKit = (kit: Kit): boolean =>
  kit.source.type === 'figma' ||
  kit.source.type === 'web' ||
  kit.source.type === 'images' ||
  kit.source.type === 'code';

/** The packages a kit names on purpose: its npm source and `runtime.packages`. */
function declaredPackages(kit: Kit): Set<string> {
  const names = kit.runtime.packages.map((entry) => entry.name);
  if (kit.source.type === 'npm') names.push(kit.source.package);
  return new Set(names);
}

/**
 * What a provider import, a binding or a style import of a project kit names; each may be a package
 * or a file of the project. Both shapes overlap (`src/theme` is a valid package specifier), so the
 * rule is: a scoped specifier, or one whose package the kit declares in `runtime.packages` or as its
 * npm source, is a package; any other project path is a file of the project. `undefined` when it is
 * neither shape.
 */
export function moduleKind(kit: Kit, from: string): TargetKind | undefined {
  const isSpecifier = isPackageSpecifier(from);
  if (isWrittenKit(kit)) {
    // A written kit has no project paths: its own files, or a package it declares.
    if (KIT_PATH.test(from)) return 'kit';
    return isSpecifier && declaredPackages(kit).has(packageOf(from)) ? 'package' : undefined;
  }
  if (isSpecifier && (from.startsWith('@') || declaredPackages(kit).has(packageOf(from)))) {
    return 'package';
  }
  if (PROJECT_PATH.test(from)) return 'project';
  return isSpecifier ? 'package' : undefined;
}

/**
 * What a component's `import.from` names: always a package in an npm kit, always a file of the
 * project in a repo kit. `undefined` when it does not fit the kit's source (or for a built-in kit).
 */
export function componentKind(kit: Kit, from: string): TargetKind | undefined {
  switch (kit.source.type) {
    case 'npm':
      return isPackageSpecifier(from) ? 'package' : undefined;
    case 'repo':
      return moduleKind(kit, from) === 'project' ? 'project' : undefined;
    case 'figma':
    case 'web':
    case 'images':
    case 'code':
      return KIT_PATH.test(from) ? 'kit' : undefined;
    case 'builtin':
      return undefined;
  }
}

export type ImportTarget = {
  /** Where in kit.json: `components.Button.import.from`, `runtime.styles.imports.0`. */
  at: string;
  /** Who imports it, for messages: a component, a provider, a binding or the style imports. */
  label: string;
  from: string;
  kind: TargetKind | undefined;
};

/** Every module a project kit imports, in kit.json order; [] for a built-in kit. */
export function importTargets(kit: Kit): ImportTarget[] {
  if (!isProjectKit(kit)) return [];
  const targets: ImportTarget[] = kit.components.map((component) => ({
    at: `components.${component.name}.import.from`,
    label: component.name,
    from: component.import.from,
    kind: componentKind(kit, component.import.from),
  }));
  for (const [index, provider] of kit.runtime.providers.entries()) {
    const at = `runtime.providers.${index}`;
    const { from } = provider.import;
    targets.push({
      at: `${at}.import.from`,
      label: provider.import.name ?? at,
      from,
      kind: moduleKind(kit, from),
    });
    for (const [prop, binding] of Object.entries(provider.bindings)) {
      targets.push({
        at: `${at}.bindings.${prop}.from`,
        label: binding.name,
        from: binding.from,
        kind: moduleKind(kit, binding.from),
      });
    }
  }
  for (const [index, from] of kit.runtime.styles.imports.entries()) {
    targets.push({
      at: `runtime.styles.imports.${index}`,
      label: 'runtime.styles.imports',
      from,
      kind: styleKind(kit, from),
    });
  }
  return targets;
}

/** A style import: as any module, and in a `code` kit a style file of the project too. */
export function styleKind(kit: Kit, from: string): TargetKind | undefined {
  const kind = moduleKind(kit, from);
  if (kind === undefined && kit.source.type === 'code' && PROJECT_PATH.test(from)) return 'project';
  return kind;
}

/**
 * Names that generated code writes without quotes (provider imports, provider props, bindings)
 * must be plain names. Checked for every kit: a kit in a project folder may say it is built in.
 */
function nameIssues(kit: Kit): KitIssue[] {
  const issues: KitIssue[] = [];
  const check = (name: string, pattern: RegExp, path: string): void => {
    if (!pattern.test(name)) issues.push({ path, key: 'kitIssue.nameInvalid', params: { name } });
  };
  for (const [index, provider] of kit.runtime.providers.entries()) {
    const at = `runtime.providers.${index}`;
    if (provider.import.name !== undefined && provider.import.default !== true) {
      check(provider.import.name, IDENTIFIER, `${at}.import.name`);
    }
    for (const prop of Object.keys(provider.props)) check(prop, PROP_NAME, `${at}.props.${prop}`);
    for (const [prop, binding] of Object.entries(provider.bindings)) {
      check(prop, PROP_NAME, `${at}.bindings.${prop}`);
      check(binding.name, IDENTIFIER, `${at}.bindings.${prop}.name`);
    }
  }
  return issues;
}

function importIssueKey(kit: Kit): string {
  if (kit.source.type === 'npm') return 'kitIssue.importNotPackage';
  return isWrittenKit(kit) ? 'kitIssue.importNotKitPath' : 'kitIssue.importNotProjectPath';
}

/** `project` and `original` belong to a `code` kit, and a component names files or a package. */
function codeKitIssues(kit: Kit): KitIssue[] {
  const issues: KitIssue[] = [];
  const isCode = kit.source.type === 'code';
  for (const component of kit.components) {
    const { project } = component;
    if (project !== undefined && !isCode) {
      issues.push({
        path: `components.${component.name}.project`,
        key: 'kitIssue.onlyCodeKit',
        params: { component: component.name, field: 'project' },
      });
    }
    const given = [project?.files, project?.package].filter((part) => part !== undefined).length;
    if (project !== undefined && given !== 1) {
      issues.push({
        path: `components.${component.name}.project`,
        key: 'kitIssue.originOneOf',
        params: { component: component.name },
      });
    }
    if (isCode) continue;
    for (const [index, example] of component.examples.entries()) {
      if (example.original === undefined) continue;
      issues.push({
        path: `components.${component.name}.examples.${index}.original`,
        key: 'kitIssue.onlyCodeKit',
        params: { component: component.name, field: 'original' },
      });
    }
  }
  return issues;
}

/** The source rules: plain names everywhere, and imports that fit a project kit's source. */
export function sourceIssues(kit: Kit): KitIssue[] {
  const issues = [...nameIssues(kit), ...codeKitIssues(kit)];
  const key = importIssueKey(kit);
  for (const target of importTargets(kit)) {
    if (target.kind !== undefined) continue;
    issues.push({ path: target.at, key, params: { component: target.label, from: target.from } });
  }
  return issues;
}

/** What `kit new --from` names. */
export type SourceFlag = {
  type: 'npm' | 'repo' | 'figma' | 'web' | 'images' | 'code';
  value: string;
};

/**
 * `npm:<package>`, `repo:<folder>`, `figma:<url>`, `web:<url>`, `images:<folder>` or
 * `code:<folder>`. A folder may
 * be written with backslashes, a leading `./` or a trailing slash; it comes back with forward
 * slashes and without them. A package name and a URL are kept as written. `undefined` for any
 * other shape.
 */
export function parseSourceFlag(text: string | undefined): SourceFlag | undefined {
  const match = /^(npm|repo|figma|web|images|code):(.+)$/.exec(text?.trim() ?? '');
  const type = match?.[1];
  const value = match?.[2]?.trim();
  if (!value) return undefined;
  if (type === 'npm' || type === 'figma' || type === 'web') return { type, value };
  if (type !== 'repo' && type !== 'images' && type !== 'code') return undefined;
  const path = value
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '');
  return path ? { type, value: path } : undefined;
}
