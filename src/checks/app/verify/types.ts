// Step `types`: every enum value, the required props and every example of the catalog compile
// against the design system's real types.

import { join } from 'node:path';
import type { LoadedKit } from '../../../kit/index.ts';
import { type BuildFs, type Bundler, exampleFunction } from '../../../render/index.ts';
import {
  KIT_TYPES_FILE,
  kitTypeIssues,
  kitTypesSource,
  type TypesExample,
} from '../../domain/kit/kit-types.ts';
import type { VerifyIssue } from '../../domain/kit/kit-verify.ts';
import type { TypeChecker } from '../../ports/type-checker.ts';
import { type ParsedExample, parseError } from './example-parse.ts';
import { importedName } from './imports.ts';
import { componentAtEntryLine, entryFile, isEntryFile } from './kit-entry.ts';
import { ran, type StepResult, toolIssue } from './step.ts';

export type TypesInput = {
  loaded: LoadedKit;
  /** The kit's catalog folder; tsc runs there. */
  dir: string;
  /** Every example of the kit, with whether it parses. */
  examples: ParsedExample[];
  types: TypeChecker;
  bundler: Bundler;
  fs: BuildFs;
};

export async function typesStep(input: TypesInput): Promise<StepResult> {
  const { loaded, dir, examples, types, bundler, fs } = input;
  const { kit } = loaded;
  const issues: VerifyIssue[] = [];

  // tsc reports no type error at all while a file has a syntax error, so an example that does not
  // parse is reported here and kept out of the file.
  const sound: TypesExample[] = [];
  for (const example of examples) {
    if (example.parses) {
      sound.push({
        key: example.key,
        path: example.path,
        source: exampleFunction(`KitvasExample${sound.length}`, example.code),
      });
      continue;
    }
    issues.push({
      step: 'types',
      path: example.path,
      key: 'kitIssue.exampleRejected',
      params: { key: example.key, detail: await parseError(bundler, dir, example) },
    });
  }

  const file = kitTypesSource(
    kit.components.map((component) => ({
      name: component.name,
      exported: importedName(component),
      from: component.import.from,
      props: component.props,
    })),
    sound,
  );
  const entry = join(dir, ...KIT_TYPES_FILE.split('/'));
  fs.writeText(entry, file.text);
  const messages = await types.check({
    workingDir: dir,
    entry,
    kitEntry: entryFile(loaded),
    project: loaded.project,
    resolve: loaded.kit.resolve,
  });

  const own = messages.filter((message) => message.file === KIT_TYPES_FILE);
  issues.push(...kitTypeIssues(file.targets, own));

  const reported = new Set(issues.map((issue) => issue.path));
  for (const message of messages) {
    if (message.file === KIT_TYPES_FILE) continue;
    if (message.file === null) {
      // No file: tsc could not start on the kit at all (a setting, a missing type package).
      issues.push(toolIssue('types', 'runtime.entry', message.text));
      continue;
    }
    // Messages inside the design system's own files are not about kit.json: the project checks
    // its code with its own settings. Only the kit's entry is ours to answer for.
    if (!isEntryFile(loaded, dir, message.file)) continue;
    const index = componentAtEntryLine(loaded, message.line);
    const component = index === undefined ? undefined : kit.components[index];
    if (!component) {
      issues.push(toolIssue('types', 'runtime.entry', message.text));
      continue;
    }
    const path = `components.${index}.import`;
    if (reported.has(path)) continue;
    reported.add(path);
    issues.push({
      step: 'types',
      path,
      key: 'kitIssue.exportMissing',
      params: { name: importedName(component), from: component.import.from },
    });
  }
  return ran(issues);
}
