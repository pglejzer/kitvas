import type { HTMLAttributes } from 'react';
import styles from './Field.module.css';

export type FieldProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
};

export function Field({ label, name, placeholder, defaultValue, ...rest }: FieldProps) {
  return (
    <div className={styles.host} {...rest}>
      <label className={styles.caption} htmlFor={name}>
        {label}
      </label>
      <input
        className={styles.input}
        type="text"
        id={name}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </div>
  );
}
