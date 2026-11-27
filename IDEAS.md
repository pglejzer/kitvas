# Ideas

Things that may come to kitvas later. None of them has a date, and any of them may change or be dropped.

To propose one, or to say that you need one of these, open a **Feature** issue at <https://github.com/pglejzer/kitvas/issues/new/choose>.

## Share a draft and talk it over

Today a draft lives on your machine, in your studio. You would publish a finished version as a page on claude.ai and share the link with the people you work with. They comment on the page, and Claude reads the comments, turns them into notes or a new version, and publishes that version under the same link. The people who comment need neither kitvas nor a design tool.

Nothing leaves your machine until you say yes, as with `/kitvas:handoff figma`. It works only where Claude Code can publish pages to claude.ai, so, like a Figma MCP, it is an optional extra.

## Work on one studio together over a private network

Today the studio opens only on your own machine. You would let it be reached over a private network your team already shares, such as Tailscale or WireGuard: no server, no account, nothing in the cloud. The others open your studio in their browser, see every change as it happens and leave notes for Claude. Later they could edit too, and see who is working where.

You turn it on yourself, and each person you invite gets their own link. Your files and your Claude session do the work, so the studio is there for the others only while it runs on your machine.

## A board around the page

Today the editor shows the page alone on an empty stage. The stage would become a board, like the canvas around the frames in a design tool. You drag an element out of the page and set it down beside it, where it stays, drawn with the kit, until you drag it back in. You could also put a component from the palette on the board to try it before it goes into the page, or keep the page at two widths side by side.

On the board, things stay where you put them. In the page, an element always lands in the layout, before, after or inside another one, because the page is real code that has to work at every width.

## Click-through prototypes

A button in one draft opens another draft, so a few screens play as one flow: sign up, then the empty dashboard, then the first project. Today each draft stands alone, with its own states and options.

## Learn a kit from a Storybook

Many design systems publish a Storybook. kitvas could read the components, their props and their stories from it, the way it reads a package, a folder or a website today.
