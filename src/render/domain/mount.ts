// Source of the bundle's entry: it wraps the draft in the kit's providers and renders one state.
// `kitvas-frame` (client/frame/runtime.ts) does the rendering: first the state from `?state=`,
// then, inside the studio, the states the studio asks for. `render` commits synchronously, so the
// frame runtime can measure the page right before and right after a switch.

import { type MountProvider, providerSource } from './provider-source.ts';

export type { MountBinding, MountProvider } from './provider-source.ts';

export type MountInput = { providers: MountProvider[]; states: string[]; defaultState: string };

export function mountSource({ providers, states, defaultState }: MountInput): string {
  const { imports, open, close } = providerSource(providers);
  return [
    "import { flushSync } from 'react-dom';",
    "import { createRoot } from 'react-dom/client';",
    "import { startFrame } from 'kitvas-frame';",
    "import { Draft } from '@draft';",
    "import * as Kit from '@kit';",
    ...imports,
    '',
    '(globalThis as { __KITVAS_KIT__?: unknown }).__KITVAS_KIT__ = Kit;',
    `const STATES: string[] = ${JSON.stringify(states)};`,
    "const asked = new URLSearchParams(window.location.search).get('state');",
    `const state = asked !== null && STATES.includes(asked) ? asked : ${JSON.stringify(defaultState)};`,
    "const element = document.getElementById('root');",
    'if (element) {',
    '  const root = createRoot(element);',
    '  const render = (shown: string): void => {',
    '    document.documentElement.dataset.state = shown;',
    `    flushSync(() => root.render(${open}<Draft state={shown} />${close}));`,
    '  };',
    '  startFrame({ states: STATES, initial: state, render });',
    '}',
    '',
  ].join('\n');
}
