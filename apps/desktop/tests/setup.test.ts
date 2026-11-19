import test from 'node:test';
import assert from 'node:assert/strict';
import { listedPlugin, inList } from '../src/model.ts';
import { sw } from '../src/ui.ts';
import type { Snapshot, Target, InstalledPlugin, Plugin } from '../src/types.ts';

const target: Target = { id: 't1', harness: 'claude-code', name: 'Claude Code', root: 'D:/config/claude-code', executable: 'claude', exclusive: false, enabled: true };
const installed: InstalledPlugin = { id: 'native-commit-helper', name: 'commit-helper', version: '2.1.0', path: 'D:/plugins/commit-helper', managed: false };
const snapshot = (plugins: Plugin[] = []): Snapshot => ({ registry: { schema: 1, revision: 3, plugins, targets: [target], settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '' } }, inventory: [], activity: [], sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, targets: {} } });

test('an installed plugin becomes a list entry kept at the version it has, built from its own folder', () => {
  const plugin = listedPlugin(installed, target);
  assert.match(plugin.id, /^[0-9a-f-]{36}$/, 'a new id the service accepts (letters, digits, dashes)');
  assert.deepEqual({ ...plugin, id: '' }, { id: '', name: 'commit-helper', source: 'D:/plugins/commit-helper', policy: 'pinned', pinned_version: '2.1.0', targets: ['t1'], distributions: [{ harness: 'claude-code', path: 'D:/plugins/commit-helper', version: '2.1.0' }] });
  assert.notEqual(listedPlugin(installed, target).id, plugin.id, 'every entry has an id of its own');
});

test('an installed plugin that reports no version cannot be pinned, so it follows the stable policy', () => {
  const plugin = listedPlugin({ ...installed, version: '' }, target);
  assert.equal(plugin.policy, 'stable');
  assert.equal(plugin.pinned_version, '');
});

test('the list already holds a plugin Muro installed or one with a build in the folder it is installed in', () => {
  assert.equal(inList(snapshot(), target, installed), false, 'an empty list holds nothing');
  assert.equal(inList(snapshot(), target, { ...installed, managed: true }), true, 'Muro put it there');
  assert.equal(inList(snapshot([listedPlugin(installed, target)]), target, installed), true, 'an entry built from this folder');
  assert.equal(inList(snapshot([listedPlugin({ ...installed, path: 'D:/plugins/other' }, target)]), target, installed), false, 'another folder is another plugin');
  assert.equal(inList(snapshot([{ ...listedPlugin(installed, target), targets: ['t2'] }]), target, installed), false, 'an entry for another harness does not count');
  assert.equal(inList(snapshot([listedPlugin({ ...installed, path: '' }, target)]), target, { ...installed, path: '' }), false, 'no folder never matches by its emptiness');
});

test('a switch can be disabled', () => {
  assert.doesNotMatch(sw(true, 'Automatic sync', 'x'), /disabled/);
  assert.match(sw(false, 'Start Muro when Windows starts', 'x', '', true), /role="switch" aria-checked="false" aria-label="Start Muro when Windows starts" data-action="x" data-id="" disabled>/);
});
