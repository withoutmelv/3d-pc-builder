import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createModelFixture,
  modelStats,
  disposeModelFixture,
} from '../../scripts/workbench-model-stats.js';

// Geometry baseline after removing the decorative text planes.
const baseline = {
  cooler: [660, 0, [-55, 0, -40.5], [55, 97, 40.5]],
  pasteTube: [136, 0, [-11.5, -12, -7], [11.5, 75, 7]],
  workshop: [1584, 0, [-922, -460, -560], [922, 18.5, 569]],
  board: [4065, 0, [-122, -6.5, -152.5], [122, 37, 152.5]],
  cpu: [25, 0, [-21.5, 0, -21.5], [21.5, 7.3, 21.5]],
  memory0: [696, 0, [-4.6, -1.5, -66], [4.6, 37.5, 66]],
  memory1: [696, 0, [-4.6, -1.5, -66], [4.6, 37.5, 66]],
  case: [1188, 0, [-178.5, -4.5, -237.5], [178, 173, 238.5]],
  panel: [316, 0, [-178, -4, -237], [178, 6, 237]],
  driver: [468, 0, [-11.5, -37, -11.5], [11.5, 97, 11.5]],
  screws: [2688, 0, [-6, -4.5, -6], [6, 7.9, 6]],
};

test('model batching preserves geometry bounds, triangle detail and a text-free workbench with fewer draw submissions', () => {
  const { scene, models } = createModelFixture();
  try {
    for (const [name, model] of Object.entries(models)) {
      const stats = modelStats(model);
      const [triangles, labels, min, max] = baseline[name];
      assert.equal(stats.triangles, triangles, `${name} triangle detail`);
      assert.equal(stats.labelTextures, labels, `${name} labels`);
      assert.deepEqual(stats.bounds, [min, max], `${name} dimensions`);
    }
    const total = modelStats(scene);
    assert.ok(total.meshes <= 160, `${total.meshes} meshes; unbatched baseline was 564`);
    assert.ok(total.shadowCasters <= 140, `${total.shadowCasters} casters; baseline was 544`);
  } finally {
    disposeModelFixture(scene);
  }
});

test('board hinges remain independent and screwdriver emissive changes cannot alter other parts', () => {
  const { scene, board, models } = createModelFixture();
  try {
    const movingGroups = [board.cover, board.lever, board.gpuLatch, ...board.latches.flat()];
    assert.equal(new Set(movingGroups).size, 7);
    for (const group of movingGroups) {
      assert.equal(group.parent, board.group);
      assert.ok(group.children.some((child) => child.isMesh));
    }
    const before = board.cover.localToWorld(new THREE.Vector3(0, 0, 27));
    const latchBefore = board.latches[0][0].localToWorld(new THREE.Vector3());
    board.cover.rotation.x = -1.9;
    const after = board.cover.localToWorld(new THREE.Vector3(0, 0, 27));
    assert.ok(before.distanceTo(after) > 30);
    assert.deepEqual(board.latches[0][0].localToWorld(new THREE.Vector3()), latchBefore);
    models.driver.traverse((object) => object.material?.emissive?.set('#406e45'));
    for (const model of Object.values(models)) {
      if (model === models.driver) continue;
      model.traverse((object) => {
        if (object.material?.emissive) assert.equal(object.material.emissive.getHex(), 0);
      });
    }
    const glass = models.panel.children.find((child) => child.material?.transparent);
    assert.ok(glass);
    assert.equal(glass.material.opacity, 0.24);
    assert.equal(glass.material.depthWrite, false);
  } finally {
    disposeModelFixture(scene);
  }
});
