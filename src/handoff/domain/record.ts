// The record of a draft's hand-offs, `.kitvas/drafts/<slug>/handoff.json` (plan 21 goal A6, plan 22
// goal B6): one entry per send to Figma or into the project's code, newest first, at most
// MAX_SENDS. The skill writes a result file and `kitvas handoff sent` reads it here: the time is
// the command's, never the file's. Pure: `app/record.ts` reads and writes the file.

import { err, KitvasError, ok, type Result, type Zod, z } from '../../shared/index.ts';
import { WRITE_SCOPES } from './code/listing.ts';
import { isInsideProject, normalizeFolder } from './code/scope.ts';

/** Inside the draft's folder, beside `draft.json`. */
export const HANDOFF_RECORD_FILE = 'handoff.json';
export const MAX_SENDS = 50;

/** The id `kitvas handoff figma` gives a send; frames carry it in their names until the close. */
export const SEND_ID = /^[a-z0-9]{4,32}$/;
/** A Figma file key, as in the file's link `figma.com/design/<key>/…`. */
const FILE_KEY = /^[A-Za-z0-9]{22,128}$/;
/** A Figma node id. */
const NODE_ID = /^\d+:\d+$/;
const FIGMA_URL = /^https:\/\/www\.figma\.com\/\S*$/;
/** `new Date().toISOString()`. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const oneLine = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[^\r\n]*$/);
const version = z.number().int().min(1);
const width = z.number().int().min(1).max(10_000);
const time = z.string().regex(ISO_TIME);
const projectPath = z.string().max(500).refine(isInsideProject, { message: 'outside' });
/** The folder written to, from the project root; '' is the root. */
const folder = z
  .string()
  .max(500)
  .refine((path) => path === normalizeFolder(path) && (path === '' || isInsideProject(path)), {
    message: 'outside',
  });
const frame = z.strictObject({ width, node: z.string().regex(NODE_ID) });
const script = z.strictObject({ command: oneLine(500), ok: z.boolean() });
const look = z.strictObject({ width, score: z.number().min(0).max(100) });

const FigmaResultSchema = z.strictObject({
  target: z.literal('figma'),
  version,
  sendId: z.string().regex(SEND_ID),
  state: z.enum(['sent', 'partial']),
  /** The manifest step a partial send stopped at (`30-1280-02.js`); null when none was left. */
  lastStep: oneLine(200).nullable(),
  file: z.strictObject({
    key: z.string().regex(FILE_KEY),
    url: z.string().max(2000).regex(FIGMA_URL),
  }),
  page: oneLine(200).nullable(),
  /** The frame made at each width, by the id Figma gave it. */
  frames: z.array(frame).max(20),
  /** `Family Style` of each font Figma did not have; Inter stood in for it. */
  fontsMissing: z.array(oneLine(200)).max(200),
});

const CodeResultSchema = z.strictObject({
  target: z.literal('code'),
  version,
  state: z.enum(['done', 'partial']),
  to: folder,
  scope: z.enum(WRITE_SCOPES),
  files: z.array(projectPath).max(5000),
  outside: z.array(projectPath).max(5000),
  /** The project's own scripts the skill ran afterwards. */
  scripts: z.array(script).max(50),
  /** The `look` score per width; null when nothing was compared. */
  look: z.array(look).max(20).nullable(),
});

export const FigmaSendSchema = FigmaResultSchema.extend({ at: time });
export const CodeSendSchema = CodeResultSchema.extend({ at: time });
export const HandoffSendSchema = z.discriminatedUnion('target', [FigmaSendSchema, CodeSendSchema]);
export const HandoffRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sends: z.array(HandoffSendSchema).max(MAX_SENDS),
});

export type FigmaSend = Zod.infer<typeof FigmaSendSchema>;
export type CodeSend = Zod.infer<typeof CodeSendSchema>;
export type HandoffSend = Zod.infer<typeof HandoffSendSchema>;
export type HandoffRecord = Zod.infer<typeof HandoffRecordSchema>;

/** What the skill's result file may hold: a send without its time. */
const SendResultSchema = z.discriminatedUnion('target', [FigmaResultSchema, CodeResultSchema]);

/** The record of a draft that has none yet. */
export const emptyRecord = (): HandoffRecord => ({ schemaVersion: 1, sends: [] });

const invalid = (at: string, reason: string): Result<HandoffSend> =>
  err(new KitvasError('HANDOFF_INVALID', { at, reason }));

/**
 * The skill's result file as one send, stamped with `at` (the command's clock, ISO). The first
 * problem is `HANDOFF_INVALID` with `at`, where it is (`file.key`, `frames.0.node`, `state`, an
 * unknown key such as `colour`), and `reason`, zod's code for it. A result that carries its own
 * `at` is refused as an unknown key: the time is not the file's to give.
 */
export function readSend(raw: unknown, at: string): Result<HandoffSend> {
  if (!ISO_TIME.test(at)) return invalid('at', 'time');
  const parsed = SendResultSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first === undefined) return invalid('result', 'shape');
    const keys = first.code === 'unrecognized_keys' ? first.keys.slice(0, 1) : [];
    const where = [...first.path.map(String), ...keys].join('.');
    return invalid(where === '' ? 'result' : where, first.code);
  }
  const send: HandoffSend = { ...parsed.data, at };
  return ok(send);
}

/**
 * The record with `send` first and at most MAX_SENDS kept, newest first. A Figma send replaces an
 * earlier one of the same send id: a `partial` send that was resumed and then `sent` is one entry.
 */
export function withSend(record: HandoffRecord, send: HandoffSend): HandoffRecord {
  const others = record.sends.filter(
    (earlier) =>
      !(send.target === 'figma' && earlier.target === 'figma' && earlier.sendId === send.sendId),
  );
  return { schemaVersion: 1, sends: [send, ...others].slice(0, MAX_SENDS) };
}
