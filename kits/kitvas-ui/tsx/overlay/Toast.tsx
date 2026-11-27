import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { IconButton } from '../action/IconButton.tsx';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';
import type { IconName } from '../display/icon-paths.ts';

export type ToastProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
  tone?: 'neutral' | 'good' | 'review' | 'fix';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Shows a close button; called when it is pressed. */
  onClose?: () => void;
  closeLabel?: string;
};

const TONE_ICON: Record<NonNullable<ToastProps['tone']>, IconName> = {
  neutral: 'info',
  good: 'check-circle',
  review: 'alert',
  fix: 'alert',
};

export function Toast({
  tone = 'neutral',
  title,
  children,
  action,
  onClose,
  closeLabel = 'Dismiss',
  className,
  ...rest
}: ToastProps) {
  return (
    <div {...rest} role="status" className={cx('kit-toast', `kit-toast--${tone}`, className)}>
      <Icon name={TONE_ICON[tone]} className="kit-toast__icon" />
      <div className="kit-toast__text">
        <strong className="kit-toast__title">{title}</strong>
        {children ? <div className="kit-toast__body">{children}</div> : null}
      </div>
      {action ? <div className="kit-toast__action">{action}</div> : null}
      {onClose ? <IconButton icon="close" label={closeLabel} onClick={onClose} /> : null}
    </div>
  );
}
