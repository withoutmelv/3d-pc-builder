import { isStockAvailable } from '../../shared/stock-catalogue.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  modelUrls,
  registerDetailedModel,
  createDetailedStock,
  createDetailedBoard,
  createDetailedCPU,
  createDetailedMemory,
  createDetailedCooler,
  createDetailedFan,
  createDetailedCase,
  createDetailedPanel,
} from '../../web/src/three/detailed-models.js';

for (const [category, url] of Object.entries(modelUrls)) {
  const bytes = fs.readFileSync(new URL(url));
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  registerDetailedModel(category, gltf.scene);
}
const bounds = (model) => new THREE.Box3().setFromObject(model);
const near = (actual, expected, tolerance = 0.2) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);

test('all eight delivered GLBs produce bounded, batched models with independent instance resources', () => {
  for (const category of Object.keys(modelUrls)) {
    const a = createDetailedStock({ category }),
      b = createDetailedStock({ category });
    assert.ok(a && b, category);
    let count = 0;
    a.traverse((o) => {
      if (o.isMesh) {
        count++;
        assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));
      }
    });
    assert.ok(count <= 32, `${category}: ${count} draws`);
    const size = bounds(a).getSize(new THREE.Vector3());
    assert.ok(size.length() < 1000 && size.length() > 10, `${category}: millimetre units`);
    const first = (root) => {
      let mesh;
      root.traverse((o) => {
        if (o.isMesh) mesh ??= o;
      });
      return mesh;
    };
    assert.notEqual(first(a).geometry, first(b).geometry);
    assert.notEqual(first(a).material, first(b).material);
  }
});

test('CPU sits on its contacts; the standing DIMM retains a true notch aligned with the socket key', () => {
  const cpu = bounds(createDetailedCPU());
  near(cpu.min.y, 0);
  near(cpu.max.y + 4.6, 8.51);
  const memory = createDetailedMemory();
  memory.updateMatrixWorld(true);
  const hits = (z) =>
    new THREE.Raycaster(new THREE.Vector3(30, 2, z), new THREE.Vector3(-1, 0, 0)).intersectObject(
      memory,
      true,
    );
  assert.equal(hits(7).length, 0, 'socket key goes through the DIMM notch');
  assert.ok(hits(3.45).length > 0, 'solid PCB beside the notch');
  near(bounds(memory).min.y, 0);
  near(bounds(memory).max.y, 44);
});

test('socket cover, lever and A2/B2 clips remain movable after material batching', () => {
  const board = createDetailedBoard();
  const before = bounds(board.cover).getCenter(new THREE.Vector3());
  board.cover.rotation.x = -1.9;
  assert.ok(bounds(board.cover).getCenter(new THREE.Vector3()).distanceTo(before) > 20);
  near(board.lever.position.x, 38);
  assert.deepEqual(
    board.latches.map((pair) => Math.round(pair[0].position.x)),
    [75, 95],
  );
  for (const child of [board.cover, board.lever, board.gpuLatch, ...board.latches.flat()])
    assert.equal(child.parent, board.group);
});

test('raised front fan clears DDR5 while cooler and GPU stay inside the open case envelope', () => {
  const cpuTop = 8.51,
    boardY = 43;
  const fan = createDetailedFan(0);
  fan.position.set(75, cpuTop + 53, -62);
  const ram = createDetailedMemory();
  ram.position.set(75, 7, -62);
  assert.ok(bounds(fan).min.y > bounds(ram).max.y + 1);
  assert.ok(bounds(fan).max.y + boardY < 232, 'front fan below closed glass');
  const cooler = createDetailedCooler(false);
  cooler.position.y = cpuTop + boardY;
  assert.ok(bounds(cooler).max.y < 232);
  const gpu = createDetailedStock({ category: 'gpu' });
  gpu.rotation.x = Math.PI / 2;
  gpu.position.set(48 - 104, 6 + 77 + boardY, 23.5 - 63);
  const gb = bounds(gpu),
    cb = bounds(createDetailedCase({ standoffs: false, slotCovers: false }));
  assert.ok(gb.min.x >= cb.min.x - 1, 'I/O bracket meets the rear, not outside the frame');
  assert.ok(gb.max.y < 232 && gb.max.x < cb.max.x);
  const panel = bounds(createDetailedPanel());
  assert.ok(panel.getSize(new THREE.Vector3()).y < 5, 'detached panel lies flat');
  assert.ok(createDetailedFan(1).userData.clips.children.length === 2, 'independent wire clips');
});

test('catalogue SKUs have distinct geometry, not just different colours', async () => {
  const { listParts } = await import('../src/service/parts.js');
  const { createHash } = await import('node:crypto');
  const parts = listParts();
  for (const category of Object.keys(modelUrls)) {
    const signatures = new Set();
    for (const part of parts.filter((p) => p.category === category)) {
      const model = createDetailedStock(part);
      const hash = createHash('sha256');
      model.updateMatrixWorld(true);
      let draws = 0;
      model.traverse((o) => {
        if (!o.isMesh) return;
        draws++;
        hash.update(Buffer.from(o.geometry.attributes.position.array.buffer));
        hash.update(JSON.stringify(o.matrixWorld.elements));
      });
      const signature = hash.digest('hex');
      assert.ok(!signatures.has(signature), `${part.id} must have its own shape`);
      signatures.add(signature);
      assert.ok(draws <= 35, `${part.id}: ${draws} draw calls`);
      if (category === 'gpu' && !isStockAvailable(part)) assert.equal(model.userData.fanCount, 3);
      model.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
  }
});

test('packaged shelves batch actual loaded SKU models without losing geometry', async () => {
  const { listParts } = await import('../src/service/parts.js');
  const { createRoomFixtures } = await import('../../web/src/three/room-fixtures.js');
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      style: {},
      remove() {},
      getContext: () => ({
        scale() {},
        beginPath() {},
        lineTo() {},
        moveTo() {},
        stroke() {},
        closePath() {},
        fill() {},
        arc() {},
        drawImage() {},
        fillRect() {},
        fillText() {},
        strokeRect() {},
        measureText: (text) => ({ width: text.length * 24 }),
      }),
    }),
  };
  const scene = new THREE.Scene();
  try {
    const fixtures = createRoomFixtures(scene, listParts(), { appendChild() {} });
    let draws = 0;
    scene.traverse((o) => {
      if (o.isMesh) {
        draws++;
        assert.ok(o.geometry?.attributes.position.count > 0);
        assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));
      }
    });
    assert.ok(draws < 170, `${draws} shelf draws`);
    assert.equal(fixtures.stocks.length, listParts().filter(isStockAvailable).length);
    fixtures.dispose();
  } finally {
    scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.map?.dispose();
      o.material?.dispose();
    });
    globalThis.document = previous;
  }
});
