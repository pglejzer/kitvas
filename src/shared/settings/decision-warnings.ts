// The sentence of a decisions warning, for `kitvas decisions` and `kitvas doctor`.

import type { Translate } from '../i18n/i18n.ts';
import type { DecisionWarning } from './decisions.ts';

export function decisionWarningText(t: Translate, warning: DecisionWarning): string {
  const params = { ...warning.params, line: warning.line };
  switch (warning.code) {
    case 'unclosedBlock':
      return t('decisions.warning.unclosedBlock', params);
    case 'unknownKey':
      return t('decisions.warning.unknownKey', params);
    case 'badLine':
      return t('decisions.warning.badLine', params);
    case 'badValue':
      return t('decisions.warning.badValue', params);
    case 'duplicateKey':
      return t('decisions.warning.duplicateKey', params);
    case 'kitMissing':
      return t('decisions.warning.kitMissing', params);
  }
}
