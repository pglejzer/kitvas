import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from './Button';
import styles from './Card.module.css';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  actionLabel: string;
  children: ReactNode;
};

export function Card({ title, actionLabel, children, ...rest }: CardProps) {
  return (
    <div className={styles.card} {...rest}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.body}>{children}</div>
      <Button className={styles.action}>{actionLabel}</Button>
    </div>
  );
}
