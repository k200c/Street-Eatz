import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewerBuildLive, shouldReloadNow } from './appVersion.ts';

test('a different live version means the screen is stale', async () => {
  assert.equal(await isNewerBuildLive({ runningVersion: '202610161400', fetchVersion: async () => '202610191500' }), true);
});

test('the same version does not reload', async () => {
  assert.equal(await isNewerBuildLive({ runningVersion: '202610191500', fetchVersion: async () => '202610191500' }), false);
});

test('a network error or empty answer never reloads', async () => {
  assert.equal(await isNewerBuildLive({ runningVersion: 'a', fetchVersion: async () => { throw new Error('offline'); } }), false);
  assert.equal(await isNewerBuildLive({ runningVersion: 'a', fetchVersion: async () => null }), false);
  assert.equal(await isNewerBuildLive({ runningVersion: 'a', fetchVersion: async () => '' }), false);
});

test('development builds never reload', async () => {
  assert.equal(await isNewerBuildLive({ runningVersion: 'dev', fetchVersion: async () => 'x' }), false);
});

test('a checkout in progress is never interrupted', () => {
  assert.equal(shouldReloadNow({ checkoutInProgress: true }), false);
  assert.equal(shouldReloadNow({ checkoutInProgress: false }), true);
});
