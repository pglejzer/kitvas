// The off-kit counter (plan 13, task J): every raw value in the latest version's section SCSS,
// with the kit token that is nearest to it, so the panel can offer "map to nearest".

import {
  type DraftStore,
  latestVersion,
  loadDraft,
  parseLayout,
  versionFolder,
} from '../../../drafts/index.ts';
import { cssVarName, formatTokenValue, type KitStore, loadKit } from '../../../kit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { readRules } from '../../domain/style/scss-rules.ts';
import {
  isShorthand,
  leavesOf,
  splitShorthand,
  type VarKind,
} from '../../domain/style/shorthand.ts';
import { answerFor, varKindOf } from '../../domain/style/shorthand-source.ts';
import { tokenGroupsOf } from '../../domain/style/source.ts';
import { nearestToken } from '../../domain/tsx/nearest.ts';
import { kindOf, type TokenOption, tokenTypeOf } from '../../domain/types.ts';

export type OffKitDeps = { drafts: DraftStore; kits: KitStore };

/** A keyword and an image of the version are never off-kit, even with a marker someone wrote. */
const neverOffKit = (property: string): boolean => {
  const kind = kindOf(property);
  return kind === 'keyword' || kind === 'image';
};

/** The kit's tokens as the editor offers them; none when the kit cannot be read. */
function kitTokens(kits: KitStore, kitId: string): TokenOption[] {
  try {
    return loadKit(kits, kitId).tokens.map((token) => ({
      var: cssVarName(token.path),
      path: token.path.join('.'),
      type: token.type,
      css: formatTokenValue(token),
    }));
  } catch (error) {
    if (error instanceof KitvasError) return [];
    throw error;
  }
}

/** Raw values in the latest version, as `GET …/off-kit` answers them (OffKitSchema in the studio). */
export type OffKit = {
  version: number;
  items: {
    file: string;
    className: string;
    property: string;
    value: string;
    nearest: TokenOption | null;
  }[];
};

type Declaration = { property: string; value: string; offKit: boolean };

/**
 * The raw parts of an off-kit shorthand that splits, each under the property `styleSource` names
 * it (`border-color` for a `border`); a part a later declaration overrides is left out. A
 * shorthand written as one raw value for all its sides (`margin: 13px`) stays one item under its
 * own name, and so does one that does not split (`null`).
 */
function rawParts(
  declarations: readonly Declaration[],
  declaration: Declaration,
  kindOf: VarKind,
): { property: string; value: string }[] | null {
  const { property: shorthand, value } = declaration;
  if (!isShorthand(shorthand) || splitShorthand(shorthand, value, kindOf) === null) return null;
  const parts: { property: string; value: string }[] = [];
  for (const leaf of leavesOf(shorthand)) {
    const answer = answerFor(declarations, leaf, (each) => each, kindOf);
    if (answer.kind === 'part' && answer.declaration === declaration && answer.offKit) {
      parts.push({ property: leaf, value: answer.value });
    }
  }
  // One value written for every side is one value to the person: it is listed once, as written.
  const [first] = parts;
  const whole = parts.length === leavesOf(shorthand).length && value.trim() === first?.value;
  return whole ? [{ property: shorthand, value: value.trim() }] : parts;
}

export function offKitValues(deps: OffKitDeps, slug: string): OffKit {
  const draft = loadDraft(deps.drafts, slug);
  const version = latestVersion(draft);
  const base = versionFolder(version);
  const layout = deps.drafts.readText(slug, `${base}/md/layout.md`);
  const ids = layout === undefined ? [] : parseLayout(layout).sections.map((section) => section.id);
  const tokens = kitTokens(deps.kits, draft.kit.id);
  const kindOf = varKindOf(tokenGroupsOf(tokens));
  const items: OffKit['items'] = [];
  for (const id of ids) {
    // A section's SCSS is `<id>.scss`, or a partial `_<id>.scss`.
    for (const name of [`${id}.scss`, `_${id}.scss`]) {
      const file = `src/scss/sections/${name}`;
      const text = deps.drafts.readText(slug, `${base}/${file}`);
      if (text === undefined) continue;
      // Every class rule, the ones nested as `&__part` too.
      for (const { view: rule } of readRules(text)) {
        for (const declaration of rule.declarations) {
          if (!declaration.offKit || neverOffKit(declaration.property)) continue;
          const parts = rawParts(rule.declarations, declaration, kindOf) ?? [declaration];
          for (const { property, value } of parts) {
            const type = tokenTypeOf(property);
            items.push({
              file,
              className: rule.className,
              property,
              value,
              nearest: type === null ? null : nearestToken(value, type, tokens),
            });
          }
        }
      }
      break;
    }
  }
  return { version, items };
}
