// Rules of a craft board (ADR 0045): each sketch held to the kit's icons on the board, and a logo
// held small, in one colour and on light and dark grounds. Icon rules run only for the subject
// `icon` and logo rules only for `logo`. One finding per sketch, at the sketch's block when the
// facts list it, else page-level. The numbers come from `guidelines/craft.ts`.

import type { Message, RawFinding, Severity } from '../findings/finding.ts';
import {
  UI_ICON_COLOUR,
  UI_ICON_GRID,
  UI_ICON_SMALL,
  UI_ICON_STROKE,
  UI_LOGO_CONTRAST,
  UI_LOGO_MONO,
  UI_LOGO_SMALL,
} from '../guidelines/craft.ts';
import type { CraftFacts, SvgFacts } from '../page/craft-facts.ts';
import { ruleFinding, type VisitInput } from './types.ts';

export type CraftRule = {
  id: string;
  run(input: { visit: VisitInput; craft: CraftFacts }): RawFinding[];
};

type CraftInput = { visit: VisitInput; craft: CraftFacts };
type SketchAt = { rule: string; severity: Severity; message: Message; hint: Message };

/** Each sketch with its svgs, in board order: a logo has one per tone. */
function bySketch(sketches: readonly SvgFacts[]): Map<string, SvgFacts[]> {
  const found = new Map<string, SvgFacts[]>();
  for (const svg of sketches) {
    if (svg.sketch === null) continue;
    found.set(svg.sketch, [...(found.get(svg.sketch) ?? []), svg]);
  }
  return found;
}

/** The sketch's block when the visit's facts hold it; else null. */
function nodeOf({ visit, craft }: CraftInput, sketch: string): number | null {
  const node = craft.sketches.find((svg) => svg.sketch === sketch && svg.node !== null)?.node;
  return node !== undefined && node !== null && visit.facts.nodes[node] !== undefined ? node : null;
}

/** A finding at one sketch. The sketch is the draft's own work, never a kit component's markup. */
function atSketch(input: CraftInput, sketch: string, at: SketchAt): RawFinding {
  return ruleFinding(input.visit, { ...at, node: nodeOf(input, sketch), kit: 'keep' });
}

/** The value most entries have; the first of equals. Null when there is none. */
function commonest(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let most = 0;
  for (const [value, count] of counts) {
    if (count > most) {
      best = value;
      most = count;
    }
  }
  return best;
}

/** The lowest measured value among a sketch's svgs; null when none was measured. */
function lowestOf(
  svgs: readonly SvgFacts[],
  read: (svg: SvgFacts) => number | null,
): number | null {
  const values = svgs.flatMap((svg) => {
    const value = read(svg);
    return value === null ? [] : [value];
  });
  return values.length === 0 ? null : Math.min(...values);
}

const iconGrid: CraftRule = {
  id: UI_ICON_GRID.id,
  run(input) {
    const { craft } = input;
    if (craft.subject !== 'icon') return [];
    const grid = commonest(craft.kit.map((icon) => icon.viewBox).filter((box) => box !== ''));
    if (grid === null) return [];
    return [...bySketch(craft.sketches)].flatMap(([sketch, svgs]) => {
      const off = svgs.find((svg) => svg.viewBox !== grid);
      if (off === undefined) return [];
      return [
        atSketch(input, sketch, {
          rule: UI_ICON_GRID.id,
          severity: UI_ICON_GRID.severity,
          message: { key: 'checkRule.uiIconGrid', params: { sketch, grid } },
          hint: { key: 'checkHint.uiIconGrid', params: { viewBox: off.viewBox, grid } },
        }),
      ];
    });
  },
};

