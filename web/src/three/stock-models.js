import { createDetailedStock } from './detailed-models.js';
import * as THREE from 'three';
import {
  createBoard,
  createCPU,
  createMemory,
  createCooler,
  createCase,
} from './workbench-models.js';

export const stockPartKeys = {
  motherboard: 'board',
  cpu: 'cpu',
  memory: 'memory0',
  cooler: 'cooler',
  case: 'case',
  storage: 'storage',
  gpu: 'gpu',
  psu: 'psu',
};
export function createStockModel(part) {
  const detailed = createDetailedStock(part);
  if (detailed) return detailed;
  const factories = {
    motherboard: () => createBoard().group,
    cpu: createCPU,
    memory: createMemory,
    cooler: createCooler,
    case: createCase,
  };
  if (factories[part.category]) {
    const model = factories[part.category]();
    // Procedural placeholders share mounting dimensions until detailed assets are available.
    if (part.category === 'memory')
      model.traverse((o) => {
        if (o.isMesh && o.material.color) o.material.color.lerp(new THREE.Color(part.color), 0.45);
      });
    return model;
  }
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: part.color,
    roughness: 0.6,
    metalness: 0.4,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#202b26' });
  const box = (size, position, mat = material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  };
  if (part.category === 'storage') {
    const pcb = new THREE.Shape();
    pcb.moveTo(-40, -12);
    pcb.lineTo(40, -12);
    pcb.lineTo(40, 4);
    pcb.lineTo(34, 4);
    pcb.lineTo(34, 6);
    pcb.lineTo(40, 6);
    pcb.lineTo(40, 12);
    pcb.lineTo(-40, 12);
    pcb.lineTo(-40, 3);
    pcb.absarc(-40, 0, 3, Math.PI / 2, -Math.PI / 2, true);
    pcb.closePath();
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(pcb, { depth: 3, bevelEnabled: false, curveSegments: 8 }),
      dark,
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 4;
    group.add(body);
    for (const x of [-24, -4, 16]) box([15, 3, 17], [x, 5.5, 0]);
    const contacts = new THREE.MeshStandardMaterial({ color: '#b99d62' });
    box([4, 1, 15], [38, 4, -4.5], contacts);
    box([4, 1, 5], [38, 4, 9.5], contacts);
  } else {
    const gpu = part.category === 'gpu';
    box(gpu ? [240, 45, 100] : [150, 85, 140], [0, gpu ? 22.5 : 42.5, 0]);
    if (gpu) {
      const metal = new THREE.MeshStandardMaterial({
        color: '#a3ada5',
        metalness: 0.7,
        roughness: 0.4,
      });
      const gold = new THREE.MeshStandardMaterial({ color: '#b99d62', metalness: 0.5 });
      box([73, 3, 10], [-37.5, 2, 51], gold);
      box([31, 3, 10], [19.5, 2, 51], gold);
      box([3, 43, 118], [-122, 20, -5], metal);
      box([18, 27, 3], [-124, 13, -64], metal);
      for (const z of [-35, -8, 19]) box([4, 15, 17], [-124, 20, z], dark);
    }
    if (!gpu) {
      box([150, 85, 2], [0, 42.5, 80]);
      // Rear inlet and switch mark the facing without text labels.
      box([36, 25, 4], [-35, 47, 82], dark);
      box([18, 22, 4], [12, 47, 82], dark);
      for (const x of [42, 50, 58]) box([3, 45, 2], [x, 46, 82], dark);
      for (const x of [-45, -15, 15, 45]) box([19, 14, 3], [x, 35, -71], dark);
    }
    const count = gpu ? (part.specs.length > 300 ? 3 : 2) : 1;
    for (let i = 0; i < count; i++) {
      const x = gpu ? (i - (count - 1) / 2) * 83 : 0;
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(36, 36, 3, 16), dark);
      fan.position.set(x, gpu ? 47 : 86, 0);
      group.add(fan);
      for (let j = 0; j < 6; j++) {
        const blade = box([5, 3, 57], [x, gpu ? 49 : 88, 0]);
        blade.rotation.y = (j * Math.PI) / 3;
      }
    }
  }
  return group;
}
