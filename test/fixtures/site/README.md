# Fixture site

A static page for `kit scan` tests, served by the tests on 127.0.0.1 (so they pass `--allow-private`, or a policy that allows it). The `acme-written` fixture kit copies its button and card, and its examples point at this page's crops.

- `index.html`: a heading, a text field, a card with a shadow, a button inside `main`, an image at `/private.png` (a subresource a policy may refuse), and a cookie banner fixed at the bottom with its own button (found last).
- `empty.html`: an empty `main`, no candidates.
- `private.html`: what `/redirect-to-private` leads to in the redirect test.
- `overlay.html`: a fixed dialog over half the window with its own button (an overlay, found last), a page button, and a button added only after the page is scrolled.
- `noviewport.html`: a heading and a paragraph with no viewport meta (the survey test reads `viewportMeta: false`).
- Every page except `noviewport.html` has a viewport meta, as real sites do: at phone width the scan runs as a phone, and a page without one would be laid out at about 980 px.
- Expected first candidates at 1280 px: `button-0` is "Save changes", `card-0` is the card, the banner's "Accept cookies" button comes after every button in `main`.
