import {
  createDetailedBoard,
  createDetailedCPU,
  createDetailedMemory,
  createDetailedCooler,
  createDetailedFan,
  createDetailedCase,
  createDetailedPanel,
  createDetailedSlotCover,
  createDetailedMount,
} from './detailed-models.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const colors = {
  charcoal: '#252b2d',
  edge: '#485153',
  metal: '#8d9694',
  board: '#243b35',
  accent: '#8ecfb4',
  gold: '#cfa764',
};

export function material(color, metalness = 0.25, roughness = 0.55) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

// Bake only static siblings; movable hinges and each physical part keep their own group.
function batchStaticMeshes(group) {
  const batches = new Map();
  for (const child of group.children) {
    if (child.isGroup) batchStaticMeshes(child);
    if (
      !child.isMesh ||
      child.children.length ||
      !child.material.isMeshStandardMaterial ||
      child.material.transparent
    )
      continue;
    const properties = child.material.toJSON();
    delete properties.uuid;
    delete properties.metadata;
    const key = JSON.stringify([
      properties,
      child.castShadow,
      child.receiveShadow,
      child.geometry.index !== null,
      Object.keys(child.geometry.attributes),
    ]);
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(child);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const transformed = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(transformed);
    transformed.forEach((item) => item.dispose());
    const first = meshes[0];
    const merged = new THREE.Mesh(geometry, first.material);
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    for (const mesh of meshes) {
      group.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material !== first.material) mesh.material.dispose();
    }
    group.add(merged);
  }
  return group;
}

export function box(parent, size, position, color = colors.charcoal, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.position.set(...position);
  Object.assign(mesh.material, options);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function cylinder(parent, radius, height, position, color, segments = 24) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    material(color),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function triangle(parent, size, position) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(size, 0);
  shape.lineTo(0, size);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(colors.gold));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(...position);
  parent.add(mesh);
}

export function createCPU(part) {
  const detailed = createDetailedCPU(part);
  if (detailed) return detailed;
  const group = new THREE.Group();
  box(group, [43, 3, 43], [0, 1.5, 0], '#455649');
  box(group, [37, 4, 37], [0, 5, 0], '#afb5b1', { metalness: 0.86, roughness: 0.3 });

  triangle(group, 5, [-19, 7.3, 19]);
  return batchStaticMeshes(group);
}

export function createMemory(part) {
  const detailed = createDetailedMemory(part);
  if (detailed) return detailed;
  const group = new THREE.Group();
  box(group, [3, 30, 132], [0, 18, 0], '#324539');
  for (const side of [-1, 1]) {
    box(group, [2, 27, 124], [side * 2.5, 22, 0], '#68736f');
    for (let i = 0; i < 4; i++) {
      box(group, [2, 14, 18], [side * 3.6, 18, -45 + i * 30], '#29342f');
    }
    for (let i = 0; i < 23; i++) {
      const z = -61 + i * 5.4;
      if (z > -17 && z < -10) continue;
      box(group, [0.5, 7, 2], [side * 1.7, 3.5, z], colors.gold);
    }
  }
  box(group, [8, 3, 128], [0, 36, 0], '#bec9bf');
  // The two separated contact strips make the asymmetric keyed notch visible.
  box(group, [3, 4, 44], [0, 0.5, -42], colors.gold);
  box(group, [3, 4, 75], [0, 0.5, 26], colors.gold);
  return batchStaticMeshes(group);
}

