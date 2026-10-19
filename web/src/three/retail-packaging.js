import * as THREE from 'three';

import { packageDesigns, createPackagingArtwork } from './packaging-art.js';

export const packageSizes = Object.fromEntries(
  Object.entries(packageDesigns).map(([key, design]) => [key, design.size]),
);

export function createRetailPackaging(part, atlas, interactiveSize = null) {
  const [width, height, depth] = interactiveSize ?? packageSizes[part.category];
  const group = new THREE.Group();
  const design = packageDesigns[part.category];
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: design.paper,
    roughness: 0.94,
  });
  const box = (size, position, parent = group) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), bodyMaterial);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  if (interactiveSize) {
    box([width, 3, depth], [0, 1.5, 0]);
    box([3, height, depth], [-width / 2 + 1.5, height / 2, 0]);
    box([3, height, depth], [width / 2 - 1.5, height / 2, 0]);
    box([width, height, 3], [0, height / 2, -depth / 2 + 1.5]);
    box([width, height, 3], [0, height / 2, depth / 2 - 1.5]);
    const lid = new THREE.Group();
    lid.position.set(0, height, -depth / 2);
    box([width, 3, depth], [0, 0, depth / 2], lid);
    group.add(lid);
    group.userData.lid = lid;
    const insert = box([width - 12, 5, depth - 12], [0, height - 24, 0]);
    insert.material = new THREE.MeshStandardMaterial({ color: '#292d2b', roughness: 1 });
    group.userData.insert = insert;
  } else box([width, height, depth], [0, height / 2, 0]);
  const panel = (w, h, regionKey, position, rotation) => {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), atlas.material);
    const uv = face.geometry.attributes.uv,
      region = atlas.regions.get(regionKey);
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, region.x + uv.getX(i) * region.width, region.y + uv.getY(i) * region.height);
    face.position.set(...position);
    face.rotation.y = rotation;
    group.add(face);
  };
  panel(width, height, part.id, [0, height / 2, depth / 2 + 0.15], 0);
  panel(depth, height, `${part.id}:side`, [width / 2 + 0.15, height / 2, 0], Math.PI / 2);
  panel(depth, height, `${part.id}:side`, [-width / 2 - 0.15, height / 2, 0], -Math.PI / 2);
  panel(width, height, `${part.id}:side`, [0, height / 2, -depth / 2 - 0.15], Math.PI);
  const seamMaterial = new THREE.MeshStandardMaterial({
    color: design.paper,
    roughness: 1,
  });
  const seam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, depth), seamMaterial);
  seam.position.set(0, height + 0.2, 0);
  if (interactiveSize) {
    seam.position.set(0, 2, depth / 2);
    group.userData.lid.add(seam);
  } else group.add(seam);
  group.userData.partId = part.id;
  return group;
}

export function createPackagingAtlas(catalogue) {
  const canvas = document.createElement('canvas');
  const columns = 4,
    cellWidth = 512,
    cellHeight = 512;
  canvas.width = columns * cellWidth;
  canvas.height = THREE.MathUtils.ceilPowerOfTwo(
    Math.ceil((catalogue.length * 2) / columns) * cellHeight,
  );
  const ctx = canvas.getContext('2d'),
    regions = new Map();
  catalogue.forEach((part, index) => {
    for (const side of [false, true]) {
      const cell = index * 2 + Number(side);
      const x = (cell % columns) * cellWidth,
        y = Math.floor(cell / columns) * cellHeight;
      ctx.drawImage(createPackagingArtwork(part, side), x, y, cellWidth, cellHeight);
      regions.set(side ? `${part.id}:side` : part.id, {
        x: (x + 0.5) / canvas.width,
        y: 1 - (y + cellHeight - 0.5) / canvas.height,
        width: (cellWidth - 1) / canvas.width,
        height: (cellHeight - 1) / canvas.height,
      });
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { regions, material: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.96 }) };
}
