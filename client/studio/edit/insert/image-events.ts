// A stored image is told to whoever lists the draft's images: every way of adding a file (the
// Insert tab, a drop on the canvas, the background picker) ends in `uploadImage`, which announces it.

type Listener = (file: string) => void;

const listeners = new Set<Listener>();

/** Calls `listener` with the stored name after each upload; the returned function stops it. */
export function onImageStored(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceStored(file: string): void {
  for (const listener of listeners) listener(file);
}
