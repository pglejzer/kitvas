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
  /** `request answer --file <variants.json>`. */
  file: string | undefined;
  /** `request done --message <text>`. */
  message: string | undefined;
  /** `request fail --reason <text>`. */
  reason: string | undefined;
  /** `doctor --report`: print the text to paste into an issue. */
  report: boolean;
  /** `draft list --deleted`: the deleted drafts. */
  deleted: boolean;
  /** `draft purge --all`: every deleted draft, for good. */
  all: boolean;
  /** `decisions add|replace --text <one line>`: the decision to keep. */
  text: string | undefined;
  /** `decisions replace --old <line>`: the decision it swaps. */
  old: string | undefined;
  /** `handoff figma --widths 1280,390`: the widths of the frames. */
  widths: string | undefined;
  /** `handoff figma|compare --state <state>`: the state of the draft to send or compare. */
  state: string | undefined;
  /** `handoff figma --sections a,b`: send only these sections. */
  sections: string | undefined;
  /** `handoff figma --resume`: answer with the package already on disk. */
  resume: boolean;
  /** `handoff sent --result <file>`: the result file the skill wrote. */
  result: string | undefined;
  /** `handoff target|brief --in <folder>`: the folder of the project to read. */
  in: string | undefined;
  /** `handoff brief --scope new|named|open`: where the fitter may write. */
  scope: string | undefined;
  /** `handoff brief --files a,b`: the existing files the person names (scope `named`). */
  files: string | undefined;
  /** `handoff brief --again`: take the listing of the project again. */
  again: boolean;
  /** `handoff compare --selector <css>`: the region of the page to compare. */
  selector: string | undefined;
  /** `kit verify --current Button,Card`: components looked at against the project, no change needed. */
  current: string | undefined;
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
        file: { type: 'string' },
        message: { type: 'string' },
        reason: { type: 'string' },
        report: { type: 'boolean' },
        deleted: { type: 'boolean' },
        all: { type: 'boolean' },
        text: { type: 'string' },
        old: { type: 'string' },
        widths: { type: 'string' },
        state: { type: 'string' },
        sections: { type: 'string' },
        resume: { type: 'boolean' },
        result: { type: 'string' },
        in: { type: 'string' },
        scope: { type: 'string' },
        files: { type: 'string' },
        again: { type: 'boolean' },
        selector: { type: 'string' },
        current: { type: 'string' },
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
        file: values.file,
        message: values.message,
        reason: values.reason,
        report: values.report === true,
        deleted: values.deleted === true,
        all: values.all === true,
        text: values.text,
        old: values.old,
        widths: values.widths,
        state: values.state,
        sections: values.sections,
        resume: values.resume === true,
        result: values.result,
        in: values.in,
        scope: values.scope,
        files: values.files,
        again: values.again === true,
        selector: values.selector,
        current: values.current,
      },
    };
  } catch (cause) {
    throw new KitvasError('USAGE', {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
