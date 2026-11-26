// The Kit lens's data (redesign spec goal 9, plan 19 task 2): for every element of the latest
// version, the spacing token its class rule holds (`gap`, `padding`), the values no token holds,
// and the kit component its plain JSX could be. Read with the parts `inspectElement` reads them
// with (`pickStyleClass`, `styleSource`, `suggestFor`), so the lens and the Properties panel never
// disagree. Cost: each source and style file is read once, compiled or parsed once, however many
// elements it holds. Reads only.

import {
  type DraftStore,
  latestVersion,
  loadDraft,
  parseLayout,
  pascalCase,
  SECTION_ID,
  versionFolder,
} from '../../../drafts/index.ts';
import type { KitStore } from '../../../kit/index.ts';
import { elementIds, readSites } from '../../../render/index.ts';
import { ELEMENT_ID } from '../../domain/ops.ts';
import { readRule } from '../../domain/style/apply-scss.ts';
import { type SourceInput, styleSource, tokenGroupsOf } from '../../domain/style/source.ts';
import { offsetOf, readTag } from '../../domain/tsx/apply-tsx.ts';
import { nearestToken } from '../../domain/tsx/nearest.ts';
import {
  type RuleView,
  STYLE_PROPERTIES,
  type TokenOption,
  tokenTypeOf,
} from '../../domain/types.ts';
import type { EditCompiler } from '../../ports/compiler.ts';
import { editKit, styleFormat, tokenOptions } from '../edit-state.ts';
import { catalogComponent, classesOf, pickStyleClass } from '../inspect.ts';
import { sourceFiles } from '../structure/section-files.ts';
import { suggestFor } from '../suggest/suggest.ts';

export type KitLensDeps = { drafts: DraftStore; kits: KitStore; compiler: EditCompiler };

/** The same shape as the studio's `KitLensSchema` (`src/studio/api/edit/kit-lens-schemas.ts`). */
export type KitLensView = {
  version: number;
  elements: {
    id: string;
    spacing: { property: 'gap' | 'padding'; token: string; value: string }[];
    offKit: { property: string; value: string }[];
    suggest: string | null;
  }[];
};

/** At most this many elements are answered, and this many off-kit values an element. */
export const MAX_LENS_ELEMENTS = 400;
const MAX_OFF_KIT = 3;
const MAX_TEXT = 80;
const MAX_ID = 200;

const VAR = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^)]*)?\)$/;
/** A zero is on every scale: it is never a value to review. */
const ZERO = /^[+-]?0*\.?0+(?:px|rem|em)?$/;

const varOf = (text: string): string | null => VAR.exec(text.trim())?.[1] ?? null;

/** `space.md` is named `space-md`, as the lens pin shows it. */
const tokenLabel = (token: TokenOption): string => token.path.replaceAll('.', '-');

/** The version's TSX files in the order the page shows them: the layout's sections first. */
function inPageOrder(files: readonly string[], ids: readonly string[]): string[] {
  const order = ids.map((id) => `src/tsx/sections/${pascalCase(id)}.tsx`);
  const rank = (file: string): number => {
    const at = order.indexOf(file);
    return at < 0 ? order.length : at;
  };
  return files.filter((file) => file.endsWith('.tsx')).sort((a, b) => rank(a) - rank(b));
}

type Site = { id: string; at: number };

/** The build's ids of a file's elements and their `<`; none when the file does not compile. */
async function sitesOf(compiler: EditCompiler, text: string, file: string): Promise<Site[]> {
  const code = await compiler.jsxDev(text, file);
  if (code === null) return [];
  const sites = readSites(code);
  if (sites === undefined) return [];
  return elementIds(file, sites).flatMap((entry) => {
    const at = offsetOf(text, entry.line, entry.column);
    const valid = entry.id.length <= MAX_ID && ELEMENT_ID.test(entry.id);
    return valid && at >= 0 && text[at] === '<' ? [{ id: entry.id, at }] : [];
  });
}

type Kit = ReturnType<typeof editKit>;

type Reading = {
  kit: Kit;
  tokens: readonly TokenOption[];
  tokenGroups: SourceInput['tokenGroups'];
  format: 'scss' | 'tailwind';
  /** A class's rule, read from its style file once per class. */
  rule(scssFile: string, scssText: string, className: string): RuleView | null;
};

function newReading(kit: Kit): Reading {
  const tokens = tokenOptions(kit);
  const rules = new Map<string, RuleView | null>();
  return {
    kit,
    tokens,
    tokenGroups: tokenGroupsOf(tokens),
    format: styleFormat(kit),
    rule(scssFile, scssText, className) {
      const key = `${scssFile}\0${className}`;
      if (!rules.has(key)) {
        const read = readRule(scssText, className);
        rules.set(key, read === null || read === 'ambiguous' ? null : read);
      }
      return rules.get(key) ?? null;
    },
  };
}

