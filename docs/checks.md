# Checks

What kitvas checks in a draft. For the rest of kitvas, see the [README](../README.md).

`kitvas check <draft>` builds a draft and checks it: the build, types, the kit's rules, and the page in a browser at 390 and 1280 px, in every state, measures the layout at 768 px too, and adds a reflow check at 320 px. At both widths it puts every control under the pointer and gives it keyboard focus, to read its text there; at 1280 px it also uses each button, group of toggles, select and search field once and reports one that changes nothing on the page. The browser checks cover accessibility, the look (`ui`), the flow (`ux`) and errors at runtime. `--deep` adds the slower checks and measures the page at 1024, 1440, 1920 and 2560 px as well; compose uses it before it hands over a final version.

Every finding has a place, a message and a hint. A finding you dismiss in the editor, with a reason, is kept in the draft's `waivers.json` and is left out of the count. `kitvas guidelines` lists the rules, each with the guidance it is based on.
