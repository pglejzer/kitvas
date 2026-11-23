# 0023. Studio process

Date: 2026-11-22. Status: accepted.

## Context

The studio must outlive the command that starts it, serve one project, and be found again by later commands of any Claude session. Spec section 9 asks for a detached process with its pid, port and token in the data folder, and a restart when the plugin version changed.

## Decision

One studio per project. `kitvas studio` runs `kitvas studio serve` as a detached process without a window, with its output in `<data>/studio/<key>.log`; the key is 16 hex characters of the hash of the project's real path. Once both servers listen, the process writes `<data>/studio/<key>.json` (pid, ports, token, plugin version, project), whole or not at all and readable by the user only. It removes the file when it stops, unless a newer studio has replaced it.

`kitvas studio` reads the file and asks the studio's status route. A studio of the same version is reused. One of another version is stopped through `POST /api/v1/shutdown`, which needs the token and the studio's own Origin like any change, and is ended by force if it still runs after 5 s. A studio that does not answer loses its file and a new one starts; its process is left alone, because without an answer the pid may belong to another program by now. A start waits up to 15 s for the file and an answer, else the command fails and names the log.

Closing the servers stops new connections and gives open ones 1 s to finish.

## Consequences

Two `kitvas studio` commands at the same moment can start two servers; the later file wins and the other keeps running until it is ended by hand. A studio keeps running after the Claude session ends, until `kitvas studio stop`. The cleanup test with a detached server and its browser is repeated when the studio gets its shared browser (plan 5c).
