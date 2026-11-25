// Deleting a draft, with a way back (ADR 0064): the quiet control on a card, the Deleted list, the
// confirm, the message with Undo, and the page of a draft that was deleted. Studio tokens only
// (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_TRASH = `
/* On the card's corner, over the thumbnail and the link that covers the card. It is always in view,
   in the muted tone, and at full strength on hover and focus. */
.trash-card-del {
  position: absolute;
  top: var(--st-space-12);
  right: var(--st-space-12);
  z-index: 1;
  background: var(--st-color-pop);
  box-shadow: var(--st-shadow-low);
  color: var(--st-color-ink-mid);
  transition: color var(--st-motion-fast) var(--st-ease-out);
}
.trash-card-del:hover { background: var(--st-color-pop); }
.gallery-card:hover .trash-card-del,
.gallery-card:focus-within .trash-card-del,
.trash-card-del:hover,
.trash-card-del:focus-visible { color: var(--st-color-ink); }
.trash-list {
  display: grid;
  gap: var(--st-space-8);
  max-width: 720px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.trash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-16);
  padding: var(--st-space-12) var(--st-space-16);
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
.trash-info { display: grid; gap: var(--st-space-2); min-width: 0; }
.trash-title {
  overflow: hidden;
  font-weight: var(--st-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trash-actions { display: flex; flex: none; align-items: center; gap: var(--st-space-4); }
.state-card .trash-actions { margin-top: var(--st-space-8); }
/* The one destructive action of a confirm or a row: the fix tone, no fill until it is hovered. */
.trash-danger { color: var(--st-color-fix); }
.trash-danger:hover { background: var(--st-color-fix-soft); color: var(--st-color-fix); }
.trash-dialog { width: min(440px, calc(100vw - var(--st-space-32))); }
.trash-dialog h2 { margin: 0 0 var(--st-space-8); }
.trash-dialog p { margin: 0; color: var(--st-color-ink-mid); }
.trash-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--st-space-8);
  margin-top: var(--st-space-16);
}
/* The message after a delete: its text, and Undo while it can still be undone. */
.trash-message > button { color: var(--st-color-accent); font-weight: var(--st-font-weight-medium); }
`;
