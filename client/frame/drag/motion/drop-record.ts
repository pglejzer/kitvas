// What a drop changed in the frame's own DOM, kept so a drop the studio did not take can be undone
// (`drop-back`). A drop moves nodes at once (`preview.ts`) and a build replaces the page only when
// the edit was applied; when it was refused, in conflict or lost, the nodes go back to where they
// stood and a placeholder leaves. No DOM type is named here: a node is read through four members
// and a test passes plain objects.

/** A node's parent, as far as putting a node back needs it. */
export type Holder<N> = {
  isConnected: boolean;
  insertBefore(node: N, before: N | null): unknown;
};

/** A node of the page, or a fake of one. */
export type Seated<N> = {
  isConnected: boolean;
  parentNode: Holder<N> | null;
  nextSibling: N | null;
  remove(): void;
};

export type DropRecord<N> = {
  /** Remembers where `nodes` stand now; call it just before they are moved. */
  note(nodes: readonly N[]): void;
  /** Puts the noted nodes back, last noted first, and forgets them. */
  back(): void;
  /** Forgets them: the page was replaced, or a new drag began. */
  forget(): void;
};

type Seat<N> = { node: N; parent: Holder<N> | null; next: N | null };

export function createDropRecord<N extends Seated<N>>(): DropRecord<N> {
  let seats: Seat<N>[] = [];

  function restore({ node, parent, next }: Seat<N>): void {
    // A node the page no longer holds belongs to a render that left: nothing there is ours.
    if (!node.isConnected) return;
    // It had no place before (a placeholder): it leaves.
    if (parent === null) {
      node.remove();
      return;
    }
    if (!parent.isConnected) return;
    // The sibling it stood before may have left or moved since: then it goes last.
    const before = next?.isConnected && next.parentNode === parent ? next : null;
    if (node.parentNode === parent && node.nextSibling === before) return;
    parent.insertBefore(node, before);
  }

  return {
    note(nodes) {
      for (const node of nodes) {
        seats.push({ node, parent: node.parentNode, next: node.nextSibling });
      }
    },
    back() {
      const noted = seats;
      seats = [];
      for (const seat of noted.reverse()) restore(seat);
    },
    forget() {
      seats = [];
    },
  };
}
