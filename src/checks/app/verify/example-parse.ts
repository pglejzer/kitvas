// Which examples of a kit parse, and what the bundler says about one that does not.
// The catalog build leaves an example that does not parse out of its bundle; `kit verify` says why.

import type { Kit } from '../../../kit/index.ts';
import { type Bundler, exampleFunction, exampleKey } from '../../../render/index.ts';

export type ParsedExample = {
  /** `Button.1`. */
  key: string;
  /** Place in kit.json: `components.0.examples.0`. */
  path: string;
  code: string;
  parses: boolean;
};

/** Every example in catalog order, checked the way the catalog build checks it. */
export async function parseExamples(bundler: Bundler, kit: Kit): Promise<ParsedExample[]> {
  const examples: ParsedExample[] = [];
  for (const [index, component] of kit.components.entries()) {
    for (const [number, example] of component.examples.entries()) {
      const key = exampleKey(component.name, number);
      const parsed = await bundler.transform(
        exampleFunction('KitvasCheck', example.code),
        `${key}.tsx`,
      );
      examples.push({
        key,
        path: `components.${index}.examples.${number}`,
        code: example.code,
        parses: parsed !== undefined,
      });
    }
  }
  return examples;
}

/** The first line of the code, when the bundler has no words for it. */
const firstLine = (code: string): string => (code.trim().split('\n')[0] ?? '').slice(0, 120);

/**
 * Why an example does not parse, in the bundler's words. `transform` only says that it failed;
 * a bundle of the example alone stops at the same syntax error and reports it.
 */
export async function parseError(
  bundler: Bundler,
  workingDir: string,
  example: ParsedExample,
): Promise<string> {
  const { errors } = await bundler.bundle({
    workingDir,
    entry: { name: `${example.key}.tsx`, source: exampleFunction('KitvasCheck', example.code) },
    alias: {},
    ids: {},
  });
  return errors[0]?.message ?? firstLine(example.code);
}
