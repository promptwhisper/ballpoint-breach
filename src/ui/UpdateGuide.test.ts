import assert from 'node:assert/strict';
import test from 'node:test';
import { UPDATE_GUIDE_KEY } from './UpdateGuide';

test('ink update guide uses a versioned persistence key', () => {
  assert.match(UPDATE_GUIDE_KEY, /^ballpoint-ink-update-guide-.+-v\d+$/);
});
