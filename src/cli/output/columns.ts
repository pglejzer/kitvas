/** Pads every cell but the last of each row to its column's width and joins cells with two spaces. */
export function columns(rows: string[][]): string[] {
  const widths = rows.reduce<number[]>(
    (found, row) => row.map((cell, index) => Math.max(found[index] ?? 0, cell.length)),
    [],
  );
  return rows.map((row) =>
    row
      .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
      .join('  '),
  );
}
