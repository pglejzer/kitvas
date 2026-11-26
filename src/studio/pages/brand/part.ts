// The loose kit part of the kitvas logo (ADR 0084): a small rounded square, the dot of the "i" and
// the full stop of the word. A file of its own that imports nothing, so the frame's mark of Claude
// (`client/frame/edit/claude-marks.ts`) draws the same part without the rest of the logo
// (ADR 0080); `logo.ts` draws it from here too.

/** The part, 7 by 7 with a corner radius of 2, centred on 0 0 and unturned. */
export const PART_D =
  'M-1.5 -3.5H1.5A2 2 0 0 1 3.5 -1.5V1.5A2 2 0 0 1 1.5 3.5H-1.5A2 2 0 0 1 -3.5 1.5V-1.5A2 2 0 0 1 -1.5 -3.5Z';
/** Its turn in degrees; `skin/logo.ts` says the same as a rule, where its motions end. */
export const PART_TURN = -15;
