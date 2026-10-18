import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { physicsSourceHashes, runPhysicsReference } from '../scripts/physics-reference.mjs';

test('application refactors cannot change any Rust physics source or baseline numerical replay', async () => {
  const expected = JSON.parse(await readFile(new URL('./fixtures/physics-preservation.json', import.meta.url)));
  assert.deepEqual(await physicsSourceHashes(), expected.sourceHashes, 'Rust source changed: physics preservation requires explicit review');
  const actual = await runPhysicsReference(await readFile(new URL('../probe/physics-core.wasm', import.meta.url)));
  assert.deepEqual(actual.fields, expected.fields, 'The ABI must retain every existing field');
  assert.deepEqual(actual.cases, expected.cases, 'Physics diverged from the pre-refactor reference');
});
