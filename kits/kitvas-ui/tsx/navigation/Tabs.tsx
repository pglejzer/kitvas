import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react';
import { cx } from '../core/cx.ts';

export type TabItem = { id: string; label: string; count?: number };

export type TabsProps = Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'children'> & {
  tabs: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** The shown panel. */
  children?: ReactNode;
};

export function Tabs({
  tabs,
  value,
  defaultValue,
  onChange,
  className,
  children,
  ...rest
}: TabsProps) {
  const [own, setOwn] = useState(defaultValue ?? tabs[0]?.id);
  const current = value ?? own;
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    setOwn(tab.id);
    onChange?.(tab.id);
    buttons.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (target < 0) return;
    event.preventDefault();
    choose(target);
  };

  return (
    <div {...rest} className={cx('kit-tabs', className)}>
      <div role="tablist" className="kit-tabs__list">
        {tabs.map((tab, index) => {
          const selected = tab.id === current;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              className="kit-tabs__tab"
              onClick={() => choose(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.label}
              {tab.count === undefined ? null : (
                <>
                  {' '}
                  <span className="kit-tabs__count">{tab.count}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${current}`}
        className="kit-tabs__panel"
      >
        {children}
      </div>
    </div>
  );
}
