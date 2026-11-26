// Source of the bundle's entry: it wraps the draft in the kit's providers and hands the frame
// runtime `kitvas-frame` (client/frame/runtime.ts) a `mount` that makes the draft's root on
// `#root`. The runtime renders with it: first the state from `?state=`, then, inside the studio,
// the states the studio asks for. `render` commits synchronously, so the runtime can measure the
// page right before and right after a switch.
//
// The entry never makes the root itself. A bundle that runs in a document another bundle's
// runtime already runs (the studio asked for the new build in place, ADR 0058) only hands itself
// over, and that runtime unmounts the old root and mounts this one. `runtime` is a stamp of the
// frame runtime the bundle was built with: a page takes a bundle only from the same runtime.

import { type DraftOption, type SharedValue, THEME_OPTION } from '../../shared/index.ts';
import { type MountProvider, providerSource } from './provider-source.ts';

export type { MountBinding, MountProvider } from './provider-source.ts';

export type MountInput = {
  providers: MountProvider[];
  states: string[];
  defaultState: string;
  /**
   * The version's options, handed to the runtime as data: it reads the address, sets the root's
   * `data-opt-*` attributes and passes each render the choice. The entry parses nothing of it.
   */
  options: DraftOption[];
  /**
   * The version's shared values (ADR 0086). With some, the entry holds them (`holdShared` of the frame
   * runtime, so they live through a build swap) and draws the draft through `Held`, which gives it
   * `shared` and `setShared`. With none the entry has no trace of them.
   */
  shared: readonly SharedValue[];
  /**
   * The kit's themes (`LoadedKit.themes.list`): the runtime puts the `attributes` of the theme that
   * shows on the body (ADR 0083). Only a version with the option `theme` hands them over, and only
   * the themes that have some, so every other entry stays as it was.
   */
  themes: readonly { id: string; attributes: Readonly<Record<string, string>> }[];
  /** Changes whenever a file of the frame runtime does. */
  runtime: string;
};

export function mountSource({
  providers,
  states,
  defaultState,
  options,
  shared,
  themes,
  runtime,
}: MountInput): string {
  const { imports, open, close } = providerSource(providers);
  const withOptions = options.length > 0;
  const withShared = shared.length > 0;
  const drawn = withShared ? 'Held' : 'Draft';
  const switched = options.some((option) => option.id === THEME_OPTION)
    ? themes.filter((theme) => Object.keys(theme.attributes).length > 0)
    : [];
  const themed = switched.length > 0;
  const bodies = Object.fromEntries(
    switched.map((theme): [string, Readonly<Record<string, string>>] => [
      theme.id,
      theme.attributes,
    ]),
  );
  return [
    "import { flushSync } from 'react-dom';",
    "import { createRoot } from 'react-dom/client';",
    ...(withShared ? ["import { useState } from 'react';"] : []),
    withShared
      ? "import { holdShared, startFrame } from 'kitvas-frame';"
      : "import { startFrame } from 'kitvas-frame';",
    "import { Draft } from '@draft';",
    "import * as Kit from '@kit';",
    ...imports,
    '',
    '(globalThis as { __KITVAS_KIT__?: unknown }).__KITVAS_KIT__ = Kit;',
    `const STATES: string[] = ${JSON.stringify(states)};`,
    `const OPTIONS = ${JSON.stringify(options)};`,
    ...(withShared
      ? [
          `const SHARED = ${JSON.stringify(shared)};`,
          'const shared = holdShared(SHARED);',
          `function Held(props: { state: string${withOptions ? '; options: Record<string, string>' : ''} }) {`,
          '  const [now, setNow] = useState(shared.get());',
          '  return <Draft {...props} shared={now} setShared={(change) => setNow(shared.set(change))} />;',
          '}',
        ]
      : []),
    ...(themed ? [`const THEMES = ${JSON.stringify(bodies)};`] : []),
    `const RUNTIME = ${JSON.stringify(runtime)};`,
    "const asked = new URLSearchParams(window.location.search).get('state');",
    `const state = asked !== null && STATES.includes(asked) ? asked : ${JSON.stringify(defaultState)};`,
    "const element = document.getElementById('root');",
    'if (element) {',
    '  const mount = () => {',
    '    const root = createRoot(element);',
    '    return {',
    withOptions
      ? '      render(shown: string, choice: Record<string, string>): void {'
      : '      render(shown: string): void {',
    '        document.documentElement.dataset.state = shown;',
    `        flushSync(() => root.render(${open}<${drawn} state={shown}${withOptions ? ' options={choice}' : ''} />${close}));`,
    '      },',
    '      unmount(): void {',
    '        root.unmount();',
    '      },',
    '    };',
    '  };',
    `  startFrame({ states: STATES, options: OPTIONS, initial: state, mount, runtime: RUNTIME${themed ? ', themes: THEMES' : ''} });`,
    '}',
    '',
  ].join('\n');
}
