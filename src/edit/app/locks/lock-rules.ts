// The lock rules of the editor (spec 4d, goal 4; plan 17, task C), pure over offsets in one file's
// text now: what an op writes (`Touch`), and whether that changes a locked element.
//
// An op changes a locked element when it writes in it: its own tag, props, text or class, a child
// it adds or takes away, or anything deeper; also when it removes, replaces or wraps it, or a
// subtree that holds it; and when it changes a class rule an element in it carries. Moving or
// unwrapping an element around it, and moving the locked element itself, leave its source as it
// was but for its indentation, which locks ignore. A paste over a locked element with the very
// source its lock keeps is its Restore, and is no change.

import type { Span } from '../../domain/types.ts';

/** A locked element in the text now. */
export type HeldLock = {
  span: Span;
  /** The `<` of the element that holds it; `null` for a root. */
  parent: number | null;
  /** Every class written in it, its own and its descendants'. */
  classes: readonly string[];
  /** The source the lock keeps, whitespace collapsed. */
  kept: string;
};

/** What one op writes, in the text of one file. */
export type Touch =
  /** The element at `at` itself: its tag, props, text or class (4a ops, Replace tag). */
  | { kind: 'element'; at: number }
  /**
   * The subtree at `span` goes (delete, reset, a list item). `source`: a paste over writes this in
   * its place, whitespace collapsed.
   */
  | { kind: 'subtree'; span: Span; source?: string | undefined }
  /** The element at `at` is replaced by its children. */
  | { kind: 'unwrap'; at: number }
  /** An element goes into the element at `at`, as its first or last child. */
  | { kind: 'into'; at: number }
  /** An element comes or goes beside the one at `at`: its parent's children change. */
  | { kind: 'beside'; at: number }
  /** The siblings in `span` (from the first's `<` to the last's end) go into a new element. */
  | { kind: 'wrap'; span: Span; parent: number | null }
  /** A rule of the section's style sheet. */
  | { kind: 'class'; name: string };

/** `at` is the element of `span` or lies in it. */
const holds = (span: Span, at: number): boolean => span.start <= at && at < span.end;
/** `at` lies in `span` and is not its own `<`. */
const within = (span: Span, at: number): boolean => span.start < at && at < span.end;

/** A paste over `touch.span` with `source`: the Restore of `lock`, or of a subtree around it. */
function restores(touch: { span: Span; source: string }, lock: HeldLock): boolean {
  const { span } = lock;
  if (touch.span.start === span.start && touch.span.end === span.end) {
    return touch.source === lock.kept;
  }
  // A locked element inside it must come back as its lock keeps it.
  return within(touch.span, span.start) && touch.source.includes(lock.kept);
}

export function changesLock(touch: Touch, lock: HeldLock): boolean {
  const { span } = lock;
  switch (touch.kind) {
    case 'element':
    case 'unwrap':
    case 'into':
      return holds(span, touch.at);
    case 'beside':
      return within(span, touch.at);
    case 'subtree': {
      const meets = holds(span, touch.span.start) || holds(touch.span, span.start);
      if (!meets) return false;
      const { source } = touch;
      return source === undefined || !restores({ span: touch.span, source }, lock);
    }
    case 'wrap':
      return (
        within(span, touch.span.start) ||
        (lock.parent === touch.parent && holds(touch.span, span.start))
      );
    case 'class':
      return lock.classes.includes(touch.name);
  }
}
