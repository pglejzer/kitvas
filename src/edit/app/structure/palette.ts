// What the insert palette offers (spec 4b, decision 10): the draft's kit catalog, the kit's icons
// and the sections of other drafts that use the same kit.

import {
  type DraftStore,
  latestVersion,
  loadDraft,
  parseLayout,
  versionFolder,
} from '../../../drafts/index.ts';
import type { KitComponent, KitStore } from '../../../kit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { editKit } from '../edit-state.ts';

export type PaletteComponent = {
  name: string;
  category: string;
  parent: string | null;
  accepts: boolean;
  required: string[];
  examples: { title: string; code: string; imports: string[] }[];
};

/** The same shape as the studio's `PaletteSchema` (`src/studio/api/edit/structure-schemas.ts`). */
export type PaletteView = {
  components: PaletteComponent[];
  icons: { component: string; names: string[] } | null;
  sections: { slug: string; section: string; purpose: string }[];
};

export type PaletteDeps = { drafts: DraftStore; kits: KitStore };

const takesChildren = (component: KitComponent): boolean =>
  component.props.some((prop) => prop.name === 'children' && prop.type === 'node');

/** Props the component cannot be written without; `children` is left out, an empty one is valid. */
const requiredProps = (component: KitComponent): string[] =>
  component.props
    .filter((prop) => prop.required === true && prop.default === undefined)
    .map((prop) => prop.name)
    .filter((name) => name !== 'children');

function componentEntry(component: KitComponent): PaletteComponent {
  return {
    name: component.name,
    category: component.category,
    parent: null,
    accepts: takesChildren(component),
    required: requiredProps(component),
    examples: component.examples.map((example) => ({
      title: example.title,
      code: example.code,
      imports: example.imports,
    })),
  };
}

/** `Card.Header`: the catalog lists `Header` under `Card`; a part is inserted only inside its root. */
function partEntries(component: KitComponent): PaletteComponent[] {
  return component.parts.map((part) => ({
    name: `${component.name}.${part}`,
    category: component.category,
    parent: component.name,
    accepts: true,
    required: [],
    examples: [],
  }));
}

/** Sections of the other drafts that use `kitId`, from each one's latest layout. */
function otherSections(deps: PaletteDeps, slug: string, kitId: string): PaletteView['sections'] {
  const found: PaletteView['sections'] = [];
  for (const other of deps.drafts.list()) {
    if (other === slug) continue;
    try {
      const draft = loadDraft(deps.drafts, other);
      // A craft draft has no layout, so it has no sections to offer.
      if (draft.kit.id !== kitId || draft.kind === 'craft') continue;
      const layout = deps.drafts.readText(
        other,
        `${versionFolder(latestVersion(draft))}/md/layout.md`,
      );
      if (layout === undefined) continue;
      for (const section of parseLayout(layout).sections) {
        found.push({ slug: other, section: section.id, purpose: section.purpose });
      }
    } catch (error) {
      // A draft that cannot be read offers nothing; it does not break the palette.
      if (!(error instanceof KitvasError)) throw error;
    }
  }
  return found;
}

export function readPalette(deps: PaletteDeps, slug: string): PaletteView {
  const draft = loadDraft(deps.drafts, slug);
  const loaded = editKit(deps.kits, draft.kit.id);
  const kit = loaded?.kit;
  const components = (kit?.components ?? [])
    .filter((component) => !component.deprecated)
    .flatMap((component) => [componentEntry(component), ...partEntries(component)]);
  const icons = kit?.icons;
  return {
    components,
    icons:
      icons?.source === 'component' ? { component: icons.component, names: icons.names } : null,
    sections: otherSections(deps, slug, draft.kit.id),
  };
}
