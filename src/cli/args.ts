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
  /** `craft new --subject component|icon|logo`. */
  subject: string | undefined;
  /** `craft new --name <PascalCase>`. */
  name: string | undefined;
  /** `craft new --description <text>`. */
  description: string | undefined;
  /** `craft add --category <category>`: a crafted component's catalog category (default display). */
  category: string | undefined;
  /** `craft add --replace`: replace an earlier addition of the same name. */
  replace: boolean;
  /** `craft export --to <folder>`. */
  to: string | undefined;
  /** `craft new --image <file>`, repeatable; empty when absent. */
  image: string[];
  /** `craft new --kit <id>`: the kit to make the draft for. */
  kit: string | undefined;
  /** `rework new --figma-image <file>`: the PNG of a Figma frame the skill saved. */
  figmaImage: string | undefined;
  /** `rework new --note <file>`: the frame's structure note, with `--figma-image`. */
  note: string | undefined;
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
        subject: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        replace: { type: 'boolean' },
        to: { type: 'string' },
        image: { type: 'string', multiple: true },
        kit: { type: 'string' },
        'figma-image': { type: 'string' },
        note: { type: 'string' },
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
        subject: values.subject,
        name: values.name,
        description: values.description,
        category: values.category,
        replace: values.replace === true,
        to: values.to,
        image: values.image ?? [],
        kit: values.kit,
        figmaImage: values['figma-image'],
        note: values.note,
      },
    };
  } catch (cause) {
    throw new KitvasError('USAGE', {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
