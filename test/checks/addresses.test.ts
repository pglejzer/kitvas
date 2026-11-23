import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPrivateAddress, scanPolicy } from '../../src/checks/index.ts';

test('private, loopback, link-local, unique-local, multicast and unspecified addresses are private', () => {
  const refused = [
    '0.0.0.0',
    '0.1.2.3',
    '10.1.2.3',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::127.0.0.1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    '[::1]',
    'not an address',
  ];
  for (const address of refused) assert.equal(isPrivateAddress(address), true, address);
});

test('public addresses are not private', () => {
  const open = [
    '8.8.8.8',
    '93.184.216.34',
    '100.63.255.255',
    '100.128.0.1',
    '172.15.0.1',
    '172.32.0.1',
    '169.253.0.1',
    '192.169.0.1',
    '223.255.255.255',
    '2606:4700::1111',
    '2001:db8::1',
    '::ffff:8.8.8.8',
  ];
  for (const address of open) assert.equal(isPrivateAddress(address), false, address);
});

/** A lookup that answers from a table and counts its calls. */
function lookupOf(table: Record<string, string[]>) {
  const asked: string[] = [];
  return {
    asked,
    lookup: async (host: string): Promise<string[]> => {
      asked.push(host);
      const answer = table[host];
      if (!answer) throw new Error(`no such host ${host}`);
      return answer;
    },
  };
}

const allowed = (policy: ReturnType<typeof scanPolicy>, url: string): Promise<boolean> =>
  policy(new URL(url));

test('every way to write the machine itself is refused without the flag', async () => {
  const names = lookupOf({});
  const policy = scanPolicy(names.lookup, false);
  const tricks = [
    'http://localhost',
    'http://localhost:3000/a',
    'http://LOCALHOST./',
    'http://app.localhost',
    'http://127.0.0.1',
    'http://127.1',
    'http://2130706433',
    'http://0x7f.1',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
    'http://[::ffff:7f00:1]',
    'http://0.0.0.0',
    'http://[::]',
    'http://10.0.0.5',
    'http://169.254.169.254/latest/meta-data',
    'http://[fd00::1]',
    'http://[fe80::1]',
  ];
  for (const url of tricks) assert.equal(await allowed(policy, url), false, url);
  // None of them needed a lookup: a literal and `localhost` are judged as written.
  assert.deepEqual(names.asked, []);
});

test('a name with one public and one private address is refused; a public one is not', async () => {
  const names = lookupOf({
    'mixed.example': ['93.184.216.34', '10.0.0.5'],
    'mapped.example': ['::ffff:127.0.0.1'],
    'public.example': ['93.184.216.34', '2606:4700::1111'],
    'empty.example': [],
  });
  const policy = scanPolicy(names.lookup, false);
  assert.equal(await allowed(policy, 'https://mixed.example/'), false);
  assert.equal(await allowed(policy, 'https://mapped.example/'), false);
  assert.equal(await allowed(policy, 'https://empty.example/'), false);
  assert.equal(await allowed(policy, 'https://unknown.example/'), false);
  assert.equal(await allowed(policy, 'https://public.example/a'), true);
  assert.equal(await allowed(policy, 'http://8.8.8.8/'), true);
  assert.equal(await allowed(policy, 'http://[2606:4700::1111]/'), true);
});

test('a host is looked up once per run, however many requests go to it', async () => {
  const names = lookupOf({ 'public.example': ['93.184.216.34'] });
  const policy = scanPolicy(names.lookup, false);
  await allowed(policy, 'https://public.example/a');
  await allowed(policy, 'https://public.example/b.css');
  await allowed(policy, 'http://public.example:8080/');
  assert.deepEqual(names.asked, ['public.example']);
});

test('only http and https without user info are allowed, even with the flag', async () => {
  const names = lookupOf({ 'public.example': ['93.184.216.34'] });
  for (const allowPrivate of [false, true]) {
    const policy = scanPolicy(names.lookup, allowPrivate);
    assert.equal(await allowed(policy, 'ftp://public.example/'), false);
    assert.equal(await allowed(policy, 'file:///etc/passwd'), false);
    assert.equal(await allowed(policy, 'https://user:pw@public.example/'), false);
    assert.equal(await allowed(policy, 'https://user@public.example/'), false);
    assert.equal(await allowed(policy, 'https://public.example/'), true);
  }
});

test('the flag allows private addresses and does no lookups', async () => {
  const names = lookupOf({});
  const policy = scanPolicy(names.lookup, true);
  for (const url of [
    'http://localhost:8080/',
    'http://127.1',
    'http://[::1]/',
    'http://10.0.0.5',
  ]) {
    assert.equal(await allowed(policy, url), true, url);
  }
  assert.deepEqual(names.asked, []);
});