export function createBoard(part) {
  const detailed = createDetailedBoard(part);
  if (detailed) return detailed;
  const group = new THREE.Group();
  box(group, [244, 4, 305], [0, 0, 0], colors.board, { metalness: 0.3, roughness: 0.72 });
  // Retained AMD stock backplate, insulated from the PCB; not a removable AM5 socket part.
  box(group, [104, 2, 88], [-30, -3, -49], '#202a27');
  box(group, [98, 3, 82], [-30, -5, -49], '#78807d');
  for (const x of [-77, 17])
    for (const z of [-89, -9]) cylinder(group, 3, 10, [x, 0, z], '#adb5ac', 8);
  // Solder mask paths, fan headers, capacitors and heatsinks retain recognizable board anatomy.
  for (let i = 0; i < 14; i++) {
    box(group, [0.5, 0.3, 73 + (i % 4) * 12], [-88 + i * 7, 2.2, 73], '#54705b');
    box(group, [38 + i * 3, 0.3, 0.5], [-50, 2.2, 31 + i * 6], '#47634c');
  }
  box(group, [38, 32, 132], [-102, 18, -66], '#565d59');
  box(group, [112, 21, 30], [-32, 12, -128], '#727a72');
  for (let i = 0; i < 9; i++) {
    box(group, [1.8, 4, 118], [-117 + i * 3.5, 35, -66], '#a2aba0');
    box(group, [102, 3, 2], [-32, 23, -140 + i * 3], '#9aa699');
  }
  for (let i = 0; i < 9; i++) cylinder(group, 4, 9, [-72 + i * 14, 7, -101], '#a7b1a5', 12);
  box(group, [53, 5, 53], [-30, 5, -49], '#202727');
  box(group, [43, 1, 43], [-30, 8, -49], '#4d4c3b');
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++)
      cylinder(group, 0.7, 0.5, [-47 + i * 4.8, 8.8, -66 + j * 4.8], '#b5a16b', 5);
  triangle(group, 6, [-59, 5.3, -18]);
  const cover = new THREE.Group();
  cover.position.set(-30, 9, -75);
  group.add(cover);
  box(cover, [58, 2, 5], [0, 0, 1], '#9ba59b');
  box(cover, [58, 2, 5], [0, 0, 53], '#9ba59b');
  for (const side of [-1, 1]) box(cover, [5, 2, 54], [side * 26.5, 0, 27], '#9ba59b');
  const lever = new THREE.Group();
  lever.position.set(7, 7, -77);
  group.add(lever);
  box(lever, [2.5, 2.5, 62], [0, 0, 28], '#bbc3b8');
  box(lever, [12, 3, 5], [4, 0, 58], '#bbc3b8');
  const latches = [];
  for (let i = 0; i < 2; i++) {
    const x = 60 + i * 27;
    box(group, [12, 8, 145], [x, 7, -43], '#171f1d');
    box(group, [3, 1, 132], [x, 11.5, -43], '#766b44');
    box(group, [6, 4, 3], [x, 13, -57], '#9a9d82');
    const pair = [];
    for (const end of [-1, 1]) {
      const latch = new THREE.Group();
      latch.position.set(x, 10, -43 + end * 75);
      group.add(latch);
      box(latch, [14, 13, 9], [0, 3, 0], '#b4b9a8');
      pair.push(latch);
    }
    latches.push(pair);
  }
  box(group, [8, 6, 28], [26, 8, 38], '#202a26');
  box(group, [1, 2, 24], [21.5, 8, 38], '#b7a272');
  cylinder(group, 3.5, 5, [-58, 5, 38], '#b7a272', 12);
  for (let i = 0; i < 3; i++) {
    box(group, [123, 7, 11], [-25, 6, 64 + i * 31], i === 0 ? '#a5afa3' : '#202a26');
    box(group, [111, 1, 2], [-25, 10, 64 + i * 31], '#202823');
  }
  const gpuLatch = new THREE.Group();
  gpuLatch.position.set(45, 9, 64);
  box(gpuLatch, [16, 9, 14], [6, 4, 0], '#b4b9a8');
  group.add(gpuLatch);
  box(group, [61, 9, 40], [73, 8, 98], '#87917d');
  for (let i = 0; i < 8; i++) box(group, [52, 2, 1.5], [73, 13, 83 + i * 4], '#b0b9a6');
  cylinder(group, 12, 4, [-73, 5, 22], '#c0c3b5');
  box(group, [11, 15, 53], [112, 10, -45], '#202924');
  for (const x of [-108, 108]) {
    for (const z of [-136, 136]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 1.5, 8, 16), material('#b6aa78'));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 2.8, z);
      group.add(ring);
    }
  }

  return { group: batchStaticMeshes(group), cover, lever, latches, gpuLatch };
}

export function createScrew() {
  const group = new THREE.Group();
  cylinder(group, 2.7, 9, [0, 0, 0], '#92968b', 12);
  cylinder(group, 6, 3, [0, 6, 0], '#bdc2b5', 24);
  box(group, [7, 0.4, 1.4], [0, 7.7, 0], '#374039');
  box(group, [1.4, 0.4, 7], [0, 7.7, 0], '#374039');
  return batchStaticMeshes(group);
}

