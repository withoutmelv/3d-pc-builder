import * as THREE from 'three';

export function createFirstPersonControls(camera, canvas, callbacks) {
  const keys = new Set();
  const direction = new THREE.Vector3();
  let locked = false;
  let fallback = false;
  let leftDown = false;
  let pending = false;
  let disposed = false;
  let requestId = 0;
  let lastPointer = null;
  camera.rotation.order = 'YXZ';
  canvas.tabIndex = 0;
  const notify = () => {
    canvas.style.cursor = locked || fallback ? 'none' : 'default';
    callbacks.onLook?.({ active: locked || fallback, locked, fallback });
  };
  const focused = () => locked || document.activeElement === canvas;
  const editable = (event) =>
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
  function resetInput() {
    keys.clear();
    lastPointer = null;
    endUse();
  }
  function endUse() {
    leftDown = false;
    callbacks.onUseEnd?.();
  }
  function failLock() {
    if (disposed || locked || !pending) return;
    pending = false;
    fallback = true;
    notify();
  }
  function enterLook() {
    if (disposed || locked || pending) return;
    canvas.focus({ preventScroll: true });
    pending = true;
    const attempt = ++requestId;
    if (!canvas.requestPointerLock) {
      failLock();
      return;
    }
    try {
      const request = canvas.requestPointerLock();
      request?.catch?.(() => {
        if (attempt === requestId) failLock();
      });
    } catch {
      failLock();
    }
  }
  function exitLook() {
    resetInput();
    pending = false;
    requestId++;
    fallback = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    else {
      locked = false;
      notify();
    }
    canvas.blur();
  }
  function lockChange() {
    if (disposed) return;
    if (document.pointerLockElement === canvas && !pending && !locked) {
      document.exitPointerLock();
      return;
    }
    locked = document.pointerLockElement === canvas;
    pending = false;
    fallback = false;
    const pressed = leftDown;
    resetInput();
    if (locked) leftDown = pressed;
    notify();
  }
  function down(event) {
    if (event.button !== 0 || event.target !== canvas || editable(event) || leftDown) return;
    leftDown = true;
    canvas.focus({ preventScroll: true });
    lastPointer = { x: event.clientX, y: event.clientY };
    if (!locked && !fallback) {
      enterLook();
      return;
    }
    callbacks.onInteract?.();
  }
  function move(event) {
    if (!locked && !(fallback && event.target === canvas && focused())) {
      if (fallback && event.target !== canvas) leave();
      return;
    }
    const dx = locked ? event.movementX : lastPointer ? event.clientX - lastPointer.x : 0;
    const dy = locked ? event.movementY : lastPointer ? event.clientY - lastPointer.y : 0;
    lastPointer = { x: event.clientX, y: event.clientY };
    camera.rotation.y -= dx * 0.0016;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.0016, -1.25, 1.05);
    camera.rotation.z = 0;
    callbacks.onChange?.();
  }
  function up(event) {
    if (event.button === 0) endUse();
  }
  function leave() {
    if (locked) return;
    lastPointer = null;
    if (leftDown) endUse();
  }
  const keyDirections = {
    w: 'forward',
    a: 'left',
    s: 'back',
    d: 'right',
    ArrowUp: 'forward',
    ArrowLeft: 'left',
    ArrowDown: 'back',
    ArrowRight: 'right',
    ' ': 'up',
    c: 'down',
    e: 'up',
    q: 'down',
  };
  function cameraStep(name, distance = 75) {
    const yaw = camera.rotation.y;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    direction.set(0, 0, 0);
    if (name === 'forward') direction.copy(forward);
    if (name === 'back') direction.copy(forward).negate();
    if (name === 'left') direction.copy(right).negate();
    if (name === 'right') direction.copy(right);
    if (name === 'up') direction.y = 1;
    if (name === 'down') direction.y = -1;
    camera.position.addScaledVector(direction, distance);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -5100, 5100);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -5100, 5100);
    const overDesk = Math.abs(camera.position.x) < 1000 && Math.abs(camera.position.z) < 640;
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, overDesk ? 120 : -300, 2300);
    callbacks.onChange?.();
  }
  function keyDown(event) {
    if (!focused() || editable(event)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'Escape') {
      exitLook();
      return;
    }
    if (key !== 'Shift' && !keyDirections[key]) return;
    event.preventDefault();
    if (keys.has(key) || event.repeat) return;
    keys.add(key);
    if (keyDirections[key]) cameraStep(keyDirections[key], 20);
  }
  function keyUp(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(key);
  }
  function wheel(event) {
    if (!focused()) return;
    event.preventDefault();
    if (event.shiftKey) callbacks.onHeight?.(event.deltaY < 0 ? 15 : -15);
  }
  function visibility() {
    if (document.hidden) exitLook();
  }
  const preventMenu = (event) => event.preventDefault();
  document.addEventListener('pointerlockchange', lockChange);
  document.addEventListener('pointerlockerror', failLock);
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', exitLook);
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('mouseleave', leave);
  canvas.addEventListener('blur', resetInput);
  canvas.addEventListener('contextmenu', preventMenu);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return {
    enterLook,
    exitLook,
    cameraStep,
    get active() {
      return locked || fallback;
    },
    update(delta) {
      const directions = new Set([...keys].map((key) => keyDirections[key]));
      const axes = [
        ['right', 'left'],
        ['up', 'down'],
        ['forward', 'back'],
      ].map(
        ([positive, negative]) =>
          Number(directions.has(positive)) - Number(directions.has(negative)),
      );
      const length = Math.hypot(...axes);
      if (!length) return false;
      const speed = ((keys.has('Shift') ? 2400 : 1000) * delta) / length;
      for (const [i, pair] of [
        ['right', 'left'],
        ['up', 'down'],
        ['forward', 'back'],
      ].entries())
        if (axes[i]) cameraStep(pair[axes[i] > 0 ? 0 : 1], speed);
      return true;
    },
    dispose() {
      disposed = true;
      resetInput();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      document.removeEventListener('pointerlockchange', lockChange);
      document.removeEventListener('pointerlockerror', failLock);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', exitLook);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mouseleave', leave);
      canvas.removeEventListener('blur', resetInput);
      canvas.removeEventListener('contextmenu', preventMenu);
      canvas.removeEventListener('wheel', wheel);
    },
  };
}
