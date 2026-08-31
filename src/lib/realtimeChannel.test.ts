import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeChannelName } from './realtimeChannel.ts';

test('realtime channel names are unique for repeated hook mounts', () => {
  const first = createRealtimeChannelName('app-settings');
  const second = createRealtimeChannelName('app-settings');

  assert.notEqual(first, second);
  assert.match(first, /^app-settings:\d+:\d+$/);
  assert.match(second, /^app-settings:\d+:\d+$/);
});
