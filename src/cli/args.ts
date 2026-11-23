// Parses kitvas command lines.

import { parseArgs } from 'node:util';
import { KitvasError } from '../shared/index.ts';

/** Named options a command may read. Every command gets all of them; unused ones are undefined. */
export type Flags = {
  title: string | undefined;
  section: string | undefined;
  timeout: string | undefined;
  /** `kit new --from npm:<package>|repo:<folder>`. */
  from: string | undefined;
  /** `kit scan --url <page>`, repeatable; empty when absent. */
  url: string[];
  /** `kit scan --allow-private`: scan private and local addresses too. */
  allowPrivate: boolean;
  /** `studio --open`: open the one-time link in the default browser. */
  open: boolean;
  /** `context --save`: write the context to the draft's build folder. */
  save: boolean;
  /** `check --deep`: the stress passes and the extra widths. */
  deep: boolean;
  /** `guidelines --check a11y|ui|ux`. */
  check: string | undefined;
  /** `guidelines --mode auto|deep|manual`. */
  mode: string | undefined;
  /** `guidelines --screen <kind>`. */
  screen: string | undefined;
};

export type ParsedArgs = {
  command: string | undefined;
  positionals: string[];
  json: boolean;
  help: boolean;
  flags: Flags;
};

export function parseCliArgs(argv: string[]): ParsedArgs {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        data: { type: 'string' },
        title: { type: 'string' },
        section: { type: 'string' },
        timeout: { type: 'string' },
        from: { type: 'string' },
        url: { type: 'string', multiple: true },
        'allow-private': { type: 'boolean' },
        open: { type: 'boolean' },
        save: { type: 'boolean' },
        deep: { type: 'boolean' },
        check: { type: 'string' },
        mode: { type: 'string' },
        screen: { type: 'string' },
      },
    });
    const [command, ...rest] = positionals;
    return {
      command,
      positionals: rest,
      json: values.json === true,
      help: values.help === true,
      flags: {
        title: values.title,
        section: values.section,
        timeout: values.timeout,
        from: values.from,
        url: values.url ?? [],
        allowPrivate: values['allow-private'] === true,
        open: values.open === true,
        save: values.save === true,
        deep: values.deep === true,
        check: values.check,
        mode: values.mode,
        screen: values.screen,
      },
    };
  } catch (cause) {
    throw new KitvasError('USAGE', {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
