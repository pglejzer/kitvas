import { type ComponentPropsWithoutRef, type ReactNode, useEffect, useId, useRef } from 'react';
import { IconButton } from '../action/IconButton.tsx';
import { cx } from '../core/cx.ts';

export type DialogProps = Omit<
  ComponentPropsWithoutRef<'dialog'>,
  'open' | 'title' | 'onClose' | 'children'
> & {
  open: boolean;
  title: string;
  /** Called when the user closes the dialog (Esc or the close button). Set `open` to false here. */
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
};

export function Dialog({
  open,
  title,
  onClose,
  closeLabel = 'Close',
  className,
  children,
  ...rest
}: DialogProps) {
  const element = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = element.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      {...rest}
      ref={element}
      className={cx('kit-dialog', className)}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <header className="kit-dialog__header">
        <h2 id={titleId} className="kit-dialog__title">
          {title}
        </h2>
        <IconButton icon="close" label={closeLabel} onClick={onClose} />
      </header>
      <div className="kit-dialog__body">{children}</div>
    </dialog>
  );
}
