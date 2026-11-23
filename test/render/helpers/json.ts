// JSON in tests stays `unknown` until a test narrows it: a path into it, or its keys.

export const parseJson = (text: string): unknown => JSON.parse(text);

/** The value at a path of keys and indexes; `undefined` where the path leaves the data. */
export function at(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/** The keys of the object at a path, in order; none when it is no object. */
export function keysAt(value: unknown, ...path: (string | number)[]): string[] {
  const found = at(value, ...path);
  return typeof found === 'object' && found !== null ? Object.keys(found) : [];
}
