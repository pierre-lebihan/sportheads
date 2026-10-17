import test from 'node:test';
import assert from 'node:assert/strict';
import { PREPARATION_STEPS, validSetupStep } from '../web/setup-ui.js';
test('only ordered preparation screens can cross the host snapshot boundary', () => {
  assert.deepEqual(PREPARATION_STEPS, ['players', 'pitch', 'rules']);
  for (const step of PREPARATION_STEPS) assert.equal(validSetupStep(step), true);
  for (const step of ['home', 'room', '', 1, null, {}, ['rules'], 'start']) assert.equal(validSetupStep(step), false);
});
