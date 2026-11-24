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

import { type MountProvider, providerSource } from './provider-source.ts';

export type { MountBinding, MountProvider } from './provider-source.ts';

export type MountInput = {
  providers: MountProvider[];
  states: string[];
  defaultState: string;
  /** Changes whenever a file of the frame runtime does. */
  runtime: string;
};

export function mountSource({ providers, states, defaultState, runtime }: MountInput): string {
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
    `const RUNTIME = ${JSON.stringify(runtime)};`,
    "const asked = new URLSearchParams(window.location.search).get('state');",
    `const state = asked !== null && STATES.includes(asked) ? asked : ${JSON.stringify(defaultState)};`,
    "const element = document.getElementById('root');",
    'if (element) {',
    '  const mount = () => {',
    '    const root = createRoot(element);',
    '    return {',
    '      render(shown: string): void {',
    '        document.documentElement.dataset.state = shown;',
    `        flushSync(() => root.render(${open}<Draft state={shown} />${close}));`,
    '      },',
    '      unmount(): void {',
    '        root.unmount();',
    '      },',
    '    };',
    '  };',
    '  startFrame({ states: STATES, initial: state, mount, runtime: RUNTIME });',
    '}',
    '',
  ].join('\n');
}
