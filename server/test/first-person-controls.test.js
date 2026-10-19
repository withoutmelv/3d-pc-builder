import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFirstPersonControls } from '../../web/src/three/first-person-controls.js';

function controlsHarness(lockRequest) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = new EventTarget();
  const window = new EventTarget();
  const canvas = new EventTarget();
  canvas.style = {};
  document.activeElement = null;
  document.pointerLockElement = null;
  document.hidden = false;
  canvas.focus = () => (document.activeElement = canvas);
  canvas.blur = () => {
    if (document.activeElement !== canvas) return;
    document.activeElement = null;
    canvas.dispatchEvent(new Event('blur'));
  };
  document.exitPointerLock = () => {
    document.pointerLockElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  const lock = () => {
    document.pointerLockElement = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  canvas.requestPointerLock = lockRequest ? () => lockRequest(lock) : lock;
  globalThis.document = document;
  globalThis.window = window;
  const events = [];
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 640, 990);
  const controls = createFirstPersonControls(camera, canvas, {
    onLook: (status) => events.push(['look', status]),
    onInteract: () => events.push(['interact']),
    onUseEnd: () => events.push(['use-end']),
  });
  const dispatch = (target, type, properties = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(properties))
      Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
    return event;
  };
  return {
    canvas,
    camera,
    controls,
    document,
    window,
    events,
    mouse: (type, properties) =>
      dispatch(type === 'mousedown' ? canvas : document, type, { target: canvas, ...properties }),
    key: (type, key, properties = {}) =>
      dispatch(window, type, { key, repeat: false, ...properties }),
    close() {
      controls.dispose();
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

test('the first canvas click enters look mode; later left presses interact once in both modes', async () => {
  for (const lockRequest of [undefined, () => Promise.reject(new Error('unsupported'))]) {
    const h = controlsHarness(lockRequest);
    try {
      h.mouse('mousedown', { button: 0, clientX: 20, clientY: 20 });
      await Promise.resolve();
      assert.equal(h.controls.active, true);
      assert.equal(h.canvas.style.cursor, 'none');
      h.mouse('mousedown', { button: 0, clientX: 20, clientY: 20 });
      assert.equal(h.events.filter(([type]) => type === 'interact').length, 0);
      h.mouse('mouseup', { button: 0 });
      h.events.length = 0;
      h.mouse('mousedown', { button: 0, clientX: 20, clientY: 20 });
      h.mouse('mousedown', { button: 0, clientX: 20, clientY: 20 });
      h.controls.update(1);
      assert.deepEqual(h.events, [['interact']]);
      h.mouse('mouseup', { button: 0 });
      assert.deepEqual(h.events, [['interact'], ['use-end']]);
      h.mouse('mousedown', { button: 0, clientX: 20, clientY: 20 });
      assert.equal(h.events.filter(([type]) => type === 'interact').length, 2);
      h.key('keydown', 'Escape');
      assert.equal(h.controls.active, false);
      assert.equal(h.canvas.style.cursor, 'default');
      assert.equal(h.events.filter(([type]) => type === 'interact').length, 2);
    } finally {
      h.close();
    }
  }
});

test('releasing, leaving look mode, losing focus or hiding the page cancels a held action', () => {
  for (const cancel of [
    (h) => h.mouse('mouseup', { button: 0 }),
    (h) => h.key('keydown', 'Escape'),
    (h) => h.window.dispatchEvent(new Event('blur')),
    (h) => h.canvas.blur(),
    (h) => {
      h.document.hidden = true;
      h.document.dispatchEvent(new Event('visibilitychange'));
    },
  ]) {
    const h = controlsHarness();
    try {
      h.controls.enterLook();
      h.events.length = 0;
      h.mouse('mousedown', { button: 0, clientX: 20, clientY: 20 });
      assert.deepEqual(h.events, [['interact']]);
      cancel(h);
      assert.ok(h.events.some(([type]) => type === 'use-end'));
      assert.equal(h.events.filter(([type]) => type === 'interact').length, 1);
    } finally {
      h.close();
    }
  }
});

test('leaving the compatibility canvas cancels a held action until a fresh press', async () => {
  const h = controlsHarness(() => Promise.reject(new Error('unsupported')));
  try {
    h.controls.enterLook();
    await Promise.resolve();
    h.events.length = 0;
    h.mouse('mousedown', { button: 0, clientX: 20, clientY: 20 });
    h.canvas.dispatchEvent(new Event('mouseleave'));
    assert.deepEqual(h.events, [['interact'], ['use-end']]);
    h.mouse('mousemove', { clientX: 60, clientY: 40 });
    assert.equal(h.events.filter(([type]) => type === 'interact').length, 1);
    h.mouse('mouseup', { button: 0 });
    h.mouse('mousedown', { button: 0, clientX: 60, clientY: 40 });
    assert.equal(h.events.filter(([type]) => type === 'interact').length, 2);
    h.mouse('mousemove', { clientX: 900, clientY: 60, target: h.document });
    assert.equal(h.events.at(-1)[0], 'use-end');
  } finally {
    h.close();
  }
});

test('right or middle clicks, UI clicks and the former F key never trigger an action', () => {
  const h = controlsHarness();
  try {
    h.controls.enterLook();
    h.events.length = 0;
    for (const button of [1, 2]) {
      h.mouse('mousedown', { button, clientX: 20, clientY: 20 });
      h.mouse('mouseup', { button });
    }
    h.mouse('mousedown', { button: 0, target: h.document });
    h.mouse('mousedown', { button: 0, ctrlKey: true });
    for (const key of ['f', 'F', 'r']) {
      assert.equal(h.key('keydown', key).defaultPrevented, false);
      h.key('keyup', key);
    }
    assert.deepEqual(h.events, []);
  } finally {
    h.close();
  }
});

test('leaving look mode stops keyboard movement', () => {
  const h = controlsHarness();
  try {
    h.controls.enterLook();
    const before = h.camera.position.clone();
    h.key('keydown', 'w');
    h.controls.update(0.1);
    assert.ok(h.camera.position.distanceTo(before) > 20);
    h.key('keydown', 'Escape');
    const stopped = h.camera.position.clone();
    h.controls.update(1);
    assert.deepEqual(h.camera.position, stopped);
  } finally {
    h.close();
  }
});

test('FPS keys do not consume text editing or browser modifier shortcuts', () => {
  const h = controlsHarness();
  try {
    h.controls.enterLook();
    h.events.length = 0;
    const before = h.camera.position.clone();
    const input = { closest: () => input };
    for (const properties of [
      { target: input },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
    ]) {
      for (const key of ['f', 'e', 'w', ' ']) {
        const event = h.key('keydown', key, properties);
        assert.equal(event.defaultPrevented, false);
      }
    }
    h.controls.update(1);
    assert.deepEqual(h.events, []);
    assert.deepEqual(h.camera.position, before);
  } finally {
    h.close();
  }
});

test('pointer lock success and the focused compatibility mode both enable mouse look', async () => {
  const h = controlsHarness();
  try {
    h.controls.enterLook();
    h.mouse('mousemove', { movementX: 40, movementY: 20, clientX: 0, clientY: 0 });
    assert.ok(h.camera.rotation.y < 0);
    assert.ok(h.camera.rotation.x < 0);
    assert.deepEqual(h.events.at(-1), ['look', { active: true, locked: true, fallback: false }]);
  } finally {
    h.close();
  }
  const fallback = controlsHarness(() => Promise.reject(new Error('unsupported')));
  try {
    fallback.controls.enterLook();
    await Promise.resolve();
    assert.equal(fallback.controls.active, true);
    assert.deepEqual(fallback.events.at(-1), [
      'look',
      { active: true, locked: false, fallback: true },
    ]);
    fallback.mouse('mousemove', { clientX: 20, clientY: 20 });
    fallback.mouse('mousemove', { clientX: 60, clientY: 40 });
    assert.ok(fallback.camera.rotation.y < 0);
    const yaw = fallback.camera.rotation.y;
    fallback.mouse('mousemove', { clientX: 900, clientY: 60, target: fallback.document });
    assert.equal(fallback.camera.rotation.y, yaw);
    fallback.mouse('mousedown', { button: 0, clientX: 60, clientY: 40 });
    assert.equal(fallback.events.at(-1)[0], 'interact');
    fallback.key('keydown', 'Escape');
    fallback.mouse('mousemove', { clientX: 90, clientY: 60 });
    fallback.mouse('mousemove', { clientX: 140, clientY: 90 });
    assert.equal(fallback.camera.rotation.y, yaw);
  } finally {
    fallback.close();
  }
});

test('a delayed rejected pointer lock request cannot reactivate fallback after Esc', async () => {
  let rejectRequest;
  const h = controlsHarness(() => new Promise((_, reject) => (rejectRequest = reject)));
  try {
    h.controls.enterLook();
    h.key('keydown', 'Escape');
    rejectRequest(new Error('cancelled'));
    await Promise.resolve();
    assert.equal(h.controls.active, false);
    assert.deepEqual(
      h.events.findLast(([type]) => type === 'look'),
      ['look', { active: false, locked: false, fallback: false }],
    );
  } finally {
    h.close();
  }
});

test('large mouse movements keep the view upright while allowing unrestricted horizontal turns', () => {
  const h = controlsHarness();
  try {
    h.controls.enterLook();
    h.mouse('mousemove', { movementX: 10000, movementY: 10000, clientX: 0, clientY: 0 });
    assert.equal(h.camera.rotation.x, -1.25);
    assert.equal(h.camera.rotation.z, 0);
    assert.ok(h.camera.rotation.y < -Math.PI * 2);
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(h.camera.quaternion).y > 0);
    h.mouse('mousemove', { movementX: -20000, movementY: -20000, clientX: 0, clientY: 0 });
    assert.equal(h.camera.rotation.x, 1.05);
    assert.equal(h.camera.rotation.z, 0);
    assert.ok(h.camera.rotation.y > Math.PI * 2);
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(h.camera.quaternion).y > 0);
    h.mouse('mousemove', { movementX: 0, movementY: 100, clientX: 0, clientY: 0 });
    assert.ok(h.camera.rotation.x < 1.05 && h.camera.rotation.x > -1.25);
    assert.equal(h.camera.rotation.z, 0);
  } finally {
    h.close();
  }
});

