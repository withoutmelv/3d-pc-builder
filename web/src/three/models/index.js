import * as THREE from 'three';
const metal = (color) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.38 });
export function box(group, size, position, color = '#aeb4bb') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), metal(color));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function lightStrip(group, size, position, color = '#6caeff') {
  const m = box(group, size, position, color);
  m.material.emissive.set(color);
  m.material.emissiveIntensity = 2;
  return m;
}
function fan(radius = 46, color = '#79b8f5') {
  const g = new THREE.Group();
  box(g, [radius * 2.2, radius * 2.2, 12], [0, 0, -9], '#232a32');
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 2.8, 10, 64),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }),
  );
  g.add(ring);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 12, 24), metal('#626d7a'));
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  const blades = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const b = box(blades, [12, radius * 0.64, 3], [0, radius * 0.55, 0], '#556575');
    const pivot = new THREE.Group();
    blades.remove(b);
    pivot.add(b);
    pivot.rotation.z = (i * Math.PI * 2) / 9;
    b.rotation.z = -0.45;
    blades.add(pivot);
  }
  g.add(blades);
  g.userData.rotor = blades;
  return g;
}
export function createPartModel(part) {
  const g = new THREE.Group();
  g.userData.category = part.category;
  const c = part.color;
  switch (part.modelKey) {
    case 'case': {
      const [depth, height, width] = part.dimensions;
      for (const x of [-width / 2, width / 2])
        for (const z of [-depth / 2, depth / 2]) box(g, [12, height, 12], [x, height / 2, z], c);
      box(g, [width, 10, depth], [0, height, 0], c);
      box(g, [width, 12, depth], [0, 8, 0], c);
      box(g, [width, 95, depth - 8], [0, 58, 0], '#b8bec5');
      box(g, [width - 10, height - 105, 5], [0, (height + 105) / 2, -depth / 2], '#343c46');
      for (const x of [-145, 145])
        for (const z of [-75, 75]) box(g, [40, 12, 30], [x, -3, z], '#111821');
      for (const y of [170, 280, 390]) {
        const f = fan(45);
        f.rotation.y = Math.PI / 2;
        f.position.set(width / 2 - 18, y, 0);
        g.add(f);
      }
      for (let z = -85; z <= 85; z += 14) box(g, [width - 50, 2, 3], [0, height + 6, z], '#58636f');
      const glass = box(
        g,
        [width - 18, height - 110, 3],
        [0, (height + 105) / 2, depth / 2],
        '#a1c0d8',
      );
      glass.material.transparent = true;
      glass.material.opacity = 0.1;
      glass.material.depthWrite = false;
      glass.userData.sidePanel = true;
      lightStrip(g, [2, height - 120, 2], [width / 2 + 7, (height + 110) / 2, depth / 2 + 1]);
      break;
    }
    case 'motherboard': {
      const [h, w] = part.dimensions;
      box(g, [w, h, 5], [0, 0, 0], c);
      for (let i = 0; i < 7; i++)
        box(g, [65, 5, 9], [-w / 2 + 42, -h / 2 + 20 + i * 12, 8], '#606b73');
      for (let i = 0; i < 8; i++)
        box(g, [10, 20, 10], [-w / 2 + 10 + i * 12, h / 2 - 18, 8], '#596671');
      box(g, [52, 52, 6], [-20, 60, 5], '#171d24');
      for (let i = 0; i < 4; i++) box(g, [5, 137, 8], [70 + i * 10, 35, 8], '#151a20');
      for (let i = 0; i < 3; i++) box(g, [120, 7, 9], [-15, -65 - i * 23, 8], '#929aa4');
      for (let i = 0; i < 12; i++)
        box(g, [1, 100 - i * 5, 1], [-w / 2 + 20 + i * 8, -15, 3.2], '#405655');
      box(g, [46, 100, 30], [-w / 2 + 28, h / 2 - 60, 15], '#727c86');
      break;
    }
    case 'cpu':
      box(g, [40, 40, 5], [0, 0, 0], '#697078');
      box(g, [34, 34, 3], [0, 0, 4], c);
      break;
    case 'cooler': {
      const [w, h, d] = part.dimensions;
      box(g, [40, 40, 6], [0, 0, 0], '#b48c68');
      for (let i = 0; i < 18; i++) box(g, [w - 12, d, 2], [0, 0, 15 + (i * (h - 32)) / 18], c);
      const f = fan(w * 0.38);
      f.position.z = h;
      g.add(f);
      break;
    }
    case 'memory': {
      const [h, d, w] = part.dimensions;
      for (const x of [-10, 10]) {
        box(g, [w, h, d], [x, 0, d / 2], c);
        lightStrip(g, [w + 1, h - 5, 3], [x, 0, d]);
      }
      break;
    }
    case 'gpu': {
      const [w, h, d] = part.dimensions;
      box(g, [w, h, d], [w / 2, 0, 0], c);
      box(g, [6, h + 20, d + 8], [0, 0, 0], '#666f78');
      const n = w > 300 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const f = fan(37, '#90b0cf');
        f.rotation.x = -Math.PI / 2;
        f.position.set(48 + (i * (w - 96)) / (n - 1), h / 2 + 3, 0);
        g.add(f);
      }
      lightStrip(g, [w - 40, 3, 2], [w / 2, 0, d / 2 + 1]);
      for (let i = 0; i < 20; i++)
        box(g, [3, h - 10, 2], [20 + (i * (w - 40)) / 20, 0, d / 2], '#606b75');
      break;
    }
    case 'storage': {
      const [w, h, d] = part.dimensions;
      box(g, [w, h, d], [0, 0, 0], c);
      for (let i = 0; i < 3; i++) box(g, [16, 15, 2], [-24 + i * 23, 0, d / 2 + 1], '#191e26');
      break;
    }
    case 'psu': {
      const [w, h, d] = part.dimensions;
      box(g, [d, h, w], [0, 0, 0], c);
      const f = fan(40, '#5b687a');
      f.position.set(0, 0, w / 2 + 1);
      g.add(f);
      break;
    }
  }
  g.traverse((obj) => {
    if (obj.material) {
      obj.userData.baseEmissive = obj.material.emissive.clone();
      obj.userData.baseIntensity = obj.material.emissiveIntensity;
    }
  });
  return g;
}
