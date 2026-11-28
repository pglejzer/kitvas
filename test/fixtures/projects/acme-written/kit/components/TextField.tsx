import { type HTMLAttributes, useId } from 'react';
import styles from './TextField.module.css';

export type TextFieldProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  placeholder?: string;
};

export function TextField({ label, placeholder, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <div className={styles.field} {...rest}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" placeholder={placeholder} className={styles.input} />
    </div>
  );
}
