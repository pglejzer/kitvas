// The compiler the editor needs: the same one-file `jsxDev` compile the build uses for element ids
// (render/domain/sites.ts), here to find an element again in text that changed since the build and
// to refuse a TSX result that does not compile (spec 4a, decisions 6 and 10).

export interface EditCompiler {
  /**
   * esbuild's output for one draft `.tsx` file with `jsx: 'automatic'` and `jsxDev: true`, as the
   * build compiles it. `file` is the path inside the version (`src/tsx/sections/Hero.tsx`); it is
   * only the `sourcefile`. `null` when the text does not parse.
   *
   * Lines and columns in the output are 1-based; columns count UTF-16 code units, and a CRLF file
   * counts lines by `\n` (checked 2026-11-23 with the repo's esbuild).
   */
  jsxDev(text: string, file: string): Promise<string | null>;
}
