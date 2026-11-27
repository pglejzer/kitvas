import { cloneElement, type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { cx } from '../core/cx.ts';
import { useKeepInView } from './dismiss.ts';

export type TooltipProps = {
  text: string;
  /** The one element the text describes. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
};

export function Tooltip({ text, children, className }: TooltipProps) {
  const [shown, setShown] = useState(false);
  const bubble = useRef<HTMLSpanElement>(null);
  const id = useId();
  const flip = useKeepInView(shown, bubble, 'start');

  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShown(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shown]);

  const described = [children.props['aria-describedby'], id].filter(Boolean).join(' ');

  return (
    // The wrapper only listens: the described element keeps the focus and the role.
    <span
      className={cx('kit-tooltip', className)}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {cloneElement(children, { 'aria-describedby': described })}
      <span
        ref={bubble}
        id={id}
        role="tooltip"
        hidden={!shown}
        className={`kit-tooltip__bubble kit-tooltip__bubble--${flip ? 'end' : 'start'}`}
      >
        {text}
      </span>
    </span>
  );
}
