// The Tailwind worker: `node tailwind-worker.ts`, one build per process, started by tailwind-css.ts
// with limits. It reads a `UtilityInput` as JSON on stdin and prints a `TailwindAnswer` as JSON on
// stdout. The project's compiler and its plugins run here, never in kitvas's own process.

import { text } from 'node:stream/consumers';
import { compileTailwind, parseRequest, type TailwindAnswer } from './tailwind-compile.ts';

const request = parseRequest(await text(process.stdin));
const answer: TailwindAnswer = request
  ? await compileTailwind(request)
  : { ok: false, message: 'The Tailwind worker got no valid request.' };
// Exit once the answer is written: a handle a plugin left open must not hold the process.
process.stdout.write(JSON.stringify(answer), () => process.exit(0));
