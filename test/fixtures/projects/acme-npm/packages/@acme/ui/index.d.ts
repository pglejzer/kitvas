import type { ReactElement, ReactNode } from 'react';

export interface AcmeProviderProps {
  theme?: 'light' | 'dark';
  children?: ReactNode;
}
export declare function AcmeProvider(props: AcmeProviderProps): ReactElement;

export interface ButtonProps {
  variant?: 'solid' | 'ghost';
  className?: string;
  children: ReactNode;
}
export declare function Button(props: ButtonProps): ReactElement;

export interface TextFieldProps {
  label: string;
  placeholder?: string;
  className?: string;
}
export declare function TextField(props: TextFieldProps): ReactElement;

export interface BadgeProps {
  tone?: 'info' | 'warn';
  className?: string;
  children: ReactNode;
}
export declare function Badge(props: BadgeProps): ReactElement;
