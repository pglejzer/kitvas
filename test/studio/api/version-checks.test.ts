import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickShot } from '../../../src/studio/api/version-checks.ts';

const shot = (state: string, width: number) => ({
  state,
  width,
  file: `build/shots/${state}-${width}.png`,
});
const all = () => true;

test('the thumbnail is the filled state at 1280, else any shot at 1280', () => {
  const shots = [shot('loading', 1280), shot('filled', 390), shot('filled', 1280)];
  assert.equal(pickShot(shots, all), 'shots/filled-1280.png');
  assert.equal(pickShot([shot('empty', 1280), shot('filled', 390)], all), 'shots/empty-1280.png');
});

test('a version with no shot at 1280, or none at all, has no thumbnail', () => {
  assert.equal(pickShot([], all), null);
  assert.equal(pickShot([shot('filled', 390)], all), null);
});

test('a shot the file lists but the disk lacks is not offered', () => {
  const shots = [shot('filled', 1280), shot('empty', 1280)];
  const onDisk = (path: string) => path === 'build/shots/empty-1280.png';
  assert.equal(pickShot(shots, onDisk), 'shots/empty-1280.png');
  assert.equal(
    pickShot(shots, () => false),
    null,
  );
});

test('a path outside build/shots is never offered', () => {
  const odd = { state: 'filled', width: 1280, file: 'build/shots/../../secret.png' };
  assert.equal(pickShot([odd], all), null);
  assert.equal(pickShot([{ ...odd, file: 'other/filled-1280.png' }], all), null);
});
