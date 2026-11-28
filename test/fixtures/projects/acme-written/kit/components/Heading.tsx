import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Heading.module.css';

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  children: ReactNode;
};

export function Heading({ children, ...rest }: HeadingProps) {
  return (
    <h1 className={styles.heading} {...rest}>
      {children}
    </h1>
  );
}
