# 0058. A build is taken into the frame in place

Date: 2026-11-24. Status: accepted. Replaces the part of ADR 0049 that says the editor reloads its frame after every build. Builds on ADRs 0049, 0053 and 0055.

## Context

After every applied edit the studio builds the draft, and the editor then loaded each prototype frame again at a new address. That is a navigation: the frame goes white, its scroll jumps to the top and every overlay is made again, about a second after each edit. The optimistic preview has shown the change by then, so the reload is the only thing the person notices. The owner, after a live test: the live update stutters and reloads the whole editor instead of one element.

The frame is sandboxed and has an opaque origin. Its page is one sheet, `#root` and one classic script: an esbuild bundle that carries its own React, the kit, the draft and a copy of the frame runtime. Nothing inside that bundle can be replaced piece by piece, but the document around it can stay.

## Decision

- **The entry hands over a way to mount.** The generated entry (`src/render/domain/mount.ts`) does not make the React root. It gives `startFrame` a `mount()` that makes a fresh root on `#root` and returns `{ render(state), unmount() }`, and a `runtime` stamp: a hash of the frame runtime's files, written into the entry at build time.
- **One runtime runs a document.** The first `startFrame` of a document mounts, starts the channel and leaves a take-over function on `globalThis.__KITVAS_FRAME__`. A bundle that runs later in the same document finds it and only hands itself over: it mounts nothing, adds no listener and posts nothing. A page opened without a channel (the checks, a person) only renders, as before.
- **`swap` asks for a build in place.** The studio sends `swap {live}` to a card whose frame has spoken and already shows the build's version: the same origin, key, draft and version in its address. Every other card is loaded again. `live` numbers the build, so an answer to an older request is told apart from the one waited for.
- **The frame stages, then switches in one step** (`client/frame/page/swap.ts`). It loads `../css/index.css?live=N` as a second sheet that does not apply yet (`media="not all"`), then runs `../js/index.js?live=N` as a classic script. It uses no `fetch` and no `import()`: the frame's CSP and the prototype origin allow these two exactly as they allow the page's first sheet and script. When the bundle is handed over, in one task with no paint inside it: the optimistic preview is taken back, the old root unmounts, the new sheet applies and the old one and its copies leave, the new root mounts and renders the state shown (the bundle's own first state when it no longer has that one), the window's scroll is put back, and the forced state is applied again. Then the frame posts `ready {state, live}`.
- **`ready` means a new render is in the frame.** It is the message a loaded page sends. Everything the studio draws in a frame already listens to it and sends its part again: edit mode, the structure, tokens, hide and lock, the handles, the selection and the forced state (the bridge), note pins, the checks' marks, the tones, and a request for the tree. The frame itself re-applies only the forced state, because its twin rules were made from the sheet that left.
- **The frame can say no.** It answers `swap {live, step: "failed"}`, and the studio loads the frame again, when the bundle's stamp is not the runtime's own, the sheet or the script does not load, the sheet or the bundle does not come within 2 s each, the old root cannot unmount or the new one cannot render, or the document has taken 40 builds already. Each bundle's React leaves listeners on the document that keep the whole bundle in memory; a load frees them.
- **A page is never replaced under a gesture.** `client/frame/page/busy.ts` counts the gestures that run: an inline text edit, a drag, a rectangle, a handle drag. A swap looks at it before it loads anything and again before it switches. When a gesture runs it answers `held`, takes nothing, and answers `free` when the gesture ends. The studio then asks again, unless a change is on its way (the gesture's own drop or text): then it waits for that build, as it does for any second change.
- **The studio does not wait for ever.** A card that says nothing for 5 s is loaded again; `held` stops that clock. A frame whose runtime is older than this decision ignores `swap`, so it is loaded again after those 5 s, once.
- **A newer request wins.** A `swap` that arrives while another is being taken replaces it. The older one never answers, and the studio ignores an answer that names an older build.

## Consequences

- Kept across a swap: the document, the window's scroll, every overlay with its shadow root (outlines, handles, marks, pins, guides), the tones, the hide and lock sheets, the images already loaded, and the frame's listeners. The frame does not go white.
- Not kept: the React state of the draft (an open menu, a typed value, a tab chosen by a click), the scroll inside inner scroll boxes, and the focus inside the draft. They start again as after a load.
- The studio still navigates when the build is of another version (the first edit of a session starts one, and the timeline shows older ones), when the frame has not spoken yet, after a studio restart (the address has a new key), and whenever the frame answers `failed` or nothing.
- The placeholder of an inserted component (ADR 0053) goes with the old render, not with a reload.
- Styles a kit injects at run time stay in the head from one bundle to the next until the document is loaded again. They are the same rules under the same names.
- A change to a frame or channel file changes the stamp, so an open frame loads once instead of taking a bundle that speaks another protocol.
- The rules (which cards swap, the two clocks, the handover check, the gesture steps) run over injected ports and are tested without a browser. The DOM part (the staged sheet, the script, React's unmount and mount) is checked live only.

## Rejected

- Replacing only the changed element. The bundle is one script with its own React: there is no boundary inside it to replace at, and a build may change any section.
- Hot module replacement with a fast refresh runtime. It needs a dev server protocol, ES modules and a second runtime in the prototype, and the checks must see the page the studio shows.
- Two frames per card, the new one loaded behind the old one and shown when ready. The scroll, the overlays, the forced state and the selection would all be copied over, and every width card would cost two documents.
- Applying the new sheet as soon as it loads. The old render would show with the new styles until the bundle came.
