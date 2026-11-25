// Rules: ui-wide. What goes wrong on a wide screen: images shown past their file, stretched fields.

import type { RawFinding } from '../findings/finding.ts';
import { UI_STRETCHED_FIELD, UI_UPSCALED_IMAGE } from '../guidelines/ui-wide.ts';
import type { VisitRule } from './types.ts';
import { ruleFinding } from './types.ts';

/** Input types that are not a text answer, so their width says nothing about its length. */
const NOT_TEXT: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'hidden',
  'range',
  'color',
  'file',
  'submit',
  'button',
  'reset',
  'image',
]);

const upscaledImage: VisitRule = {
  id: UI_UPSCALED_IMAGE.id,
  run(input) {
    const { factor } = UI_UPSCALED_IMAGE.thresholds;
    const found: RawFinding[] = [];
    input.facts.nodes.forEach((node, index) => {
      if (node.hidden || !node.image || node.image.vector) return;
      const [naturalWidth, naturalHeight] = node.image.natural;
      const [, , width, height] = node.box;
      if (naturalWidth <= 0 || naturalHeight <= 0 || width <= 0 || height <= 0) return;
      const byWidth = width / naturalWidth;
      const byHeight = height / naturalHeight;
      if (Math.max(byWidth, byHeight) <= factor) return;
      const wider = byWidth >= byHeight;
      found.push(
        ruleFinding(input, {
          rule: UI_UPSCALED_IMAGE.id,
          severity: 'review',
          node: index,
          message: { key: `checkRule.${UI_UPSCALED_IMAGE.key}`, params: {} },
          hint: {
            key: `checkHint.${UI_UPSCALED_IMAGE.key}`,
            params: {
              shown: Math.round(wider ? width : height),
              natural: Math.round(wider ? naturalWidth : naturalHeight),
            },
          },
        }),
      );
    });
    return found;
  },
};

const stretchedField: VisitRule = {
  id: UI_STRETCHED_FIELD.id,
  run(input) {
    const { maxWidth, fromPage } = UI_STRETCHED_FIELD.thresholds;
    if (input.facts.viewport[0] < fromPage) return [];
    const found: RawFinding[] = [];
    input.facts.nodes.forEach((node, index) => {
      if (node.hidden || !node.field || NOT_TEXT.has(node.field.type)) return;
      const width = node.box[2];
      if (width <= maxWidth) return;
      found.push(
        ruleFinding(input, {
          rule: UI_STRETCHED_FIELD.id,
          severity: 'review',
          node: index,
          message: { key: `checkRule.${UI_STRETCHED_FIELD.key}`, params: {} },
          hint: {
            key: `checkHint.${UI_STRETCHED_FIELD.key}`,
            params: { width: Math.round(width) },
          },
        }),
      );
    });
    return found;
  },
};

export const UI_WIDE_RULES: VisitRule[] = [upscaledImage, stretchedField];
