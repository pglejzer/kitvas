import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  type BrowserHost,
  createSystemBrowser,
  launcherFor,
} from '../../../src/studio/adapters/system-browser.ts';
import { tempDir } from '../../helpers/tmp.ts';

const URL_MAIN = 'http://kitvas.localhost:5000/open?code=c0de&to=%2F';
const URL_FALLBACK = 'http://localhost:5000/open?code=c0de&to=%2F';
const HANDLER = 'url.dll,FileProtocolHandler';

const host = (platform: NodeJS.Platform, release: string, env: BrowserHost['env'] = {}) => ({
  platform,
  release,
  env,
});

test('Windows: its own handler by full path, never a program from the current folder', () => {
  const custom = host('win32', '10.0.26100', { SystemRoot: 'D:\\Win' });
  assert.deepEqual(launcherFor(custom, URL_MAIN, URL_FALLBACK), {
    bin: 'D:\\Win\\System32\\rundll32.exe',
    args: [HANDLER, URL_MAIN],
  });
  assert.deepEqual(launcherFor(host('win32', '10.0.26100'), URL_MAIN, URL_FALLBACK), {
    bin: 'C:\\Windows\\System32\\rundll32.exe',
    args: [HANDLER, URL_MAIN],
  });
});

test('macOS 26 (Darwin 25) opens kitvas.localhost; older ones get the localhost link', () => {
  const open = (release: string) => launcherFor(host('darwin', release), URL_MAIN, URL_FALLBACK);
  assert.deepEqual(open('25.0.0'), { bin: '/usr/bin/open', args: [URL_MAIN] });
  assert.deepEqual(open('26.1.0'), { bin: '/usr/bin/open', args: [URL_MAIN] });
  assert.deepEqual(open('24.6.0'), { bin: '/usr/bin/open', args: [URL_FALLBACK] });
  // A version that cannot be read gets the address every browser resolves.
  assert.deepEqual(open(''), { bin: '/usr/bin/open', args: [URL_FALLBACK] });
});

test('Linux opens with xdg-open only when there is a display', () => {
  const linux = (env: BrowserHost['env']) =>
    launcherFor(host('linux', '6.8.0-45-generic', env), URL_MAIN, URL_FALLBACK);
  const xdg = { bin: 'xdg-open', args: [URL_MAIN] };
  assert.deepEqual(linux({ DISPLAY: ':0' }), xdg);
  assert.deepEqual(linux({ WAYLAND_DISPLAY: 'wayland-0' }), xdg);
  assert.equal(linux({}), undefined);
  assert.equal(linux({ DISPLAY: '' }), undefined);
  const bsd = host('freebsd', '14.1-RELEASE', { DISPLAY: ':0' });
  assert.deepEqual(launcherFor(bsd, URL_MAIN, URL_FALLBACK), xdg);
});

test('WSL opens the Windows browser through interop, with or without a Linux display', () => {
  const wsl = { bin: 'rundll32.exe', args: [HANDLER, URL_MAIN] };
  const release = '5.15.167.4-microsoft-standard-WSL2';
  assert.deepEqual(launcherFor(host('linux', release), URL_MAIN, URL_FALLBACK), wsl);
  const withDisplay = host('linux', release, { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0' });
  assert.deepEqual(launcherFor(withDisplay, URL_MAIN, URL_FALLBACK), wsl);
  const wsl1 = host('linux', '4.4.0-19041-Microsoft');
  assert.deepEqual(launcherFor(wsl1, URL_MAIN, URL_FALLBACK), wsl);
  const named = host('linux', '6.6.36.3', { WSL_DISTRO_NAME: 'Ubuntu' });
  assert.deepEqual(launcherFor(named, URL_MAIN, URL_FALLBACK), wsl);
});

test('only web addresses are handed to a program, never something read as an option', () => {
  const mac = host('darwin', '25.0.0');
  assert.equal(launcherFor(mac, '-a Terminal', URL_FALLBACK), undefined);
  assert.equal(launcherFor(mac, URL_MAIN, '--args'), undefined);
  assert.equal(launcherFor(host('win32', '10.0'), 'file:///C:/x.exe', URL_FALLBACK), undefined);
});

test('the system browser answers false, without throwing, when nothing can be opened', () => {
  const headless = host('linux', '6.8.0', {});
  assert.equal(createSystemBrowser(headless)(URL_MAIN, URL_FALLBACK), false);
  // A launcher that does not exist is a false answer too, never a crash of the CLI.
  const nowhere = host('win32', '10.0', { SystemRoot: join(tempDir(), 'no-windows') });
  assert.equal(createSystemBrowser(nowhere)(URL_MAIN, URL_FALLBACK), false);
});
