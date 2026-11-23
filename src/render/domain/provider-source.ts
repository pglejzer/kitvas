// Source text for the kit's providers in a generated entry: their imports and the tags that wrap
// the rendered tree, the first provider outermost. Every specifier and export name is quoted with
// JSON.stringify or checked against a name pattern; nothing from kit.json is pasted as code.

/** A provider prop whose value is an export of a module: `theme={theme}` from the project's theme. */
export type MountBinding = { prop: string; from: string; name: string };

export type MountProvider = {
  /** Import path: `@kit`, a package, or an absolute path the caller made of a project path. */
  from: string;
  name: string | undefined;
  isDefault: boolean;
  /** String props passed to the provider. */
  props: Record<string, string>;
  /** Props bound to module exports; `from` follows the same rule as the provider's. */
  bindings?: MountBinding[] | undefined;
};

export type ProviderSource = {
  /** One import line per provider (`Provider0`, …) and per binding (`Binding0_0`, …). */
  imports: string[];
  /** Opening tags, outermost first. */
  open: string;
  /** Closing tags, innermost first. */
  close: string;
};

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** JSX attribute names: an identifier, dashes allowed (`aria-label`). */
const ATTRIBUTE = /^[A-Za-z_$][\w$-]*$/;

/** An export name as an import clause writes it; other text becomes a quoted name (ES2022). */
const exportName = (name: string): string => (IDENTIFIER.test(name) ? name : JSON.stringify(name));

export function providerSource(providers: MountProvider[]): ProviderSource {
  const imports: string[] = [];
  const open = providers
    .map((provider, index) => {
      const local = `Provider${index}`;
      const from = JSON.stringify(provider.from);
      imports.push(
        provider.isDefault || !provider.name
          ? `import ${local} from ${from};`
          : `import { ${exportName(provider.name)} as ${local} } from ${from};`,
      );
      const props = Object.entries(provider.props)
        .filter(([name]) => ATTRIBUTE.test(name))
        .map(([name, value]) => ` ${name}={${JSON.stringify(value)}}`);
      for (const [place, binding] of (provider.bindings ?? []).entries()) {
        if (!ATTRIBUTE.test(binding.prop)) continue;
        const bound = `Binding${index}_${place}`;
        imports.push(
          `import { ${exportName(binding.name)} as ${bound} } from ${JSON.stringify(binding.from)};`,
        );
        props.push(` ${binding.prop}={${bound}}`);
      }
      return `<${local}${props.join('')}>`;
    })
    .join('');
  const close = providers
    .map((_, index) => `</Provider${index}>`)
    .reverse()
    .join('');
  return { imports, open, close };
}
