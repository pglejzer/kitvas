# When something does not work

For the rest of kitvas, see the [README](../README.md).

Run `kitvas doctor`. It checks Node, packages, the plugin, the workspace, the kit, the browser, the data and drafts folders, the ports and the studio's recent errors, and says what to do for each check that is not ok. It changes nothing that lasts.

`kitvas doctor --report` prints text to paste into an issue. It writes your home folder as `~` and the project folder as `<project>`, and leaves out names and addresses.

Open an issue at https://github.com/pglejzer/kitvas/issues. Report a vulnerability through [SECURITY.md](../SECURITY.md), not as a public issue.

## Limits

- Prototypes are React only.
- kitvas will not write into your application's code. Everything goes to `.kitvas/`, or to a folder you name when you export.
- kitvas will not open a local or private address you give it, unless you allow it with `--allow-private`.
- kitvas will not copy an example. A page, screenshot or logo you show gives the idea and the style, never a traced copy.
- The editor refuses a change it cannot write safely, such as a text from a prop or a call, and hands it to Claude with the reason. See [the editor guide](editor.md).
