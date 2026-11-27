import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import { mergeKit } from '../../../src/kit/index.ts';
import { projectKitsDir } from '../../../src/shared/index.ts';
import { layeredStore, tempProject, writeProjectKit } from '../helpers/project-kit.ts';

const part = (name: string, folder: string) => ({
  components: [
    {
      name,
      category: 'action',
      description: `${name} of the part.`,
      import: { from: `components/${name}`, name },
      props: [],
      examples: [
        {
          title: 'Default',
          code: `<${name} />`,
          imports: [name],
          original: `originals/${name}.1.html`,
        },
      ],
      project: {
        files: [`src/app/${folder}/${folder}.ts`],
        name: `acme-${folder}`,
        styles: [`src/app/${folder}/${folder}.css`],
        scoped: true,
      },
    },
  ],
});

test('merge joins the parts of a code kit and keeps project and original', () => {
  const project = tempProject();
  const kitJson = {
    schemaVersion: 1,
    id: 'acme-code',
    name: 'Acme',
    version: '0.0.0',
    source: { type: 'code', path: 'src/app', styles: [], urls: [] },
    framework: 'react',
    runtime: {
      packages: [{ name: 'react', version: '19.3.1' }],
      entry: 'generated/kit.ts',
      styles: { files: [], generated: 'none', imports: [] },
      providers: [],
    },
    tokens: { file: 'json/tokens.json', format: 'dtcg-2025.10' },
    components: [],
  };
  writeProjectKit(project, kitJson, {
    'json/tokens.json': '{}',
    'parts/a.json': JSON.stringify(part('Button', 'button')),
    'parts/b.json': JSON.stringify(part('Card', 'card')),
  });
  const result = mergeKit(
    { kits: layeredStore(project), kitWriter: createFolderKitWriter(projectKitsDir(project)) },
    'acme-code',
  );
  assert.equal(result.merged, true);
  const text = readFileSync(join(projectKitsDir(project), 'acme-code', 'kit.json'), 'utf8');
  const merged = JSON.parse(text) as { components: Record<string, unknown>[] };
  assert.deepEqual(
    merged.components.map((component) => component.name),
    ['Button', 'Card'],
  );
  for (const component of merged.components) {
    assert.equal(typeof (component.project as { scoped: boolean }).scoped, 'boolean');
    const examples = component.examples as { original: string }[];
    assert.match(examples[0]?.original ?? '', /^originals\/\w+\.1\.html$/);
  }
});
