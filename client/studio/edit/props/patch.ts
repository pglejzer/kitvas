// What a redraw of the properties panel keeps (plan 18e, task 1, spec part A). The new rows are
// built as before, then laid over the old ones by key: a row whose drawn value is the same stays
// the very node it was (its focus, caret and open parts with it), a changed one is replaced, and
// a row with an open list is never replaced under the pointer. `patchPlan` is the rule over plain
// data; `patchChildren` applies it to the DOM.

export type Keyed = { key: string; signature: string };

export type PatchPlan = {
  /** The new list in order: which node each place takes. */
  steps: { key: string; take: 'old' | 'new' }[];
  /** Pinned keys whose new row differs from the old one that stayed. */
  stale: string[];
};

/**
 * Compares the old list with the new one. A kept row's signature covers every value its handlers
 * caught, so a row whose drawn value changed is never kept; a pinned one is, and is reported.
 */
export function patchPlan(
  old: readonly Keyed[],
  next: readonly Keyed[],
  pinned: ReadonlySet<string>,
): PatchPlan {
  const before = new Map(old.map((one) => [one.key, one.signature]));
  const steps: PatchPlan['steps'] = [];
  const stale: string[] = [];
  for (const one of next) {
    const was = before.get(one.key);
    if (was === undefined) steps.push({ key: one.key, take: 'new' });
    else if (was === one.signature) steps.push({ key: one.key, take: 'old' });
    else if (pinned.has(one.key)) {
      steps.push({ key: one.key, take: 'old' });
      stale.push(one.key);
    } else steps.push({ key: one.key, take: 'new' });
  }
  return { steps, stale };
}

/** A node's key: its `data-row`, else its group, else its tag, class and place. */
export function keyOf(
  node: {
    row?: string | undefined;
    group?: string | undefined;
    tag: string;
    className: string;
  },
  index: number,
): string {
  if (node.row) return node.row;
  if (node.group) return `section:${node.group}`;
  return `${node.tag}.${node.className}@${index}`;
}

/** A part that only holds rows: kept when its key matches, and its children are patched. */
function isContainer(node: Element): boolean {
  const { classList } = node;
  return (
    node instanceof HTMLElement &&
    (node.dataset.group !== undefined ||
      classList.contains('props-block-rows') ||
      classList.contains('props-lead'))
  );
}

/** The markup and the values of the controls: a control's value is a property, not markup. */
function signatureOf(node: Element): string {
  const values: string[] = [];
  for (const control of [node, ...node.querySelectorAll('input, select, textarea')]) {
    if (control instanceof HTMLInputElement) {
      values.push(control.type === 'checkbox' ? String(control.checked) : control.value);
    } else if (control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
      values.push(control.value);
    }
  }
  return `${node.outerHTML}\n${values.join('\u0000')}`;
}

/** Keys of the children, a repeated key told apart by its turn. */
function keysOf(parent: Element): string[] {
  const seen = new Map<string, number>();
  return Array.from(parent.children).map((node, index) => {
    const row = node instanceof HTMLElement ? node.dataset.row : undefined;
    const group = node instanceof HTMLElement ? node.dataset.group : undefined;
    const base = keyOf({ row, group, tag: node.tagName, className: node.className }, index);
    const turn = seen.get(base) ?? 0;
    seen.set(base, turn + 1);
    return turn === 0 ? base : `${base}#${turn}`;
  });
}

function copyAttributes(into: Element, from: Element): void {
  for (const name of into.getAttributeNames()) {
    if (!from.hasAttribute(name)) into.removeAttribute(name);
  }
  for (const name of from.getAttributeNames()) {
    const value = from.getAttribute(name);
    if (value !== null && into.getAttribute(name) !== value) into.setAttribute(name, value);
  }
}

/**
 * Lays the children of `from` over the children of `into`, keeping the old nodes the plan keeps.
 * Returns the pinned keys whose old row stayed although a new one was drawn.
 */
export function patchChildren(into: Element, from: Element): string[] {
  const oldNodes = Array.from(into.children);
  const newNodes = Array.from(from.children);
  const oldKeys = keysOf(into);
  const newKeys = keysOf(from);
  const oldByKey = new Map(oldKeys.map((key, i) => [key, oldNodes[i]]));
  const newByKey = new Map(newKeys.map((key, i) => [key, newNodes[i]]));
  const containers = new Set<string>();
  const signature = (key: string, node: Element | undefined, other: Element | undefined) => {
    if (node === undefined) return '';
    if (other !== undefined && isContainer(node) && isContainer(other)) {
      containers.add(key);
      return 'container';
    }
    return signatureOf(node);
  };
  const pinned = new Set<string>();
  for (const [key, node] of oldByKey) {
    if (node?.querySelector('[data-open-list]')) pinned.add(key);
  }
  const plan = patchPlan(
    oldKeys.map((key) => ({
      key,
      signature: signature(key, oldByKey.get(key), newByKey.get(key)),
    })),
    newKeys.map((key) => ({
      key,
      signature: signature(key, newByKey.get(key), oldByKey.get(key)),
    })),
    pinned,
  );
  const chosen: Element[] = [];
  const stale = [...plan.stale];
  for (const step of plan.steps) {
    const old = oldByKey.get(step.key);
    const fresh = newByKey.get(step.key);
    if (step.take === 'old' && old !== undefined) {
      if (containers.has(step.key) && fresh !== undefined) {
        copyAttributes(old, fresh);
        stale.push(...patchChildren(old, fresh));
      }
      chosen.push(old);
    } else if (fresh !== undefined) chosen.push(fresh);
  }
  // Drop what is not kept first, then walk the places: a kept node that is already in its place
  // is never moved, because a move takes the focus from it.
  const keep = new Set(chosen);
  for (const node of oldNodes) if (!keep.has(node)) node.remove();
  let cursor = into.firstElementChild;
  for (const node of chosen) {
    if (node === cursor) cursor = cursor.nextElementSibling;
    else into.insertBefore(node, cursor);
  }
  return stale;
}
