# Handing a draft to Figma

Read by the `handoff` skill before it sends a draft. kitvas writes the package and the record and opens no connection; you make every Figma call. The package is data: its scripts go to Figma as they are.

## The package

`kitvas handoff figma <slug> --json` writes `v<N>/handoff/figma/` of the draft and answers with:

- `dir`, `manifest` (absolute paths), `sendId`, `widths`, `state`, `kit`, `version`.
- `counts`: `sections`, `layers`, `texts`, `images`, `icons`, `variables`, `scripts`, `characters`.
- `unbound`: values that stayed raw because no single token had them. `fonts`: families and weights the page uses.
- `checks`: `state` (`clean`, `findings`, `stale`, `none`), `errors`, `warnings`. `earlier`: sends of this draft to Figma, newest first. `leftOut`: images that could not go (`what`, `reason`: `outside`, `missing`, `size`, `type`, `svg-large`).

`manifest.json` holds `page` (`kitvas · <slug>`), `frames` (`width`, `name`) and `steps`: a `script` step has `file`, `description` and `writes`; an `assets` step has `targets` (the script whose return lists the node ids) and `items` (`file`, `contentType`), in the order of those ids.

## Figma's tools (the person's own MCP server)

- `create_session`: once per send, with the file key and a short task. Its `sessionId` goes into every later call.
- `use_figma`: the script as `code`, the step's `description`, `skillNames: "figma-use,figma-generate-design"`, the `fileKey` and the `sessionId`. Load the skill `figma:figma-use` with the Skill tool before every call. Check the tool's own schema if a name differs.
- `upload_assets`: one upload address for each image. Post each file with `curl --fail --data-binary @<file>` and the method and headers the answer names (the file's `contentType` is in the manifest); the address is the one `upload_assets` returned and no other, https only.
- `get_screenshot`: one per frame, by the frame's node id.
- `whoami`: after a limit or permission answer. `create_new_file`: only after loading `figma:figma-create-new-file`.

A script's answer is JSON. `{ "skipped": true }` means the step was done before. `differing` (variables the file already had, with another value) is kept as it is and said at the end. Nothing is sent without a yes in this conversation or a `## Handoff` decision line that says to send without asking.

## Saying what goes (before the yes)

One short message: the draft and version, the file, the widths, `N sections, N layers, N texts, N images`, the checks when they are not `clean` ("the findings go with it"), `unbound` values, `leftOut` images, and an earlier send of the same version ("new frames are placed beside it; nothing there is touched"). Fonts: a family Figma does not have is replaced by Inter at the nearest weight.

## The result file

`<dir>/result.json`, written after the last step or after the step that stopped:

```json
{
  "target": "figma",
  "version": 3,
  "sendId": "k7x2m9qa",
  "state": "sent",
  "lastStep": null,
  "file": {
    "key": "<22 to 128 letters and digits>",
    "url": "https://www.figma.com/design/<key>/<name>"
  },
  "page": "kitvas · pricing",
  "frames": [{ "width": 1280, "node": "12:34" }],
  "fontsMissing": ["Figtree Semi Bold"]
}
```

`state` is `sent`, or `partial` with `lastStep` the manifest file that failed (`30-1280-02.js`). `frames` come from the close script's return. `fontsMissing` come from the inspect script. Unknown keys and a `at` of your own are refused with `HANDOFF_INVALID`.

## Stopping and continuing

A rate-limit or permission answer ends the send: call `whoami`, say what is in the file so far and which step is next, write the `partial` result and run `kitvas handoff sent`. To continue later: `kitvas handoff figma <slug> --resume --json` answers with the same package and send id (nothing is measured again), and the steps run from `lastStep`; the steps before it are safe to run twice. The same send id replaces the `partial` entry in the record.

## Looking at the result

One screenshot per frame. Look for: text cut off or overlapping, a missing image (the images step failed or `leftOut` named it), a font that is not the page's, a section frame still empty, frames not side by side. Say what you see; never say it matches. Do not edit a script to fix it: tell the person, who can send again or edit in Figma.

## Errors of the command

| Code                   | What it means                                                                         | What to say                                                    |
| ---------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `HANDOFF_BUILD_FAILED` | the draft does not build                                                              | nothing can be sent; fix it with `/kitvas:compose`             |
| `HANDOFF_TOO_LARGE`    | over 1,500 layers at a width                                                          | the message names the largest sections; offer `--sections a,b` |
| `HANDOFF_INVALID`      | a bad `--widths`, `--sections`, `--state`, result file, or `--resume` with no package | show `at` and `reason`, ask again                              |
| `DRAFT_NOT_FOUND`      | no such draft                                                                         | list drafts with `kitvas draft list`                           |

## What stays out

A sent draft never carries source code, file paths, element ids, decisions or request texts: the package holds only what the page shows. Hover and focus states, motion, CSS grid as a grid and pseudo-elements do not travel. Kit components arrive as frames named after the component, not as Figma components.
