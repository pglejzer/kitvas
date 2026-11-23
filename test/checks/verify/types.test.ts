import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseExamples } from '../../../src/checks/app/verify/example-parse.ts';
import { typesStep } from '../../../src/checks/app/verify/types.ts';
import { generatedEntry, type LoadedKit } from '../../../src/kit/index.ts';
import {
  ACME_CATALOG,
  acmeLoaded,
  bundleError,
  componentsOf,
  type FakeBundler,
  type FakeChecker,
  fakeBundler,
  fakeChecker,
  lineOf,
  memoryFs,
  PROJECT,
  tinyLoaded,
  tscMessage,
} from './support.ts';

const TYPES_FILE = join(ACME_CATALOG, 'build', 'json', 'kit-types.tsx');
const OWN = 'build/json/kit-types.tsx';
const ENTRY = '../../../kits/acme/generated/kit.ts';

/** Runs the step with fakes and returns its result and the file it wrote for tsc. */
async function run(loaded: LoadedKit, types: FakeChecker, bundler: FakeBundler = fakeBundler()) {
  const fs = memoryFs();
  const examples = await parseExamples(bundler, loaded.kit);
  const result = await typesStep({ loaded, dir: ACME_CATALOG, examples, types, bundler, fs });
  return { result, text: fs.files.get(TYPES_FILE) ?? '', fs };
}

test('every example is listed with its key and place, and whether it parses', async () => {
  const loaded = acmeLoaded((json) => {
    const badge = componentsOf(json)[2];
    if (badge?.examples[0]) badge.examples[0].code = '<Badge BROKEN';
  });
  assert.deepEqual(
    (await parseExamples(fakeBundler(), loaded.kit)).map((example) => [
      example.key,
      example.path,
      example.parses,
    ]),
    [
      ['Button.1', 'components.0.examples.0', true],
      ['Button.2', 'components.0.examples.1', true],
      ['TextField.1', 'components.1.examples.0', true],
      ['Badge.1', 'components.2.examples.0', false],
    ],
  );
});

test('a kit tsc has nothing to say about passes; tsc runs in the catalog folder', async () => {
  const loaded = acmeLoaded();
  const types = fakeChecker();
  const { result, text } = await run(loaded, types);
  assert.deepEqual(result, { state: 'passed', issues: [] });
  assert.deepEqual(types.inputs, [
    {
      workingDir: ACME_CATALOG,
      entry: TYPES_FILE,
      kitEntry: join(loaded.dir, 'generated', 'kit.ts'),
      project: PROJECT,
    },
  ]);
  assert.ok(text.includes('import { TextField } from "@kit";\n'));
  assert.ok(text.includes('void (<Badge\n  tone={"warn"}\n  children={"x"}\n/>);\n'));
  assert.ok(text.includes('void (<TextField\n  label={"x"}\n/>);\n'));
  assert.ok(
    text.includes(
      'function KitvasExample3() {\n  return (<>\n<Badge tone="warn">Pending</Badge>\n</>);\n}\n',
    ),
  );
});

test('messages about the generated file lead back to the prop, the value and the example', async () => {
  const loaded = acmeLoaded();
  const fs = memoryFs();
  let lines = { ghost: 0, label: 0, email: 0 };
  const types = fakeChecker((input) => {
    // The fake reads what the step wrote, like tsc would.
    const text = fs.files.get(input.entry) ?? '';
    lines = {
      ghost: lineOf(text, 'variant={"ghost"}'),
      label: lineOf(text, 'label={"x"}'),
      email: lineOf(text, '<TextField label="Email address"'),
    };
    return [
      tscMessage(OWN, lines.ghost, 'Type \'"ghost"\' is not assignable to type \'"solid"\'.'),
      tscMessage(OWN, lines.label, "Type 'string' is not assignable to type 'number'."),
      tscMessage(OWN, lines.email, "Property 'placeholder' does not exist on type 'Props'."),
    ];
  });
  const bundler = fakeBundler();
  const examples = await parseExamples(bundler, loaded.kit);
  const result = await typesStep({ loaded, dir: ACME_CATALOG, examples, types, bundler, fs });

  assert.ok(lines.ghost > 0 && lines.label > lines.ghost && lines.email > lines.label);
  assert.deepEqual(result, {
    state: 'failed',
    issues: [
      {
        step: 'types',
        path: 'components.0.props.0',
        key: 'kitIssue.propRejected',
        params: {
          component: 'Button',
          prop: 'variant',
          value: 'ghost',
          detail: 'Type \'"ghost"\' is not assignable to type \'"solid"\'.',
        },
      },
      {
        step: 'types',
        path: 'components.1.props.0',
        key: 'kitIssue.propRejected',
        params: {
          component: 'TextField',
          prop: 'label',
          value: '"x"',
          detail: "Type 'string' is not assignable to type 'number'.",
        },
      },
      {
        step: 'types',
        path: 'components.1.examples.0',
        key: 'kitIssue.exampleRejected',
        params: {
          key: 'TextField.1',
          detail: "Property 'placeholder' does not exist on type 'Props'.",
        },
      },
    ],
  });
});

