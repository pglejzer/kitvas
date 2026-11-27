import { type ComponentPropsWithoutRef, type ReactNode, useId, useRef, useState } from 'react';
import { Button } from '../action/Button.tsx';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';
import type { IconName } from '../display/icon-paths.ts';
import { useDismiss, useKeepInView } from './dismiss.ts';

export type PopoverProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  /** The trigger's text. */
  label: string;
  icon?: IconName;
  placement?: 'bottom-start' | 'bottom-end';
  children: ReactNode;
};

export function Popover({
  label,
  icon,
  placement = 'bottom-start',
  className,
  children,
  ...rest
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const anchor = placement === 'bottom-end' ? 'end' : 'start';
  const flip = useKeepInView(open, panel, anchor);
  const side = (anchor === 'start') !== flip ? 'start' : 'end';

  useDismiss(open, root, (reason) => {
    setOpen(false);
    if (reason === 'escape') trigger.current?.focus();
  });

  return (
    <div {...rest} ref={root} className={cx('kit-popover', className)}>
      <Button
        ref={trigger}
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {icon ? <Icon name={icon} /> : null}
        {label}
      </Button>
      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label={label}
          className={`kit-popover__panel kit-popover__panel--${side}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
