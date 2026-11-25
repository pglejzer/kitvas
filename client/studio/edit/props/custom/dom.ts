// The two DOM helpers every control of the properties panel builds with (moved out of
// `controls.ts` so the custom editors can use them without importing it back). Plan 19, task T5.
// Spec goal 14 ("Controls that keep to the kit"). `controls.ts` exports them again.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/** An input drawn with `value`: the panel tells a half-typed value from it. */
export function field(className: string, control: string, label: string, value: string) {
  const input: HTMLInputElement = el('input', className);
  input.dataset.control = control;
  input.setAttribute('aria-label', label);
  input.value = value;
  input.dataset.initial = value;
  return input;
}