test('messages about the kit entry name the component; the design system own files are left alone', async () => {
  const loaded = acmeLoaded();
  const fieldLine = generatedEntry(loaded.kit).lines.TextField ?? 0;
  const types = fakeChecker(() => [
    tscMessage('../../../../node_modules/@acme/ui/index.d.ts', 4, 'Not ours to report.'),
    tscMessage('../../../../src/theme.ts', 1, 'Not ours either.'),
    tscMessage(ENTRY, fieldLine, "Module '\"@acme/ui\"' has no exported member 'TextField'."),
    tscMessage(ENTRY, fieldLine, 'A second message on that line.'),
    tscMessage(ENTRY, 99, "Cannot find module '@acme/ui/styles.css'."),
    tscMessage(null, 0, "Cannot find type definition file for 'node'."),
  ]);
  const { result } = await run(loaded, types);
  assert.ok(fieldLine > 0);
  assert.deepEqual(result, {
    state: 'failed',
    issues: [
      {
        step: 'types',
        path: 'components.1.import',
        key: 'kitIssue.exportMissing',
        params: { name: 'TextField', from: '@acme/ui' },
      },
      {
        step: 'types',
        path: 'runtime.entry',
        key: 'checkRule.tool',
        params: { text: "Cannot find module '@acme/ui/styles.css'." },
      },
      {
        step: 'types',
        path: 'runtime.entry',
        key: 'checkRule.tool',
        params: { text: "Cannot find type definition file for 'node'." },
      },
    ],
  });
});

test('an example that does not parse is reported in the bundler words and kept out of the file', async () => {
  const loaded = acmeLoaded((json) => {
    const button = componentsOf(json)[0];
    if (button?.examples[1]) button.examples[1].code = '<Button BROKEN';
  });
  const bundler = fakeBundler((input) =>
    input.entry.name === 'Button.2.tsx'
      ? [bundleError('Button.2.tsx', 4, 'Expected ">" but found "<"')]
      : [],
  );
  const { result, text } = await run(loaded, fakeChecker(), bundler);
  assert.deepEqual(result, {
    state: 'failed',
    issues: [
      {
        step: 'types',
        path: 'components.0.examples.1',
        key: 'kitIssue.exampleRejected',
        params: { key: 'Button.2', detail: 'Expected ">" but found "<"' },
      },
    ],
  });
  assert.deepEqual(bundler.bundles, [
    {
      workingDir: ACME_CATALOG,
      entry: {
        name: 'Button.2.tsx',
        source: 'function KitvasCheck() {\n  return (<>\n<Button BROKEN\n</>);\n}',
      },
      alias: {},
      ids: {},
    },
  ]);
  assert.equal(text.includes('BROKEN'), false);
  // The examples that are left are numbered without a hole.
  assert.ok(text.includes('function KitvasExample1() {\n  return (<>\n<TextField label='));
  assert.ok(text.includes('function KitvasExample2() {'));
  assert.equal(text.includes('KitvasExample3'), false);
});

test('without a bundler message the detail is the first line of the code', async () => {
  const loaded = acmeLoaded((json) => {
    const button = componentsOf(json)[0];
    if (button?.examples[1]) button.examples[1].code = '  <Button BROKEN\n  second line';
  });
  const { result } = await run(loaded, fakeChecker());
  assert.deepEqual(
    result.issues.map((issue) => issue.params),
    [{ key: 'Button.2', detail: '<Button BROKEN' }],
  );
});

test('a built-in kit is checked against its own entry, without a project', async () => {
  const loaded = tinyLoaded();
  const types = fakeChecker(() => [tscMessage('tiny/tsx/index.ts', 9, 'An error in the entry.')]);
  const { result } = await run(loaded, types);
  assert.equal(types.inputs[0]?.kitEntry, join(loaded.dir, 'tsx', 'index.ts'));
  assert.equal(types.inputs[0]?.project, undefined);
  assert.deepEqual(result.issues, [
    {
      step: 'types',
      path: 'runtime.entry',
      key: 'checkRule.tool',
      params: { text: 'An error in the entry.' },
    },
  ]);
});
