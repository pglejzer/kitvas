// Owner rule: no `any` in any form, also none that comes in from the standard library's types.
// These overloads are declared after the library's, so TypeScript tries them first: `JSON.parse`
// gives `unknown` and `Array.isArray` narrows to `unknown[]`. Values are then checked (zod, guards).

interface JSON {
  parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown;
}

interface ArrayConstructor {
  isArray(arg: unknown): arg is unknown[];
}
