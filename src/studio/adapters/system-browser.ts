// Opens a studio link in the person's default browser, for `kitvas studio --open` (ADR 0040). The
// program and its arguments are fixed here and run without a shell, so nothing in a link is ever
// read as a command.

import { spawn } from 'node:child_process';
import { release } from 'node:os';
import { win32 } from 'node:path';

/** What `launcherFor` needs to know about the machine. */
export type BrowserHost = {
  platform: NodeJS.Platform;
  /** `os.release()`: Darwin's version on macOS, the kernel's on Linux and WSL. */
  release: string;
  env: Record<string, string | undefined>;
};

/** A program and its arguments. */
export type Launcher = { bin: string; args: string[] };

/** Opens `url`, or `fallbackUrl` where the browser may not resolve `kitvas.localhost`. */
export type OpenBrowser = (url: string, fallbackUrl: string) => boolean;

/** Darwin 25 is macOS 26, the first whose Safari resolves `*.localhost` names. */
const DARWIN_WITH_LOCALHOST = 25;

/** Windows' own handler for an address: it starts the default browser and ends. */
const HANDLER = 'url.dll,FileProtocolHandler';

/** WSL 1 and 2 name Microsoft in the kernel's version; the distro's name is set in its shells. */
const isWsl = (host: BrowserHost): boolean =>
  /microsoft/i.test(host.release) || host.env.WSL_DISTRO_NAME !== undefined;

/**
 * The program that opens the link, or `undefined` where nothing should be opened: a Linux machine
 * without a display, such as one reached over SSH. The link is printed either way.
 */
export function launcherFor(
  host: BrowserHost,
  url: string,
  fallbackUrl: string,
): Launcher | undefined {
  // Only web addresses: a value that starts with `-` would be read as an option of the program.
  if (!url.startsWith('http://') || !fallbackUrl.startsWith('http://')) return undefined;
  if (host.platform === 'win32') {
    // By full path: Windows looks for a bare program name in the current folder first.
    const root = host.env.SystemRoot ?? host.env.SYSTEMROOT ?? 'C:\\Windows';
    return { bin: win32.join(root, 'System32', 'rundll32.exe'), args: [HANDLER, url] };
  }
  if (host.platform === 'darwin') {
    const major = Number.parseInt(host.release.split('.')[0] ?? '', 10);
    // Safari may be the default browser; an unknown version gets the name every browser resolves.
    return { bin: '/usr/bin/open', args: [major >= DARWIN_WITH_LOCALHOST ? url : fallbackUrl] };
  }
  // The person's browser runs on Windows; WSL puts Windows' own folders on its PATH.
  if (isWsl(host)) return { bin: 'rundll32.exe', args: [HANDLER, url] };
  const display = host.env.DISPLAY || host.env.WAYLAND_DISPLAY;
  return display ? { bin: 'xdg-open', args: [url] } : undefined;
}

const thisMachine = (): BrowserHost => ({
  platform: process.platform,
  release: release(),
  env: process.env,
});

/**
 * Opens links on `host`, this machine unless given. The launcher runs detached, with no output
 * of its own, so the CLI never waits for it: `xdg-open` can last as long as the browser it
 * starts. That is why this uses `spawn`, since `execFile` keeps pipes to the child. A failure
 * only makes the answer `false`.
 */
export function createSystemBrowser(host: BrowserHost = thisMachine()): OpenBrowser {
  return (url, fallbackUrl) => {
    const launcher = launcherFor(host, url, fallbackUrl);
    if (!launcher) return false;
    try {
      const child = spawn(launcher.bin, launcher.args, {
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: true,
      });
      // A missing program is reported as an event, which must not crash the CLI.
      child.once('error', () => undefined);
      child.unref();
      return child.pid !== undefined;
    } catch {
      return false;
    }
  };
}
