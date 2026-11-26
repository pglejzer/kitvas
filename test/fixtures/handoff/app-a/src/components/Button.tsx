import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet';
};

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return <button className={clsx(styles.button, styles[variant], className)} {...rest} />;
}
