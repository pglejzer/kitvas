import { type RefObject, useEffect, useLayoutEffect, useState } from 'react';

/**
 * While `open`, calls `onDismiss` on Escape and on a press outside `root`. The caller decides what
 * closing means (a menu gives the focus back to its trigger on Escape).
 */
export function useDismiss(
  open: boolean,
  root: RefObject<HTMLElement | null>,
  onDismiss: (reason: 'escape' | 'outside') => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss('escape');
    };
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        onDismiss('outside');
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open, root, onDismiss]);
}

/**
 * True when something that floats from the start (or end) edge of its anchor would leave the
 * viewport, so the caller anchors it to the other edge. Measured once, when it opens.
 */
export function useKeepInView(
  open: boolean,
  element: RefObject<HTMLElement | null>,
  anchor: 'start' | 'end',
): boolean {
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    if (!open) {
      setFlip(false);
      return;
    }
    const box = element.current?.getBoundingClientRect();
    if (!box) return;
    const margin = 16;
    const width = document.documentElement.clientWidth;
    setFlip(anchor === 'start' ? box.right > width - margin : box.left < margin);
  }, [open, anchor, element]);
  return flip;
}