export function createCoolerMount(stock = false) {
  const detailed = createDetailedMount(stock);
  if (detailed) {
    detailed.userData.screws = [-27, 27].map((x) => {
      const screw = createScrew();
      screw.position.set(x, stock ? 7 : 14, 0);
      detailed.add(screw);
      return screw;
    });
    return detailed;
  }
  const group = new THREE.Group();
  const tint = stock ? '#252e29' : '#a2aaa5';
  box(group, [12, 5, 92], [0, stock ? 5 : 12, 0], tint);
  if (stock) box(group, [21, 5, 12], [4, 10, 0], tint);
  else {
    for (const z of [-40, 40]) cylinder(group, 5, 9, [0, 4.5, z], '#393f38', 10);
    cylinder(group, 3, 9, [0, 18, 0], '#c0c6c0', 8);
  }
  batchStaticMeshes(group);
  const screws = [-40, 40].map((z) => {
    const screw = createScrew();
    screw.position.set(0, stock ? 7 : 14, z);
    group.add(screw);
    return screw;
  });
  group.userData.screws = screws;
  return group;
}

export function createDriver() {
  const group = new THREE.Group();
  cylinder(group, 10, 57, [0, 64, 0], '#88a68f');
  cylinder(group, 11.5, 8, [0, 93, 0], '#2c3831');
  cylinder(group, 9, 8, [0, 34, 0], '#202b25');
  cylinder(group, 3, 58, [0, 1, 0], '#b4bdb0');
  box(group, [3, 10, 1.5], [0, -32, 0], '#8e9b8f');
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    box(group, [2, 35, 2], [Math.cos(angle) * 9.5, 64, Math.sin(angle) * 9.5], '#506557');
  }
  return batchStaticMeshes(group);
}

export function createCase({ standoffs = true, slotCovers = true } = {}) {
  const detailed = createDetailedCase({ standoffs, slotCovers });
  if (detailed) return detailed;
  const group = new THREE.Group();
  const color = '#707a72';
  box(group, [356, 12, 475], [0, 9, 0], color);
  // Opening for the separate motherboard I/O shield: y 41..85, z -210..-62.
  box(group, [13, 32, 475], [-171, 25, 0], color);
  box(group, [13, 72, 475], [-171, 131, 0], color);
  box(group, [13, 10, 175.5], [-171, 90, -149.75], color);
  box(group, [13, 10, 172.5], [-171, 90, 151.25], color);
  box(group, [13, 44, 27.5], [-171, 63, -223.75], color);
  box(group, [13, 44, 172.5], [-171, 63, 151.25], color);
  box(group, [13, 158, 475], [171, 88, 0], color);
  box(group, [332, 158, 11], [0, 88, -232], '#626e65');
  // Rear opening for the PSU; retain the frame around its inlet and mounting plate.
  box(group, [41, 158, 11], [-145.5, 88, 232], '#4c5851');
  box(group, [141, 158, 11], [95.5, 88, 232], '#4c5851');
  box(group, [150, 16, 11], [-50, 17, 232], '#4c5851');
  box(group, [150, 57, 11], [-50, 138.5, 232], '#4c5851');
  box(group, [58, 140, 451], [133, 84, 0], '#56645b');
  for (const x of [-164, 164]) box(group, [19, 8, 472], [x, 169, 0], '#a6b2a5');
  for (const z of [-229, 229]) box(group, [333, 8, 17], [0, 169, z], '#a6b2a5');
  for (const x of [-147, 147])
    for (const z of [-199, 199]) box(group, [29, 9, 39], [x, 0, z], '#1d2922');
  for (let z = -194; z < 210; z += 11)
    box(group, [1, z < 65 ? 39.5 : 85, 3], [-178, z < 65 ? 114.75 : 92, z], '#394b40');
  for (let x = 42; x < 90; x += 11) box(group, [3, 82, 1], [x, 87, 238], '#263e31');
  if (standoffs)
    for (const x of [-108, 108])
      for (const z of [-136, 136]) cylinder(group, 4.5, 15, [x - 18, 32, z - 70], colors.gold, 12);
  box(group, [158, 7, 148], [-50, 21, 155], '#253c2e');
  if (slotCovers)
    for (let i = 0; i < 2; i++) {
      const cover = createSlotCover();
      cover.position.set(-171, 41 + i * 26, 0);
      for (const child of [...cover.children]) {
        child.position.add(cover.position);
        group.add(child);
      }
    }

  return batchStaticMeshes(group);
}

