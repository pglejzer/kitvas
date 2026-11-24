// The confirm of a delete and of "Delete forever" (ADR 0064): a modal `<dialog>`, so the browser
// holds the focus inside it and Escape closes it. The focus starts on Cancel, the safe answer, and
// goes back to where it was when the dialog closes.

export type ConfirmOptions = {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
};

let counter = 0;

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/** Resolves `true` for the confirming button, `false` for Cancel, Escape or a click outside. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  counter += 1;
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const box = make('dialog', 'k-pop k-dialog trash-dialog');
  const titleId = `trash-dialog-title-${counter}`;
  const bodyId = `trash-dialog-body-${counter}`;
  box.setAttribute('aria-labelledby', titleId);
  box.setAttribute('aria-describedby', bodyId);
  const title = make('h2', 'trash-dialog-title', options.title);
  title.id = titleId;
  const body = make('p', 'trash-dialog-body', options.body);
  body.id = bodyId;
  const cancel = make('button', 'k-btn', options.cancel);
  cancel.type = 'button';
  const confirm = make('button', 'k-btn k-btn-line trash-danger', options.confirm);
  confirm.type = 'button';
  const actions = make('div', 'trash-dialog-actions');
  actions.append(cancel, confirm);
  box.append(title, body, actions);

  return new Promise((resolve) => {
    cancel.addEventListener('click', () => box.close('cancel'));
    confirm.addEventListener('click', () => box.close('confirm'));
    // A click on the backdrop lands on the dialog itself, outside its box: it cancels.
    box.addEventListener('click', (event) => {
      if (event.target !== box) return;
      const edge = box.getBoundingClientRect();
      const inside =
        event.clientX >= edge.left &&
        event.clientX <= edge.right &&
        event.clientY >= edge.top &&
        event.clientY <= edge.bottom;
      if (!inside) box.close('cancel');
    });
    // The page's own Escape handlers (the editor's) do not also act on the key that closes this.
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
    box.addEventListener('close', () => {
      const answer = box.returnValue === 'confirm';
      box.remove();
      if (back?.isConnected) back.focus();
      resolve(answer);
    });
    document.body.append(box);
    box.showModal();
    cancel.focus();
  });
}
