// A stamp of a kit's Insert pane previews (ADR 0075), without shooting anything.

import {
  PREVIEWS_FORMAT,
  type PreviewsStamp,
  previewFolder,
  SHEET_FILE,
} from '../../src/checks/index.ts';

/** The previews of `base` shot from the catalog build `catalog`: a Button and two icons. */
export const previewsStamp = (
  catalog: string,
  over: Partial<PreviewsStamp> = {},
): PreviewsStamp => ({
  schemaVersion: 1,
  kit: 'base',
  format: PREVIEWS_FORMAT,
  catalog,
  folder: previewFolder(catalog),
  backdrop: '#ffffff',
  components: { Button: 'component-0.png' },
  icons: { file: SHEET_FILE, cell: 32, columns: 2, names: ['check', 'close'] },
  ...over,
});