export function createSlotCover(index = 0) {
  const detailed = createDetailedSlotCover(index);
  if (detailed) return detailed;
  const group = new THREE.Group();
  box(group, [3, 24, 124], [0, 12, 0], '#a6b2a5');
  box(group, [12, 3, 12], [4, 24, -56], '#a6b2a5');
  for (let z = -42; z <= 42; z += 14) box(group, [0.4, 12, 5], [-1.7, 12, z], '#3c4b41');
  return batchStaticMeshes(group);
}

export function createStandoff() {
  const group = new THREE.Group();
  cylinder(group, 4.5, 26, [0, -4, 0], colors.gold, 6);
  cylinder(group, 1.8, 0.3, [0, 9.1, 0], '#382a18', 8);
  return batchStaticMeshes(group);
}

export function createIOShield() {
  const group = new THREE.Group();
  for (const y of [3, 41]) box(group, [2, 6, 148], [0, y, 0], '#b8bdb8');
  for (const z of [-71, -43, -12, 22, 49, 71]) box(group, [2, 32, 5], [0, 22, z], '#b8bdb8');
  box(group, [2, 3, 58], [0, 22, -28], '#b8bdb8');
  // Folded edge and spring tabs distinguish the inward-facing side.
  for (const z of [-68, 68]) box(group, [6, 30, 2], [2, 22, z], '#8c9790');
  return batchStaticMeshes(group);
}

