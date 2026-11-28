// The page an example of a `code` kit stands in (`around`, W51a) holds only when every page that uses
// the component is that page (W42 of `reference/write-kit-code.md`). Pure: the step reads the files.

/** The first class of the outermost element an example stands in; undefined when it names none. */
export function aroundPage(
  around: readonly { attributes: Record<string, string> }[] | undefined,
): string | undefined {
  return around?.[0]?.attributes.class?.split(/\s+/).find((word) => word !== '');
}

/** A kit component as the project writes it: its tag and its own files. */
export type Owner = { name: string; files: readonly string[] };

/**
 * The files, of those given, where the tag `name` (`<app-card`, `<AppCard`) stands on a page that is
 * not `page`: a file that uses it and never names the class. A file of another kit component is no
 * page: the places that component stands in count instead. A rule of `page` is not the component's
 * own when this finds a file.
 */
export function usedElsewhere(
  files: readonly { file: string; text: string }[],
  name: string,
  page: string,
  owners: readonly Owner[],
  seen: ReadonlySet<string> = new Set([name]),
): string[] {
  // The whole tag: `<app-card` is not `<app-card-title`.
  const tag = new RegExp(`<${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  const found: string[] = [];
  const passed = new Set(seen);
  for (const { file, text } of files) {
    if (!tag.test(text) || text.includes(page)) continue;
    const owner = owners.find((other) => other.files.includes(file));
    if (owner === undefined) found.push(file);
    else if (!passed.has(owner.name)) {
      passed.add(owner.name);
      found.push(...usedElsewhere(files, owner.name, page, owners, passed));
    }
  }
  return found;
}
