import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteWorkspaces } from './workspace-registry.mjs';

test('同名、同项目 ID 的不同 SSH 主机保持隔离，重复记录去重', () => {
  const projects = remoteWorkspaces({ 'remote-projects': [
    { id: 'same', hostId: 'a', remotePath: '/repo', label: 'Repo' },
    { id: 'same', hostId: 'b', remotePath: '/repo', label: 'Repo' },
    { id: 'same', hostId: 'a', remotePath: '/repo', label: 'Repo' },
  ] });
  assert.equal(projects.length, 2);
  assert.notEqual(projects[0].id, projects[1].id);
  assert.equal(projects[0].connectionStatus, 'unknown');
});
test('缺失及损坏的目录记录不会伪造项目', () => {
  assert.deepEqual(remoteWorkspaces({}), []);
  assert.deepEqual(remoteWorkspaces({ 'remote-projects': [null, {}, { id: 'x', hostId: 'a' }] }), []);
});