export function createPanel() {
  const detailed = createDetailedPanel();
  if (detailed) return detailed;
  const group = new THREE.Group();
  box(group, [355, 6, 474], [0, 0, 0], '#748678', {
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  for (const x of [-171, 171]) box(group, [14, 8, 474], [x, 0, 0], '#53665a');
  for (const z of [-229, 229]) box(group, [329, 8, 16], [0, 0, z], '#53665a');
  for (const x of [-155, 155]) {
    for (const z of [-213, 213]) cylinder(group, 6, 2, [x, 5, z], '#acb7a8', 16);
  }
  return batchStaticMeshes(group);
}

export function createWorkshop(scene) {
  const world = new THREE.Group();
  scene.add(world);
  box(world, [1840, 43, 1120], [0, -24, 0], '#393f38', { roughness: 0.88, metalness: 0.08 });
  box(world, [1844, 8, 28], [0, -16, 555], '#707364');
  for (const x of [-835, 835]) box(world, [45, 420, 75], [x, -250, 360], '#242c26');
  // Subtle grooves and a restrained inlaid ruler make scale and placement readable.
  for (let i = 0; i < 81; i++)
    box(world, [0.75, 0.3, i % 5 === 0 ? 16 : 7], [-800 + i * 20, -1.9, 516], '#777f6e');
  box(world, [497, 5, 555], [-65, 2, -8], '#314c43', { roughness: 1, metalness: 0 });
  for (const x of [-305, 175]) box(world, [1, 0.2, 529], [x, 5, -8], '#5f7964');
  for (const z of [-273, 257]) box(world, [480, 0.2, 1], [-65, 5, z], '#5f7964');
  for (let i = -270; i < 160; i += 30) {
    box(world, [0.3, 0.2, 499], [i, 4.8, -8], '#3b5749');
  }
  for (let i = -240; i < 250; i += 30) box(world, [450, 0.2, 0.3], [-65, 4.8, i], '#3b5749');

  // Parts tray, recessed into a shallow protective foam insert.
  box(world, [376, 10, 532], [-572, 3, -50], '#536052');
  box(world, [354, 9, 508], [-572, 9, -50], '#252f29', { roughness: 0.99, metalness: 0 });
  for (const x of [-756, -388]) box(world, [8, 17, 532], [x, 10, -50], '#677462');
  for (const z of [-312, 212]) box(world, [376, 17, 8], [-572, 10, z], '#677462');
  box(world, [341, 5, 8], [-572, 16, 49], '#57654e');
  box(world, [7, 5, 154], [-628, 16, 134], '#57654e');

  // A small magnetic screw tray and dock for the only tool used in this milestone.
  box(world, [167, 12, 111], [711, 5, 336], '#555f51');
  box(world, [148, 3, 91], [711, 13, 336], '#253c2d');

  return batchStaticMeshes(world);
}

export function createCooler(includeFans = true, part) {
  const detailed = createDetailedCooler(includeFans, part);
  if (detailed) return detailed;
  const group = new THREE.Group();
  box(group, [52, 6, 52], [0, 3, 0], '#afa696', { metalness: 0.8 });
  for (const x of [-21, 21]) cylinder(group, 3, 78, [x, 42, 0], colors.gold, 8);
  for (let y = 16; y <= 90; y += 6) box(group, [74, 2, 68], [0, y, 0], '#9aa49e');
  box(group, [78, 4, 70], [0, 95, 0], '#4d5c53');
  for (const side of includeFans ? [-45, 45] : []) {
    const fan = new THREE.Group();
    fan.position.set(side, 53, 0);
    fan.rotation.y = Math.PI / 2;
    group.add(fan);
    for (const x of [-38, 38]) box(fan, [5, 78, 12], [x, 0, 0], '#263c32');
    for (const y of [-38, 38]) box(fan, [78, 5, 12], [0, y, 0], '#263c32');
    const hub = cylinder(fan, 11, 10, [0, 0, 0], '#5e7566', 16);
    hub.rotation.x = Math.PI / 2;
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      const blade = box(
        fan,
        [12, 24, 3],
        [Math.sin(angle) * 22, Math.cos(angle) * 22, 0],
        '#536b5c',
      );
      blade.rotation.z = -angle + 0.35;
    }
  }
  for (const x of [-47, 47]) box(group, [16, 5, 24], [x, 5, 0], '#8d9694');
  return batchStaticMeshes(group);
}

export function createCoolerFan(index = 0) {
  const detailed = createDetailedFan(index);
  if (detailed) return detailed;
  // Outlet struts face -X (rear I/O); intake faces +X (memory) on both sides.
  const root = new THREE.Group();
  const fan = new THREE.Group();
  fan.position.y = 40;
  fan.rotation.y = -Math.PI / 2;
  root.add(fan);
  for (const x of [-38, 38]) box(fan, [5, 78, 12], [x, 0, 0], '#263c32');
  for (const y of [-38, 38]) box(fan, [78, 5, 12], [0, y, 0], '#263c32');
  const hub = cylinder(fan, 11, 10, [0, 0, 0], '#5e7566', 16);
  hub.rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const angle = (i * Math.PI * 2) / 7;
    const blade = box(fan, [12, 24, 3], [Math.sin(angle) * 22, Math.cos(angle) * 22, 0], '#536b5c');
    blade.rotation.z = -angle + 0.35;
  }
  // Rear motor struts make the outlet side distinguishable without text labels.
  for (const angle of [0, Math.PI / 2]) {
    const strut = box(fan, [3, 72, 2], [0, 0, 7], '#263c32');
    strut.rotation.z = angle;
  }
  batchStaticMeshes(root);
  const clips = new THREE.Group();
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.z = side * 38;
    clips.add(hinge);
    // Bent spring wire: corner hooks, diagonal arms, and a stepped pull tab
    // that catches the fin edge. Endpoints stay at the fan when it swings open.
    const points = [
      [-3, 4, 0],
      [3, 4, 0],
      [3, 7, 2],
      [7, 7, 2],
      [23, 25, -3],
      [27, 25, -3],
      [27, 34, -3],
      [31, 34, 2],
      [31, 46, 2],
      [27, 46, -3],
      [27, 55, -3],
      [23, 55, -3],
      [7, 73, 2],
      [3, 73, 2],
      [3, 76, 0],
      [-3, 76, 0],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z * side));
    const path = new THREE.CurvePath();
    let start = points[0];
    for (let i = 1; i < points.length - 1; i++) {
      const corner = points[i];
      const before = corner.clone().lerp(points[i - 1], 0.16);
      const after = corner.clone().lerp(points[i + 1], 0.16);
      path.add(new THREE.LineCurve3(start, before));
      path.add(new THREE.QuadraticBezierCurve3(before, corner, after));
      start = after;
    }
    path.add(new THREE.LineCurve3(start, points.at(-1)));
    hinge.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(path, 80, 0.65, 6, false),
        material('#d4d9db', 0.8, 0.28),
      ),
    );
  }
  root.add(clips);
  root.userData.clips = clips;
  return root;
}

export function createPasteTube() {
  const group = new THREE.Group();
  cylinder(group, 7, 45, [0, 28, 0], '#a9b1a5', 12);
  cylinder(group, 2, 18, [0, -3, 0], '#c3c6b8', 8);
  box(group, [23, 3, 9], [0, 53, 0], '#53695c');
  cylinder(group, 3, 17, [0, 62, 0], '#738f7c', 8);
  box(group, [19, 4, 10], [0, 73, 0], '#53695c');
  return batchStaticMeshes(group);
}
