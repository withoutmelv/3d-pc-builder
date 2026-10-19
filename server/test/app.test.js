import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { evaluateParts } from '../src/service/compatibility.js';
const complete = {
  case: 'case-air',
  motherboard: 'board-a5',
  cpu: 'cpu-a5',
  cooler: 'cooler-air',
  memory: 'ram-d5',
  gpu: 'gpu-dual',
  storage: 'ssd-1',
  psu: 'psu-750',
};
const call = async (app, method, url, payload) => {
  const response = await app.inject({ method, url, payload });
  return { status: response.statusCode, ...response.json() };
};
async function withApp(fn) {
  const app = createApp({ dbPath: ':memory:' });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
test('complete build passes five checks and reports unrecorded prices', () =>
  withApp(async (app) => {
    const result = await call(app, 'POST', '/api/builds/check', { selection: complete });
    assert.equal(result.status, 200);
    assert.equal(result.data.conflicts, 0);
    assert.equal(result.data.unchecked, 0);
    assert.equal(result.data.count, 8);
    assert.equal(result.data.total, null);
    assert.equal(result.data.checks.length, 5);
  }));
test('socket, memory and board size conflicts are detected independently', () =>
  withApp(async (app) => {
    for (const [category, id, code] of [
      ['cpu', 'cpu-a4', 'CPU_SOCKET'],
      ['memory', 'ram-d4', 'MEMORY_TYPE'],
      ['motherboard', 'board-large', 'BOARD_SIZE'],
    ]) {
      const r = await call(app, 'POST', '/api/builds/check', {
        selection: { ...complete, [category]: id },
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.checks.find((c) => c.code === code).status, 'conflict');
    }
  }));
test('incomplete or missing specifications never pass silently', () =>
  withApp(async (app) => {
    const empty = await call(app, 'POST', '/api/builds/check', { selection: {} });
    assert.equal(empty.data.unchecked, 5);
    assert.equal(empty.data.total, 0);
    assert.equal(empty.data.missing.length, 8);
    const missing = evaluateParts({
      cpu: { price: 1, specs: {} },
      motherboard: { price: 1, specs: { socket: 'AM5' } },
    });
    assert.equal(missing.checks[0].status, 'unchecked');
  }));
test('invalid inputs and unknown IDs use consistent error codes', () =>
  withApp(async (app) => {
    for (const payload of [
      { selection: { gpu: 'missing' } },
      { selection: { gpu: 'cpu-a5' } },
      { selection: { invalid: 'gpu-dual' } },
      { name: 'wrong' },
    ]) {
      const r = await call(app, 'POST', '/api/builds/check', payload);
      assert.ok([400, 404].includes(r.status));
      assert.equal(r.data, null);
    }
    for (const name of ['', '   ', 'a'.repeat(81)]) {
      const r = await call(app, 'POST', '/api/builds', { name, selection: {} });
      assert.equal(r.code, 'VALIDATION_ERROR');
    }
    const missing = await call(app, 'GET', '/api/builds/no-such-build');
    assert.equal(missing.code, 'BUILD_NOT_FOUND');
    const route = await call(app, 'GET', '/api/unknown');
    assert.equal(route.code, 'ROUTE_NOT_FOUND');
  }));
test('catalogue filters categories and keywords', () =>
  withApp(async (app) => {
    const r = await call(app, 'GET', '/api/parts?category=gpu&q=TRIPLE');
    assert.equal(r.data.length, 1);
    assert.equal(r.data[0].id, 'gpu-triple');
    const invalid = await call(app, 'GET', '/api/parts?category=invalid');
    assert.equal(invalid.status, 400);
  }));
test('create, update, reopen and delete a conflicting draft', () =>
  withApp(async (app) => {
    const payload = { name: '  测试装机  ', selection: { ...complete, gpu: 'gpu-xl' } };
    const created = await call(app, 'POST', '/api/builds', payload);
    assert.equal(created.status, 201);
    assert.equal(created.data.name, '测试装机');
    const id = created.data.id;
    const updated = await call(app, 'PUT', `/api/builds/${id}`, {
      name: '空白草稿',
      selection: {},
    });
    assert.deepEqual(updated.data.selection, {});
    const reopened = await call(app, 'GET', `/api/builds/${id}`);
    assert.equal(reopened.data.name, '空白草稿');
    assert.equal((await call(app, 'GET', '/api/builds')).data.length, 1);
    assert.equal((await call(app, 'DELETE', `/api/builds/${id}`)).status, 200);
    assert.equal((await call(app, 'GET', `/api/builds/${id}`)).status, 404);
  }));
test('SQLite configuration survives application restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-builder-test-')),
    dbPath = join(dir, 'builds.sqlite');
  let app = createApp({ dbPath });
  try {
    const result = await call(app, 'POST', '/api/builds', {
      name: '持久化配置',
      selection: complete,
    });
    await app.close();
    app = createApp({ dbPath });
    const restored = await call(app, 'GET', `/api/builds/${result.data.id}`);
    assert.deepEqual(restored.data.selection, complete);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('malformed JSON remains a client error', () =>
  withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      headers: { 'content-type': 'application/json' },
      payload: '{invalid',
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'VALIDATION_ERROR');
  }));

test('production static plugin starts with a single 404 handler', async () => {
  const app = createApp({ dbPath: ':memory:', serveWeb: true });
  try {
    await app.ready();
    const response = await call(app, 'GET', '/api/unknown');
    assert.equal(response.status, 404);
    assert.equal(response.code, 'ROUTE_NOT_FOUND');
  } finally {
    await app.close();
  }
});
