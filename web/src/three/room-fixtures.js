import { isStockAvailable } from '../../../shared/stock-catalogue.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CART, FLOOR_Y } from '../../../shared/workbench-layout.js';
import { createStockModel } from './stock-models.js';
import { createRetailPackaging, createPackagingAtlas } from './retail-packaging.js';
export const SHELF_CATEGORIES = [
  'cpu',
  'motherboard',
  'memory',
  'storage',
  'cooler',
  'gpu',
  'psu',
  'case',
];
export const shelfX = (category) => (SHELF_CATEGORIES.indexOf(category) - 3.5) * 580;
export function createRoomFixtures(scene, catalogue, element) {
  catalogue = catalogue.filter(isStockAvailable);
  const root = new THREE.Group();
  scene.add(root);
  const material = new THREE.MeshStandardMaterial({ color: '#43594a', roughness: 0.8 });
  const frame = new THREE.MeshStandardMaterial({ color: '#263a2e', roughness: 0.75 });
  function box(size, position, mat = material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position);
    root.add(mesh);
    return mesh;
  }
  box([CART.width, 16, CART.depth], [CART.x, CART.y - 8, CART.z]);
  box([CART.width, 12, CART.depth], [CART.x, FLOOR_Y + 95, CART.z], frame);
  for (const dx of [-CART.width / 2 + 30, CART.width / 2 - 30])
    for (const dz of [-CART.depth / 2 + 30, CART.depth / 2 - 30]) {
      box([18, 320, 18], [CART.x + dx, FLOOR_Y + 210, CART.z + dz], frame);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 20, 12), frame);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(CART.x + dx, FLOOR_Y + 32, CART.z + dz);
      root.add(wheel);
    }
  box([18, 100, CART.depth], [CART.x - CART.width / 2 + 10, CART.y + 50, CART.z], frame);
  box([5200, 1500, 25], [0, 280, -2070], frame);
  const packagingAtlas = createPackagingAtlas(catalogue);
  const stocks = [],
    labels = [];
  const categoryNames = ['CPU', '主板', '内存', '磁盘', '散热', '显卡', '电源', '机箱'];
  SHELF_CATEGORIES.forEach((category, index) => {
    const x = shelfX(category);
    for (const side of [-265, 265]) box([14, 1000, 20], [x + side, FLOOR_Y + 500, -1880], frame);
    for (const y of [FLOOR_Y + 65, -110, 250, 540]) box([540, 12, 250], [x, y, -1880]);
    const label = document.createElement('div');
    label.className = 'room-shelf-label';
    label.textContent = categoryNames[index];
    element.appendChild(label);
    labels.push({ node: label, position: new THREE.Vector3(x, 600, -1880) });
    catalogue
      .filter((p) => p.category === category)
      .forEach((part, i) => {
        const px = x,
          y = i < 2 ? 258 : -102;
        const packaging = createRetailPackaging(part, packagingAtlas);
        packaging.position.set(px - 65, y, -1935);
        root.add(packaging);
        const model = createStockModel(part);
        if (['cpu', 'motherboard', 'storage', 'gpu', 'case'].includes(category))
          model.rotation.x = Math.PI / 2;
        if (category === 'memory') model.rotation.y = Math.PI / 2;
        const bounds = new THREE.Box3().setFromObject(model),
          size = bounds.getSize(new THREE.Vector3()),
          center = bounds.getCenter(new THREE.Vector3());
        const scale = Math.min(165 / size.x, 135 / size.y, 85 / size.z);
        model.scale.setScalar(scale);
        model.position.set(
          px + 140 - center.x * scale,
          y - bounds.min.y * scale,
          -1805 - center.z * scale,
        );
        model.traverse((o) => {
          o.castShadow = false;
          o.receiveShadow = false;
        });
        root.add(model);
        const marker = box(
          [440, 3, 7],
          [px, y - 5, -1750],
          new THREE.MeshBasicMaterial({ color: '#bddeb1' }),
        );
        marker.visible = false;
        stocks.push({ part, position: [px, y + 123, -1860], marker });
      });
  });
  // Shelves are static: bake their transforms and merge equal materials once.
  root.updateMatrixWorld(true);
  const markers = new Set(stocks.map((stock) => stock.marker));
  const batches = new Map(),
    originals = new Set(),
    materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh || markers.has(object)) return;
    originals.add(object.geometry);
    materials.add(object.material);
  });
  root.traverseVisible((object) => {
    if (!object.isMesh || markers.has(object)) return;
    const { uuid, metadata, ...properties } = object.material.toJSON();
    const key = JSON.stringify(properties);
    if (!batches.has(key)) batches.set(key, { material: object.material, geometries: [] });
    let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    if (geometry.index) {
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      geometry = expanded;
    }
    batches.get(key).geometries.push(geometry);
  });
  root.clear();
  const retained = new Set();
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometries, false);
    batch.geometries.forEach((g) => g.dispose());
    root.add(new THREE.Mesh(geometry, batch.material));
    retained.add(batch.material);
  }
  markers.forEach((marker) => root.add(marker));
  originals.forEach((g) => g.dispose());
  materials.forEach((m) => {
    if (!retained.has(m)) m.dispose();
  });
  return {
    packagingAtlas,
    stocks,
    select(inventory) {
      const ids = new Set(inventory.map((p) => p.id));
      stocks.forEach((s) => (s.marker.visible = ids.has(s.part.id)));
    },
    project(camera, width = element.clientWidth, height = element.clientHeight) {
      for (const { node, position } of labels) {
        const p = position.clone().project(camera);
        node.hidden = !(p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 0.85);
        if (!node.hidden)
          node.style.transform = `translate(-50%,-50%) translate(${((p.x + 1) * width) / 2}px,${((1 - p.y) * height) / 2}px)`;
      }
    },
    dispose() {
      labels.forEach(({ node }) => node.remove());
    },
  };
}
