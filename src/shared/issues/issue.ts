// A problem found in a file kitvas reads (a kit, a draft). Callers turn `key` into text with t().

export type Issue = {
  /** Where, as a dotted path: `components.Button.props.size`, `layout.hero`. */
  path: string;
  /** Message key in locales. */
  key: string;
  params: Record<string, string | number>;
};