test('Q/E move vertically, Shift accelerates, and aliases do not multiply speed', () => {
  const h = controlsHarness();
  try {
    h.controls.enterLook();
    h.key('keydown', 'e');
    const start = h.camera.position.clone();
    h.controls.update(0.1);
    assert.equal(h.camera.position.y - start.y, 100);
    assert.equal(h.camera.position.x, start.x);
    assert.equal(h.camera.position.z, start.z);
    h.key('keydown', ' ');
    const aliasStart = h.camera.position.y;
    h.controls.update(0.1);
    assert.equal(h.camera.position.y - aliasStart, 100);
    h.key('keyup', 'e');
    h.key('keyup', ' ');
    h.key('keydown', 'q');
    h.key('keydown', 'Shift');
    const downStart = h.camera.position.y;
    h.controls.update(0.1);
    assert.equal(h.camera.position.y - downStart, -240);
    h.key('keyup', 'q');
    h.key('keyup', 'Shift');
    h.key('keydown', 'w');
    h.key('keydown', 'd');
    const diagonalStart = h.camera.position.clone();
    h.controls.update(0.1);
    assert.ok(Math.abs(h.camera.position.distanceTo(diagonalStart) - 100) < 0.001);
    h.key('keydown', 'Escape');
    const stopped = h.camera.position.clone();
    h.controls.update(0.1);
    assert.deepEqual(h.camera.position, stopped);
  } finally {
    h.close();
  }
});
