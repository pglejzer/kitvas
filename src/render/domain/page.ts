// build/html/index.html. A classic script, so the page also opens from disk.

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function pageHtml({ title }: { title: string }): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    '<link rel="stylesheet" href="../css/index.css">',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    '<script src="../js/index.js"></script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
