// The wait every Playwright pass makes after it changed the page. Playwright sends the function's
// source into the page (`page.evaluate(settle)`), so it uses nothing from this module.

/** Runs in the page: two frames, so the page has laid out and painted what changed. */
export function settle(): Promise<null> {
  return new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(null))),
  );
}
