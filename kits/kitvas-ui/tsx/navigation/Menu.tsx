import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Button } from '../action/Button.tsx';
import { cx } from '../core/cx.ts';
import { Icon } from '../display/Icon.tsx';
import type { IconName } from '../display/icon-paths.ts';
import { useDismiss, useKeepInView } from '../overlay/dismiss.ts';

export type MenuItem =
  | { id: string; label: string; icon?: IconName; danger?: boolean; disabled?: boolean }
  | { separator: true };

export type MenuProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'onSelect'> & {
  /** The trigger's text. */
  label: string;
  icon?: IconName;
  items: MenuItem[];
  onSelect?: (id: string) => void;
};

/** A separator has no id: its key is the item it follows. */
const keyed = (items: MenuItem[]): { item: MenuItem; key: string }[] => {
  let last = 'start';
  return items.map((item) => {
    if ('separator' in item) return { item, key: `after-${last}` };
    last = item.id;
    return { item, key: item.id };
  });
};

export function Menu({ label, icon, items, onSelect, className, ...rest }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const flip = useKeepInView(open, list, 'start');

  const enabled = (): HTMLButtonElement[] =>
    Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );

  useDismiss(open, root, (reason) => {
    setOpen(false);
    if (reason === 'escape') trigger.current?.focus();
  });

  useEffect(() => {
    if (open) {
      list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    }
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = enabled();
    const focused = document.activeElement;
    const index = focused instanceof HTMLButtonElement ? buttons.indexOf(focused) : -1;
    const target =
      event.key === 'ArrowDown'
        ? (index + 1) % buttons.length
        : event.key === 'ArrowUp'
          ? (index - 1 + buttons.length) % buttons.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : -1;
    if (event.key === 'Tab') setOpen(false);
    if (target < 0) return;
    event.preventDefault();
    buttons[target]?.focus();
  };

  const choose = (id: string) => {
    setOpen(false);
    trigger.current?.focus();
    onSelect?.(id);
  };

  return (
    <div {...rest} ref={root} className={cx('kit-menu', className)}>
      <Button
        ref={trigger}
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon ? <Icon name={icon} /> : null}
        {label}
        <Icon name="chevron-down" />
      </Button>
      {open ? (
        <div
          ref={list}
          id={listId}
          role="menu"
          aria-label={label}
          className={`kit-menu__list kit-menu__list--${flip ? 'end' : 'start'}`}
          onKeyDown={onKeyDown}
        >
          {keyed(items).map(({ item, key }) =>
            'separator' in item ? (
              <hr key={key} className="kit-menu__separator" />
            ) : (
              <button
                key={key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                className={cx('kit-menu__item', item.danger && 'kit-menu__item--danger')}
                onClick={() => choose(item.id)}
              >
                {item.icon ? <Icon name={item.icon} /> : null}
                <span className="kit-menu__label">{item.label}</span>
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
