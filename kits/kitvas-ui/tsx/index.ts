// Entry of the kitvas UI kit: everything a prototype can import from '@kit'.

// The typeface: imported here so the bundler inlines the font files (see the partial).
import '../scss/core/_font.scss';

export { Button, type ButtonProps } from './action/Button.tsx';
export { IconButton, type IconButtonProps } from './action/IconButton.tsx';
export { Link, type LinkProps } from './action/Link.tsx';
export { Avatar, type AvatarProps } from './display/Avatar.tsx';
export { Badge, type BadgeProps } from './display/Badge.tsx';
export { Chip, type ChipProps } from './display/Chip.tsx';
export { Count, type CountProps } from './display/Count.tsx';
export { Dot, type DotProps } from './display/Dot.tsx';
export { EmptyState, type EmptyStateProps } from './display/EmptyState.tsx';
export { Icon, type IconProps } from './display/Icon.tsx';
export { ICON_NAMES, ICON_SHAPES, type IconName, type IconShape } from './display/icon-paths.ts';
export { Pill, type PillProps } from './display/Pill.tsx';
export { Progress, type ProgressProps } from './display/Progress.tsx';
export { Swatch, type SwatchProps } from './display/Swatch.tsx';
export { Table, type TableColumn, type TableProps } from './display/Table.tsx';
export { Alert, type AlertProps } from './feedback/Alert.tsx';
export { Checkbox, type CheckboxProps } from './input/Checkbox.tsx';
export { DateField, type DateFieldProps } from './input/DateField.tsx';
export { Input, type InputProps } from './input/Input.tsx';
export { Radio, type RadioOption, type RadioProps } from './input/Radio.tsx';
export { Search, type SearchProps } from './input/Search.tsx';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './input/SegmentedControl.tsx';
export { Select, type SelectOption, type SelectProps } from './input/Select.tsx';
export { Slider, type SliderProps } from './input/Slider.tsx';
export { Stepper, type StepperProps } from './input/Stepper.tsx';
export { Switch, type SwitchProps } from './input/Switch.tsx';
export { Textarea, type TextareaProps } from './input/Textarea.tsx';
export { Bar, type BarProps } from './layout/Bar.tsx';
export { Card, type CardProps } from './layout/Card.tsx';
export { Grid, type GridProps } from './layout/Grid.tsx';
export { Group, type GroupProps } from './layout/Group.tsx';
export { Inverse, type InverseProps } from './layout/Inverse.tsx';
export { Island, type IslandProps } from './layout/Island.tsx';
export { Row, type RowProps } from './layout/Row.tsx';
export { Separator, type SeparatorProps } from './layout/Separator.tsx';
export { Stack, type StackProps } from './layout/Stack.tsx';
export { Breadcrumbs, type BreadcrumbsProps, type Crumb } from './navigation/Breadcrumbs.tsx';
export { Menu, type MenuItem, type MenuProps } from './navigation/Menu.tsx';
export { Nav, type NavItem, type NavProps } from './navigation/Nav.tsx';
export { Pagination, type PaginationProps } from './navigation/Pagination.tsx';
export { type TabItem, Tabs, type TabsProps } from './navigation/Tabs.tsx';
export { Dialog, type DialogProps } from './overlay/Dialog.tsx';
export { Popover, type PopoverProps } from './overlay/Popover.tsx';
export { Toast, type ToastProps } from './overlay/Toast.tsx';
export { Tooltip, type TooltipProps } from './overlay/Tooltip.tsx';
export { Heading, type HeadingProps } from './typography/Heading.tsx';
export { Kbd, type KbdProps } from './typography/Kbd.tsx';
export { Text, type TextProps } from './typography/Text.tsx';
