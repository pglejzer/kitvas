// The off-kit counter (plan 13, task J): every raw value in the latest version's section SCSS,
// with the kit token that is nearest to it, so the panel can offer "map to nearest".

import {
  type DraftStore,
  latestVersion,
  loadDraft,
  parseLayout,
  versionFolder,
} from '../../drafts/index.ts';
import { cssVarName, formatTokenValue, type KitStore, loadKit } from '../../kit/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { listRules } from '../domain/apply-scss.ts';
import { nearestToken } from '../domain/nearest.ts';
import {
  PROPERTY_TOKEN_TYPE,
  STYLE_PROPERTIES,
  type StyleProperty,
  type TokenOption,
} from '../domain/types.ts';

export type OffKitDeps = { drafts: DraftStore; kits: KitStore };

const isStyleProperty = (property: string): property is StyleProperty =>
  (STYLE_PROPERTIES as readonly string[]).includes(property);

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

export function offKitValues(deps: OffKitDeps, slug: string): OffKit {
  const draft = loadDraft(deps.drafts, slug);
  const version = latestVersion(draft);
  const base = versionFolder(version);
  const layout = deps.drafts.readText(slug, `${base}/md/layout.md`);
  const ids = layout === undefined ? [] : parseLayout(layout).sections.map((section) => section.id);
  const tokens = kitTokens(deps.kits, draft.kit.id);
  const items: OffKit['items'] = [];
  for (const id of ids) {
    // A section's SCSS is `<id>.scss`, or a partial `_<id>.scss`.
    for (const name of [`${id}.scss`, `_${id}.scss`]) {
      const file = `src/scss/sections/${name}`;
      const text = deps.drafts.readText(slug, `${base}/${file}`);
      if (text === undefined) continue;
      for (const rule of listRules(text)) {
        for (const declaration of rule.declarations) {
          if (!declaration.offKit) continue;
          const type = isStyleProperty(declaration.property)
            ? PROPERTY_TOKEN_TYPE[declaration.property]
            : null;
          items.push({
            file,
            className: rule.className,
            property: declaration.property,
            value: declaration.value,
            nearest: type === null ? null : nearestToken(declaration.value, type, tokens),
          });
        }
      }
      break;
    }
  }
  return { version, items };
}
