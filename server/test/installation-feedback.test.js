import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssembly, transitionAssembly as apply } from '../../shared/assembly.js';
import { keyedInstallationError as error } from '../../shared/installation-feedback.js';
import { createAlignmentMarker } from '../../web/src/three/alignment-marker.js';

test('CPU aiming distinguishes cover, lever and orientation without requiring a case', () => {
  let s = createAssembly();
  assert.match(error(s, 'cpu', 'socket', 180, 0), /压杆/);
  s = apply(s, { type: 'socket-lever-open' });
  assert.match(error(s, 'cpu', 'socket', 180, 0), /压盖/);
  s = apply(s, { type: 'socket-cover-open' });
  assert.match(error(s, 'cpu', 'socket', 180, 0), /角标未对齐/);
  for (const angle of [0, 360, -360, 45, -45])
    assert.equal(error(s, 'cpu', 'socket', angle, 0), '');
  assert.match(error(s, 'cpu', 'socket', 46, 0), /角标未对齐/);
  assert.equal(error(s, 'cpu', 'socket', 270, 270), '');
  assert.match(error(s, 'cpu', 'socket', 90, 270), /角标未对齐/);
  assert.equal(apply(s, { type: 'cpu-place' }).cpu, 'seated');
});

test('memory aiming distinguishes occupied slot, latch and key direction', () => {
  let s = createAssembly();
  assert.match(error(s, 'memory1', 'memory0', 180, 0), /A2.*卡扣/);
  s = apply(s, { type: 'memory-open', index: 0 });
  assert.match(error(s, 'memory1', 'memory0', 180, 0), /缺口未对齐/);
  assert.equal(error(s, 'memory1', 'memory0', 0, 0), '');
  s = apply(s, { type: 'memory-place', index: 0, partIndex: 0 });
  assert.match(error(s, 'memory1', 'memory0', 0, 0), /另一根内存占用/);
  assert.equal(error(s, 'memory0', 'memory0', 0, 0), '');
});

test('incompatible sockets and generations are never presented as fixable by rotating', () => {
  const s = createAssembly();
  const parts = {
    cpu: { specs: { socket: 'AM4' } },
    memory: { specs: { memoryType: 'DDR4' } },
    motherboard: { specs: { socket: 'AM5', memoryType: 'DDR5' } },
  };
  assert.match(error(s, 'cpu', 'socket', 0, 0, parts), /不匹配，旋转无法解决/);
  assert.match(error(s, 'memory0', 'memory0', 0, 0, parts), /不匹配，旋转无法解决/);
  assert.equal(error(s, 'gpu', 'gpu', 0, 0, parts), null);
});

test('alignment guides use the delivered pin-one corner and the offset DIMM notch', () => {
  for (const kind of ['cpu', 'memory']) {
    const marker = createAlignmentMarker(kind);
    marker.geometry.computeBoundingBox();
    const bounds = marker.geometry.boundingBox;
    if (kind === 'cpu') {
      assert.equal(bounds.min.x, -20);
      assert.equal(bounds.min.z, -20);
    } else {
      assert.equal((bounds.min.z + bounds.max.z) / 2, 7);
    }
    assert.equal(marker.material.depthWrite, false);
    marker.geometry.dispose();
    marker.material.dispose();
  }
});
