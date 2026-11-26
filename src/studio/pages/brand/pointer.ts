// The pointer of the kitvas logo (spec 6.2, ADR 0068): the "v" of the word, and its place on the
// mark's block. A file of its own that imports nothing, so the frame's mark of Claude
// (`client/frame/edit/claude-marks.ts`) draws the same pointer without the rest of the logo
// (ADR 0080); `logo.ts` draws it from here too.

/** The "v": a letter of the word, and the pointer of the mark. */
export const V = 'M0 0H9L16 15.3L23 0H32L16 35Z';
/** Its place on the block; `skin/logo.ts` says the same as a rule, where its motion ends. */
export const POINTER_PLACE = 'translate(34 34) rotate(135) scale(0.83) translate(-16 -35)';
