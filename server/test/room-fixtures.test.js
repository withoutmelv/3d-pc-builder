import { isStockAvailable } from '../../shared/stock-catalogue.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoomFixtures } from '../../web/src/three/room-fixtures.js';
import { listParts } from '../src/service/parts.js';
test('static room batching retains all stock geometry and independent selection markers within draw budget', () => {
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
    const parts = listParts();
    const fixtures = createRoomFixtures(scene, parts, { appendChild() {} });
    let meshes = 0,
      triangles = 0;
    scene.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        const position = o.geometry.attributes.position;
        for (const v of position.array) assert.ok(Number.isFinite(v));
      }
    });
    assert.ok(triangles > 0 && triangles < 20000, `${triangles} triangles including packaging`);
    assert.ok(meshes < 100, `${meshes} draws`);
    assert.equal(fixtures.stocks.length, 8);
    assert.deepEqual(
      fixtures.stocks.map((s) => s.part.id).sort(),
      parts
        .filter(isStockAvailable)
        .map((p) => p.id)
        .sort(),
    );
    fixtures.select(parts.filter((p) => p.id === 'cpu-a5'));
    assert.deepEqual(
      fixtures.stocks.filter((s) => s.marker.visible).map((s) => s.part.id),
      ['cpu-a5'],
    );
    fixtures.select([]);
    assert.ok(fixtures.stocks.every((s) => !s.marker.visible));
    fixtures.dispose();
  } finally {
    const geometries = new Set(),
      materials = new Set();
    scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    globalThis.document = previous;
  }
});
