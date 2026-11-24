// Hidden elements (spec 4b, decision 14; plan 14, task C4): `display: none` in the frame only,
// through one style element of the frame's own; never written anywhere.

export type Hide = {
  set(ids: readonly string[]): void;
  /** Locked elements take no pointer, so a click on one selects what is under it. */
  lock(ids: readonly string[]): void;
};

/** A CSS string body: the protocol checks ids already, this keeps an odd one from leaving the quotes. */
const escapeCss = (id: string): string => id.replace(/[^A-Za-z0-9_.:/$-]/g, (char) => `\\${char}`);

/** The rules that hide `ids`; empty for none. */
export function hideCss(ids: readonly string[]): string {
  return ids.map((id) => `[data-ks="${escapeCss(id)}"]{display:none!important}`).join('\n');
}

/** The rules that lock `ids`, with everything inside them; empty for none. */
export function lockCss(ids: readonly string[]): string {
  return ids
    .map((id) => {
      const at = `[data-ks="${escapeCss(id)}"]`;
      return `${at},${at} *{pointer-events:none!important}`;
    })
    .join('\n');
}

export function createHide(document: Document): Hide {
  let style: HTMLStyleElement | undefined;
  let lockStyle: HTMLStyleElement | undefined;
  return {
    lock(ids) {
      if (!lockStyle) {
        if (ids.length === 0) return;
        lockStyle = document.createElement('style');
        lockStyle.setAttribute('data-kitvas-lock', '');
        (document.head ?? document.documentElement).append(lockStyle);
      }
      lockStyle.textContent = lockCss(ids);
    },
    set(ids) {
      if (!style) {
        if (ids.length === 0) return;
        style = document.createElement('style');
        style.setAttribute('data-kitvas-hide', '');
        (document.head ?? document.documentElement).append(style);
      }
      style.textContent = hideCss(ids);
    },
  };
}
