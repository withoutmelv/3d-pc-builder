import * as THREE from 'three';
import { getPower, getGraphics } from '../../../shared/assembly.js';
import { getCableConnections, CABLE_NAMES } from '../../../shared/power-wiring.js';

// Positions are local to the motherboard; the GPU port sits above the installed card.
export const POWER_PORTS = {
  frontPower: [99, 7, 147],
  board: [115, 11, -58],
  cpu: [-75, 11, -148],
  gpu: [43, 160, 41],
};
const tones = { frontPower: '#737e87', board: '#9cae9a', cpu: '#b5a17e', gpu: '#879da7' };
function connector(kind, socket = false) {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: socket ? '#23312b' : tones[kind],
    roughness: 0.65,
  });
  const pins = new THREE.MeshStandardMaterial({
    color: socket ? '#af9763' : '#24312a',
    roughness: 0.7,
  });
  const mesh = (size, pose, material) => {
    const item = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    item.position.set(...pose);
    group.add(item);
  };
  const size = kind === 'frontPower' ? [10, 7, 7] : kind === 'board' ? [14, 9, 54] : [24, 9, 14];
  mesh(size, [0, 0, 0], body);
  // A keyed tab distinguishes CPU EPS from PCIe, without surface text.
  if (kind !== 'frontPower')
    mesh([5, 4, 4], [kind === 'gpu' ? 7 : -5, 5, kind === 'board' ? 0 : 8], body);
  const count = kind === 'frontPower' ? 2 : kind === 'board' ? 12 : 4;
  for (let row = 0; row < (kind === 'frontPower' ? 1 : 2); row++)
    for (let i = 0; i < count; i++) {
      mesh(
        [2, 1, 2],
        kind === 'frontPower'
          ? [(i - 0.5) * 4, 4, 0]
          : kind === 'board'
            ? [(row - 0.5) * 5, 5, (i - 5.5) * 4]
            : [(i - 1.5) * 5, 5, (row - 0.5) * 5],
        pins,
      );
    }
  // Keep each connector to two draws while its whole group remains movable.
  for (const material of [body, pins]) {
    const matching = group.children.filter((child) => child.material === material);
    const positions = [],
      normals = [];
    for (const child of matching) {
      child.updateMatrix();
      const geometry = child.geometry.toNonIndexed().applyMatrix4(child.matrix);
      positions.push(...geometry.attributes.position.array);
      normals.push(...geometry.attributes.normal.array);
      geometry.dispose();
      child.geometry.dispose();
      group.remove(child);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}
export function createPowerCables(chassis, board) {
  const root = new THREE.Group();
  chassis.add(root);
  const ports = {},
    plugs = {},
    cables = {};
  Object.keys(CABLE_NAMES).forEach((kind, i) => {
    ports[kind] = connector(kind, true);
    ports[kind].position.set(...POWER_PORTS[kind]);
    board.add(ports[kind]);
    plugs[kind] = connector(kind);
    root.add(plugs[kind]);
    const wire = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: tones[kind], roughness: 0.85 }),
    );
    root.add(wire);
    cables[kind] = {
      wire,
      source:
        kind === 'frontPower'
          ? new THREE.Vector3(165, 218, -237)
          : new THREE.Vector3(-65, 70 + i * 25, 176),
      rest:
        kind === 'frontPower'
          ? new THREE.Vector3(63, 122, -145)
          : new THREE.Vector3(-97 + i * 46, 124, 150),
      signature: '',
    };
    ports[kind].visible = false;
  });
  function update(state, selected, camera, heldPart) {
    const wiring = getCableConnections(state);
    const installed = getPower(state).placed;
    // Interior cabling is hidden beneath the closed panel.
    root.visible = Boolean(state.layout?.case) && state.panelRemoved;
    for (const kind of Object.keys(cables)) {
      ports[kind].visible =
        (kind === 'frontPower' ? Boolean(state.layout?.board) : state.board === 'case') &&
        state.panelRemoved &&
        (kind !== 'gpu' || (getGraphics(state).placed && heldPart !== 'gpu'));
      const { source, rest, wire } = cables[kind];
      const visible =
        kind === 'frontPower' ? Boolean(state.layout?.case) : installed && heldPart !== 'psu';
      plugs[kind].visible = visible;
      wire.visible = visible;
      if (!root.visible || !visible) continue;
      let end = rest.clone();
      if (wiring[kind]) {
        end = ports[kind].localToWorld(new THREE.Vector3(0, 9, 0));
        chassis.worldToLocal(end);
      } else if (selected === kind) {
        end.set(78, -90, -260);
        camera.localToWorld(end);
        chassis.worldToLocal(end);
      }
      plugs[kind].position.copy(end);
      // Case and motherboard are aligned when installed, so connected plugs share their axes.
      const points = wiring[kind]
        ? [
            source,
            new THREE.Vector3(source.x, 125, 78),
            new THREE.Vector3(140, 160, 78),
            new THREE.Vector3(140, 160, end.z),
            new THREE.Vector3(end.x, 160, end.z),
            end,
          ]
        : [source, new THREE.Vector3(source.x, 125, 78), end];
      const signature = points
        .map((p) =>
          p
            .toArray()
            .map((v) => Math.round(v * 2))
            .join(','),
        )
        .join(';');
      if (signature !== cables[kind].signature) {
        wire.geometry.dispose();
        wire.geometry = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          20,
          kind === 'frontPower' ? 1.2 : kind === 'board' ? 3 : 2.2,
          5,
          false,
        );
        cables[kind].signature = signature;
      }
    }
  }
  return { ports, plugs, root, update };
}
