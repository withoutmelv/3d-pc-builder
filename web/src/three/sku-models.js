import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Catalogue-specific procedural models. Shared construction helpers do not imply
// shared geometry: every SKU owns its dimensions, silhouette and materials.
export function createSkuModel(part) {
  if (
    !part ||
    ![
      'cpu-a4',
      'ram-d4',
      'ssd-2',
      'gpu-dual',
      'gpu-triple',
      'gpu-xl',
      'psu-750',
      'psu-850',
    ].includes(part.id)
  )
    return null;
  const group = new THREE.Group();
  const batches = new Map();
  function add(geometry, position, color, rotation = null) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation || [0, 0, 0]))),
      new THREE.Vector3(1, 1, 1),
    );
    geometry.applyMatrix4(matrix);
    if (geometry.index) {
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      geometry = expanded;
    }
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color).push(geometry);
  }
  const box = (size, pos, color) => add(new THREE.BoxGeometry(...size), pos, color);
  const dark = '#242a30',
    gold = '#c5a058',
    silver = '#a6adb3';
  function fan(x, y, z, radius) {
    add(new THREE.CylinderGeometry(radius, radius, 2, 24), [x, y, z], '#101619');
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9;
      add(
        new THREE.BoxGeometry(radius * 0.8, 2, radius * 0.25),
        [x + Math.cos(a) * radius * 0.52, y + 2, z + Math.sin(a) * radius * 0.52],
        dark,
        [0, -a + 0.35, 0],
      );
    }
    add(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, 4, 16), [x, y + 2, z], silver);
  }
  if (part.id === 'cpu-a4') {
    box([40, 1.2, 40], [0, 1.6, 0], '#24443a');
    box([35, 1.72, 35], [0, 3.06, 0], silver);
    for (let x = -17; x <= 17; x += 2)
      for (let z = -17; z <= 17; z += 2) {
        if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
        box([0.55, 1, 0.55], [x, 0.5, z], gold);
      }
    const mark = new THREE.Shape();
    mark.moveTo(0, 0);
    mark.lineTo(4, 0);
    mark.lineTo(0, 4);
    mark.closePath();
    add(new THREE.ShapeGeometry(mark), [-19, 2.22, 19], gold, [-Math.PI / 2, 0, 0]);
  } else if (part.id === 'ram-d4') {
    // Preserve the simulator's keyed contact position at z=7.
    box([1.6, 27, 133], [0, 20.5, 0], '#283c32');
    for (const [z, length] of [
      [-31, 72],
      [39, 55],
    ]) {
      box([1.6, 7, length], [0, 3.5, z], '#283c32');
      for (let p = z - length / 2 + 1; p < z + length / 2; p += 2.4)
        box([1.8, 5, 1.4], [0, 2.5, p], gold);
    }
    for (const sign of [-1, 1]) {
      box([1.6, 23, 127], [sign * 2, 22, 0], part.color);
      for (let z = -54; z <= 54; z += 18) box([1.5, 15, 11], [sign * 3.5, 23, z], dark);
    }
    box([7, 2, 129], [0, 34, 0], dark);
  } else if (part.category === 'gpu') {
    const length = part.specs.length,
      thickness = part.dimensions[1],
      width = part.dimensions[2];
    // Keep the PCIe edge at +Z and the connector key at the existing anchor.
    const z = 70 - width / 2,
      centerX = length / 2 - 168;
    box([length, thickness - 10, width - 8], [centerX, thickness / 2, z], part.color);
    box([length - 5, 2, width - 12], [centerX, 3, z], dark);
    for (let x = -length / 2 + 8; x < length / 2 - 8; x += 7)
      box([1.2, thickness - 16, width - 14], [centerX + x, thickness / 2, z], silver);
    box([length, 5, width], [centerX, thickness - 3, z], part.color);
    const count = part.id === 'gpu-dual' ? 2 : 3;
    group.userData.fanPositions = Array.from({ length: count }, (_, i) => ({
      x: centerX + (i - (count - 1) / 2) * (length / count),
      y: thickness,
      z,
      radius: Math.min(45, width * 0.38),
    }));
    if (part.id === 'gpu-xl')
      for (const edge of [-1, 1])
        box([length - 12, 4, 5], [centerX, thickness + 2, z + edge * (width / 2 - 3)], '#c5ced5');
    group.userData.fanCount = count;
  } else if (part.category === 'storage') {
    box([73, 2, 20], [-2, 3, 0], dark);
    for (let z = -8; z <= 8; z += 4) box([70, 3, 1.5], [-2, 5.5, z], part.color);
  } else {
    // PSU local X is depth, Y is its 150 mm rear width, Z is 86 mm thickness.
    const depth = part.dimensions[2];
    box([depth, 150, 86], [0, 75, 0], part.color);
    // Fan geometry starts horizontal, then rotates onto the PSU's broad side.
    const beforeFan = new Map(
      [...batches].map(([color, geometries]) => [color, geometries.length]),
    );
    fan(0, 0, 0, part.id === 'psu-750' ? 52 : 60);
    for (const [color, geometries] of batches)
      for (const geometry of geometries.slice(beforeFan.get(color) || 0))
        geometry.rotateX(Math.PI / 2).translate(0, 75, 44);
    for (let x = -depth / 2 + 12; x < depth / 2 - 8; x += 10)
      box([3, 110, 1], [x, 75, -43.8], dark);
    box([2, 30, 24], [-depth / 2 - 1, 48, 0], dark);
    box([2, 19, 14], [-depth / 2 - 1, 94, 0], dark);
    for (let y = 28; y <= 120; y += 30)
      for (const z of [-20, 16]) box([3, 19, 17], [depth / 2 + 1, y, z], dark);
  }
  for (const [color, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    if (part.category === 'psu') geometry.translate(part.dimensions[2] / 2 - 85, 0, 0);
    geometries.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        metalness: color === gold || color === silver ? 0.7 : 0.35,
        roughness: 0.55,
      }),
    );
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.partId = part.id;
  return group;
}