const iconStroke: CraftRule = {
  id: UI_ICON_STROKE.id,
  run(input) {
    const { craft } = input;
    if (craft.subject !== 'icon') return [];
    const strokes = craft.kit.flatMap((icon) => (icon.stroke === null ? [] : [icon.stroke]));
    if (strokes.length === 0) return [];
    const { tolerance } = UI_ICON_STROKE.thresholds;
    const min = Math.min(...strokes);
    const max = Math.max(...strokes);
    return [...bySketch(craft.sketches)].flatMap(([sketch, svgs]) => {
      // A sketch that draws no stroke has a stroke of 0 next to a stroked kit.
      const off = svgs.find((svg) => {
        const stroke = svg.stroke ?? 0;
        return stroke < min - tolerance || stroke > max + tolerance;
      });
      if (off === undefined) return [];
      return [
        atSketch(input, sketch, {
          rule: UI_ICON_STROKE.id,
          severity: UI_ICON_STROKE.severity,
          message: { key: 'checkRule.uiIconStroke', params: { sketch, min, max } },
          hint: { key: 'checkHint.uiIconStroke', params: { stroke: off.stroke ?? 0, tolerance } },
        }),
      ];
    });
  },
};

const iconColour: CraftRule = {
  id: UI_ICON_COLOUR.id,
  run(input) {
    const { craft } = input;
    if (craft.subject !== 'icon') return [];
    return [...bySketch(craft.sketches)].flatMap(([sketch, svgs]) => {
      const colours = [...new Set(svgs.flatMap((svg) => svg.fixedColours))].sort();
      if (colours.length === 0) return [];
      return [
        atSketch(input, sketch, {
          rule: UI_ICON_COLOUR.id,
          severity: UI_ICON_COLOUR.severity,
          message: { key: 'checkRule.uiIconColour', params: { sketch } },
          hint: { key: 'checkHint.uiIconColour', params: { colours: colours.join(' ') } },
        }),
      ];
    });
  },
};

/** A rule of the thinnest painted line at one size, for one subject. */
function thinRule(
  entry: typeof UI_ICON_SMALL | typeof UI_LOGO_SMALL,
  subject: string,
  read: (svg: SvgFacts) => number | null,
): CraftRule {
  return {
    id: entry.id,
    run(input) {
      if (input.craft.subject !== subject) return [];
      const { minPx } = entry.thresholds;
      return [...bySketch(input.craft.sketches)].flatMap(([sketch, svgs]) => {
        const px = lowestOf(svgs, read);
        if (px === null || px >= minPx) return [];
        return [
          atSketch(input, sketch, {
            rule: entry.id,
            severity: entry.severity,
            message: { key: `checkRule.${entry.key}`, params: { sketch, min: minPx } },
            hint: { key: `checkHint.${entry.key}`, params: { px } },
          }),
        ];
      });
    },
  };
}

const iconSmall = thinRule(UI_ICON_SMALL, 'icon', (svg) => svg.thinnestPx16);
const logoSmall = thinRule(UI_LOGO_SMALL, 'logo', (svg) => svg.thinnestPx32);

const logoMono: CraftRule = {
  id: UI_LOGO_MONO.id,
  run(input) {
    const { craft } = input;
    if (craft.subject !== 'logo') return [];
    return [...bySketch(craft.sketches).keys()].flatMap((sketch) =>
      craft.mono.includes(sketch)
        ? []
        : [
            atSketch(input, sketch, {
              rule: UI_LOGO_MONO.id,
              severity: UI_LOGO_MONO.severity,
              message: { key: 'checkRule.uiLogoMono', params: { sketch } },
              hint: { key: 'checkHint.uiLogoMono', params: {} },
            }),
          ],
    );
  },
};

const logoContrast: CraftRule = {
  id: UI_LOGO_CONTRAST.id,
  run(input) {
    const { craft } = input;
    if (craft.subject !== 'logo') return [];
    const { min } = UI_LOGO_CONTRAST.thresholds;
    return craft.logoContrast.flatMap(({ sketch, light, dark }) =>
      light >= min && dark >= min
        ? []
        : [
            atSketch(input, sketch, {
              rule: UI_LOGO_CONTRAST.id,
              severity: UI_LOGO_CONTRAST.severity,
              message: { key: 'checkRule.uiLogoContrast', params: { sketch, min } },
              hint: { key: 'checkHint.uiLogoContrast', params: { light, dark, min } },
            }),
          ],
    );
  },
};

export const CRAFT_RULES: CraftRule[] = [
  iconGrid,
  iconStroke,
  iconColour,
  iconSmall,
  logoMono,
  logoSmall,
  logoContrast,
];