type Spacing = KitLensView['elements'][number]['spacing'];
type OffKit = KitLensView['elements'][number]['offKit'];

/** What the class rule holds: spacing in a token, and values no token holds. */
function readRuleValues(
  reading: Reading,
  input: Omit<SourceInput, 'property'>,
): { spacing: Spacing; offKit: OffKit } {
  const spacing: Spacing = [];
  const offKit: OffKit = [];
  const sizes = new Map<string, string>();
  for (const property of STYLE_PROPERTIES) {
    const source = styleSource({ ...input, property });
    if (source.kind !== 'scss') continue;
    const held = source.value.trim();
    if (held === '') continue;
    if (property === 'width' || property === 'height') sizes.set(property, held);
    const name = varOf(held);
    const token = name === null ? undefined : reading.tokens.find((one) => one.var === name);
    if (token !== undefined) {
      if (property === 'gap' || property === 'padding') {
        spacing.push({ property, token: tokenLabel(token), value: token.css.slice(0, MAX_TEXT) });
      }
      continue;
    }
    const type = tokenTypeOf(property);
    if (type === null || offKit.length >= MAX_OFF_KIT) continue;
    // A part of a shorthand already listed under the shorthand is not listed twice.
    if (source.via !== undefined && offKit.some((each) => each.property === source.via)) continue;
    const measured = nearestToken(held, type, [...reading.tokens]) !== null && !ZERO.test(held);
    if (source.offKit || (name === null && measured)) {
      offKit.push({ property, value: held.slice(0, MAX_TEXT) });
    }
  }
  // A visually hidden helper (the text only a screen reader hears) is a box of 1px by 1px on
  // purpose: none of its values are for the kit.
  const hidden = sizes.get('width') === '1px' && sizes.get('height') === '1px';
  return { spacing, offKit: hidden ? [] : offKit };
}

/** Every element of the latest version with something to say about the kit, in page order. */
export async function readKitLens(deps: KitLensDeps, slug: string): Promise<KitLensView> {
  const draft = loadDraft(deps.drafts, slug);
  const version = latestVersion(draft);
  const base = versionFolder(version);
  const reading = newReading(editKit(deps.kits, draft.kit.id));
  const { kit } = reading;

  const layout = deps.drafts.readText(slug, `${base}/md/layout.md`);
  const ids =
    layout === undefined
      ? []
      : parseLayout(layout)
          .sections.map((section) => section.id)
          .filter((id) => SECTION_ID.test(id));
  // Each source and style file is read here, once.
  const files = sourceFiles(deps.drafts, slug, version);
  const texts = new Map<string, string>();
  for (const file of files) {
    const text = deps.drafts.readText(slug, `${base}/${file}`);
    if (text !== undefined) texts.set(file, text);
  }
  /** The style file of a section's TSX: the plain name, else the partial. */
  const scssOf = (tsx: string): string | null => {
    const id = ids.find((each) => `src/tsx/sections/${pascalCase(each)}.tsx` === tsx);
    if (id === undefined) return null;
    return (
      [`src/scss/sections/${id}.scss`, `src/scss/sections/_${id}.scss`].find((file) =>
        texts.has(file),
      ) ?? null
    );
  };

  const elements: KitLensView['elements'] = [];
  for (const file of inPageOrder([...texts.keys()], ids)) {
    const text = texts.get(file) ?? '';
    const scssFile = scssOf(file);
    const scssText = scssFile === null ? undefined : texts.get(scssFile);
    for (const site of await sitesOf(deps.compiler, text, file)) {
      if (elements.length >= MAX_LENS_ELEMENTS) return { version, elements };
      const tag = readTag(text, site.at);
      if (typeof tag === 'string') continue;
      const component = catalogComponent(kit, tag.name);
      const styleClass = pickStyleClass(tag, component, text, scssText, file);
      const rule =
        styleClass === null || scssFile === null || scssText === undefined || !styleClass.exists
          ? null
          : reading.rule(scssFile, scssText, styleClass.className);
      const catalog = component === null || tag.name.includes('.') ? null : component.props;
      const held =
        rule === null || reading.format !== 'scss'
          ? { spacing: [], offKit: [] }
          : readRuleValues(reading, {
              component: catalog === null ? null : { props: catalog },
              written: tag.props.map((prop) => prop.name),
              rule,
              classes: classesOf(tag),
              format: reading.format,
              tokenGroups: reading.tokenGroups,
            });
      const suggest = suggestFor({
        text,
        at: site.at,
        view: tag,
        own: component,
        catalog: kit?.kit.components ?? [],
        format: reading.format,
        properties: (rule?.declarations ?? []).map((declaration) => declaration.property),
        classes: classesOf(tag),
      });
      if (held.spacing.length === 0 && held.offKit.length === 0 && suggest === null) continue;
      elements.push({
        id: site.id,
        spacing: held.spacing,
        offKit: held.offKit,
        suggest: suggest?.component ?? null,
      });
    }
  }
  return { version, elements };
}
