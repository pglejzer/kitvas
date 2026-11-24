// Two sources side by side, line by line (plan 17, task D): the rows the diff dialog shows. Pure.
// Lines both have stand in one row; a run of lines only one side has stands beside the run the
// other side has in its place, so a changed line reads across.

export type DiffRow = {
  /** The old source's line; `null` where it has none in this row. */
  old: string | null;
  current: string | null;
  same: boolean;
};

/** Over this many cells the table is not made: the two sources are shown top to bottom, unpaired. */
const MAX_CELLS = 4_000_000;

const linesOf = (text: string): string[] => text.replace(/\r\n/g, '\n').split('\n');

/** How long the longest common run of lines is from each pair of places on. */
function lengths(a: readonly string[], b: readonly string[]): Uint32Array {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const down = table[(i + 1) * width + j] ?? 0;
      const right = table[i * width + j + 1] ?? 0;
      const both = (table[(i + 1) * width + j + 1] ?? 0) + 1;
      table[i * width + j] = a[i] === b[j] ? both : Math.max(down, right);
    }
  }
  return table;
}

/** A run of lines only the old side has beside the run only the current side has. */
function paired(olds: readonly string[], currents: readonly string[]): DiffRow[] {
  const rows: DiffRow[] = [];
  for (let i = 0; i < Math.max(olds.length, currents.length); i += 1) {
    rows.push({ old: olds[i] ?? null, current: currents[i] ?? null, same: false });
  }
  return rows;
}

export function diffRows(old: string, current: string): DiffRow[] {
  const a = linesOf(old);
  const b = linesOf(current);
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) return paired(a, b);
  const table = lengths(a, b);
  const width = b.length + 1;
  const rows: DiffRow[] = [];
  let olds: string[] = [];
  let currents: string[] = [];
  const flush = (): void => {
    rows.push(...paired(olds, currents));
    olds = [];
    currents = [];
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const left = a[i];
    const right = b[j];
    if (left !== undefined && right !== undefined && left === right) {
      flush();
      rows.push({ old: left, current: right, same: true });
      i += 1;
      j += 1;
    } else if (
      left !== undefined &&
      (right === undefined || (table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0))
    ) {
      olds.push(left);
      i += 1;
    } else if (right !== undefined) {
      currents.push(right);
      j += 1;
    }
  }
  flush();
  return rows;
}

/** Whether the two sources differ in anything but how their lines end. */
export const differs = (old: string, current: string): boolean =>
  diffRows(old, current).some((row) => !row.same);
