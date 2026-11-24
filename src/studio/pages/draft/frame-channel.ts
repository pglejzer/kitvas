// The end of a frame's address that turns its channel to the studio page on:
// `#kitvas=<channel>&studio=<port>`. The browser side reads the same form (client/channel).

/** The studio's port: what follows the last `:` of the request's Host. */
export function studioPortOf(host: string): string {
  return host.slice(host.lastIndexOf(':') + 1);
}

export function withChannel(src: string, channel: string, host: string): string {
  return `${src}#kitvas=${channel}&studio=${studioPortOf(host)}`;
}
