import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './Card.module.css';

export type CardProps = {
  title: string;
  actionLabel: string;
  children: ReactNode;
};

export function Card({ title, actionLabel, children }: CardProps) {
  return (
    <div className={styles.host}>
      <h3 className={styles.label}>{title}</h3>
      <div className={styles.body}>{children}</div>
      <Button>{actionLabel}</Button>
    </div>
  );
}
