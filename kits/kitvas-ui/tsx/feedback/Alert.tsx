import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';
import type { IconName } from '../display/icon-paths.ts';

export type AlertProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
  tone?: 'neutral' | 'good' | 'review' | 'fix';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

const TONE_ICON: Record<NonNullable<AlertProps['tone']>, IconName> = {
  neutral: 'info',
  good: 'check-circle',
  review: 'alert',
  fix: 'alert',
};

export function Alert({
  tone = 'neutral',
  title,
  children,
  action,
  className,
  ...rest
}: AlertProps) {
  return (
    <div
      {...rest}
      role={tone === 'review' || tone === 'fix' ? 'alert' : 'status'}
      className={cx('kit-alert', `kit-alert--${tone}`, className)}
    >
      <Icon name={TONE_ICON[tone]} className="kit-alert__icon" />
      <div className="kit-alert__text">
        <strong className="kit-alert__title">{title}</strong>
        {children ? <div className="kit-alert__body">{children}</div> : null}
      </div>
      {action ? <div className="kit-alert__action">{action}</div> : null}
    </div>
  );
}
