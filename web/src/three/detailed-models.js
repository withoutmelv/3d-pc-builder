import { isStockAvailable } from '../../../shared/stock-catalogue.js';
import * as THREE from 'three';
import { createSkuModel } from './sku-models.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Source files stay beside their Blender sources; Vite emits only these GLBs.
export const modelUrls = {
  motherboard: new URL('../../../assets/motherboard/motherboard.glb', import.meta.url).href,
  cpu: new URL('../../../assets/cpu/cpu-9800x3d.glb', import.meta.url).href,
  memory: new URL('../../../assets/ram/ram.glb', import.meta.url).href,
  storage: new URL('../../../assets/ssd/ssd.glb', import.meta.url).href,
  gpu: new URL('../../../assets/gpu/gpu.glb', import.meta.url).href,
  cooler: new URL('../../../assets/cooler/cooler.glb', import.meta.url).href,
  psu: new URL('../../../assets/psu/psu.glb', import.meta.url).href,
  case: new URL('../../../assets/case/case.glb', import.meta.url).href,
};
const sources = new Map();
let pending;
export function registerDetailedModel(category, scene) {
  scene.updateMatrixWorld(true);
  sources.set(category, scene);
}
export function loadDetailedModels() {
  pending ??= Promise.all(
    Object.entries(modelUrls).map(async ([category, url]) => {
      const gltf = await new GLTFLoader().loadAsync(url);
      registerDetailedModel(category, gltf.scene);
    }),
  ).catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}
export const hasDetailedModels = () => sources.size === Object.keys(modelUrls).length;
const mm = new THREE.Matrix4().makeScale(1000, 1000, 1000);
const transform = (rotation = [0, 0, 0], position = [0, 0, 0]) =>
  new THREE.Matrix4()
    .compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(1, 1, 1),
    )
    .multiply(mm);
const matches = (object, name) => {
  for (let node = object; node; node = node.parent) if (node.name === name) return true;
  return false;
};

// Bake static geometry by material, never the interactive parent transforms.
// Each instance owns its resources (shelf batching/ghost disposal cannot destroy another part).
function bake(category, matrix = mm, include = null, exclude = []) {
  const scene = sources.get(category);
  if (!scene) return null;
  const group = new THREE.Group(),
    batches = new Map();
  scene.traverse((object) => {
    if (
      !object.isMesh ||
      (include && !include.some((n) => matches(object, n))) ||
      exclude.some((n) => matches(object, n))
    )
      return;
    const source = object.material;
    let geometry = object.geometry
      .clone()
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, object.matrixWorld));
    if (geometry.index) {
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      geometry = expanded;
    }
    for (const key of Object.keys(geometry.attributes))
      if (!['position', 'normal'].includes(key)) geometry.deleteAttribute(key);
    if (!batches.has(source.uuid))
      batches.set(source.uuid, { material: source.clone(), geometries: [] });
    batches.get(source.uuid).geometries.push(geometry);
  });
  for (const { material, geometries } of batches.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    geometries.forEach((g) => g.dispose());
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.detailedModel = category;
  return group;
}
function pivot(category, name, position) {
  const group = bake(
    category,
    new THREE.Matrix4().makeTranslation(...position.map((v) => -v)).multiply(mm),
    [name],
  );
  group.position.set(...position);
  return group;
}
export function createDetailedBoard(part) {
  if (!sources.has('motherboard')) return null;
  const moving = [
    'Socket_LoadPlate',
    'Socket_Lever',
    'PCIe_Latch_1',
    'DIMM_Clip_A2',
    'DIMM_Clip_B2',
  ];
  const group = bake('motherboard', mm, null, [
    ...moving,
    'Cooler_Bracket_Upper',
    'Cooler_Bracket_Lower',
    'M2_Cover_1',
    'PCIe_1',
    ...(part?.id === 'board-a4'
      ? ['AM5_Socket', 'IO_Shroud', 'Chipset_Armor', 'M2_Cover_2', 'M2_Cover_3']
      : []),
    ...(part?.id === 'board-large' ? ['Chipset_Armor'] : []),
  ]);
  if (part?.id === 'board-a4') {
    const socket = new THREE.Mesh(
      new THREE.BoxGeometry(45, 3, 45),
      new THREE.MeshStandardMaterial({ color: '#414449' }),
    );
    socket.position.set(7, 2, -62);
    group.add(socket);
    const holes = [];
    for (let x = 0; x < 18; x++)
      for (let z = 0; z < 18; z++)
        holes.push(
          new THREE.CylinderGeometry(0.6, 0.6, 0.12, 5).translate(
            7 + (x - 8.5) * 2,
            3.56,
            -62 + (z - 8.5) * 2,
          ),
        );
    group.add(
      new THREE.Mesh(mergeGeometries(holes), new THREE.MeshBasicMaterial({ color: '#10151a' })),
    );
    holes.forEach((g) => g.dispose());
  }
  if (part?.id === 'board-large') {
    for (const [size, position] of [
      [
        [68, 2, 305],
        [-156, 0, 0],
      ],
      [
        [94, 10, 90],
        [-40, 7, 99],
      ],
      [
        [38, 16, 90],
        [-100, 9, -75],
      ],
    ]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        new THREE.MeshStandardMaterial({ color: part.color, metalness: 0.55, roughness: 0.45 }),
      );
      mesh.position.set(...position);
      group.add(mesh);
    }
  }
  group.userData.partId = part?.id;
  const cover = pivot('motherboard', moving[0], [7, 5, -96]);
  if (part?.id === 'board-a4') cover.visible = false;
  const lever = pivot('motherboard', moving[1], [38, 4, -95]);
  const gpuLatch = pivot('motherboard', moving[2], [34, 4, 30]);
  gpuLatch.position.x += 36;
  group.add(
    bake('motherboard', new THREE.Matrix4().makeTranslation(36, 0, 0).multiply(mm), ['PCIe_1']),
  );
  const latches = [75, 95].map((x, i) => [pivot('motherboard', moving[3 + i], [x, 4, 8])]);
  group.add(cover, lever, gpuLatch, ...latches.flat());
  return { group, cover, lever, gpuLatch, latches };
}
export function createDetailedCPU(part) {
  if (part?.id === 'cpu-a4') return createSkuModel(part);
  return bake('cpu', transform([0, 0, 0], [0, 0.66, 0]));
}
export function createDetailedMemory(part) {
  if (part?.id === 'ram-d4') return createSkuModel(part);
  // Original DIMM lies flat; stand it on the gold-contact edge along the board's Z axis.
  return bake('memory', transform([Math.PI / 2, 0, Math.PI / 2], [0, 20.505, 3.45]));
}
const coolerRotation = [0, Math.PI / 2, 0];
export function createDetailedCooler(includeFans = true, part) {
  if (part && isStockAvailable(part)) part = undefined;
  if (!sources.has('cooler')) return null;
  if (part?.specs?.height && includeFans) {
    const model = createDetailedCooler(false, part);
    for (const index of [0, 1]) {
      const fan = createDetailedFan(index);
      fan.position.set(index === 0 ? 68 : 0, index === 0 ? 53 : 31, 0);
      model.add(fan);
    }
    return model;
  }
  const model = bake(
    'cooler',
    transform(coolerRotation),
    includeFans
      ? [
          'cooler_Heatsink',
          'cooler_Coldplate',
          'cooler_Crossbar',
          'cooler_Fan_1',
          'cooler_Fan_2',
          'cooler_Wire_Clip_1_L',
          'cooler_Wire_Clip_1_R',
          'cooler_Wire_Clip_2_L',
          'cooler_Wire_Clip_2_R',
        ]
      : ['cooler_Heatsink', 'cooler_Coldplate', 'cooler_Crossbar'],
  );
  if (part?.specs?.height) {
    // Keep the cold plate, fasteners and detachable fans at their calibrated anchors.
    // Change the fin stack above them, instead of stretching mounting geometry.
    const bounds = new THREE.Box3().setFromObject(model);
    const height = part.specs.height;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const positions = o.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        if (y > 100) positions.setY(i, 100 + ((y - 100) * (height - 100)) / (bounds.max.y - 100));
      }
      positions.needsUpdate = true;
      o.geometry.computeVertexNormals();
      o.geometry.computeBoundingBox();
      o.geometry.computeBoundingSphere();
    });
    model.userData.partId = part.id;
  }
  return model;
}
export function createDetailedFan(index = 0) {
  if (!sources.has('cooler')) return null;
  const offset = index === 0 ? 68 : 0;
  const matrix = transform(coolerRotation, [-offset, -31, 0]);
  const group = bake('cooler', matrix, [`cooler_Fan_${index + 1}`]);
  const clips = new THREE.Group();
  for (const [i, side] of ['L', 'R'].entries()) {
    const z = i === 0 ? 60.5 : -60.5;
    const hinge = bake('cooler', new THREE.Matrix4().makeTranslation(0, 0, -z).multiply(matrix), [
      `cooler_Wire_Clip_${index + 1}_${side}`,
    ]);
    hinge.position.z = z;
    clips.add(hinge);
  }
  group.add(clips);
  group.userData.clips = clips;
  return group;
}
// Lay the case on its right side: rear faces -X, component side faces +Y.
const caseMatrix = new THREE.Matrix4().set(
  0,
  0,
  1000,
  0,
  -1000,
  0,
  0,
  117.5,
  0,
  -1000,
  0,
  245.75,
  0,
  0,
  0,
  1,
);
export function createDetailedCase({ standoffs = true, slotCovers = true } = {}) {
  const exclude = [
    'case_Side_Glass',
    'case_Lead_POWER_SW',
    'case_Lead_USB3',
    'case_Lead_USB_C',
    'case_Lead_HD_AUDIO',
  ];
  if (!standoffs)
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) exclude.push(`case_Standoff_${row}_${col}`);
  if (!slotCovers)
    exclude.push(
      'case_Slot_Cover_1',
      'case_Slot_Cover_2',
      'case_Slot_Cover_3',
      'case_Slot_Cover_4',
    );
  return bake('case', caseMatrix, null, exclude);
}
export function createDetailedPanel() {
  return bake('case', new THREE.Matrix4().makeTranslation(0, -232, 55).multiply(caseMatrix), [
    'case_Side_Glass',
  ]);
}
export function createDetailedStock(part) {
  // The single delivered set uses its original GLBs, not generated SKU variants.
  if (isStockAvailable(part)) part = { category: part.category };
  const sku = sources.has(part.category) ? createSkuModel(part) : null;
  if (sku) {
    // SKU shells differ; standardized interfaces keep the calibrated installation anchors.
    if (part.category === 'gpu') {
      sku.add(bake('gpu', transform([0, 0, 0], [0, 37.5, 0]), ['gpu_PCB_gold', 'gpu_IO_Bracket']));
      for (const { x, y, z, radius } of sku.userData.fanPositions) {
        const fan = bake('gpu', mm, ['gpu_Fan_1']);
        const bounds = new THREE.Box3().setFromObject(fan),
          center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const scale = (radius * 2) / Math.max(size.x, size.z);
        for (const mesh of fan.children) {
          mesh.geometry.translate(-center.x, -bounds.min.y, -center.z).scale(scale, scale, scale);
          if (mesh.material.color.getHexString() !== 'ffffff') continue;
          mesh.material.color.set(part.color);
        }
        fan.position.set(x, y, z);
        sku.add(fan);
      }
    }
    if (part.category === 'storage')
      sku.add(
        bake('storage', transform([0, 0, 0], [0, 1.1, 0]), ['ssd_Body_pcb', 'ssd_Body_gold']),
      );
    return sku;
  }
  switch (part.category) {
    case 'motherboard':
      return createDetailedBoard(part)?.group;
    case 'cpu':
      return createDetailedCPU(part);
    case 'memory':
      return createDetailedMemory(part);
    case 'cooler':
      return createDetailedCooler(true, part);
    case 'case':
      return createDetailedCase();
    case 'storage':
      return bake('storage', transform([0, 0, 0], [0, 1.1, 0]));
    case 'gpu':
      return bake('gpu', transform([0, 0, 0], [0, 37.5, 0]));
    case 'psu':
      return bake(
        'psu',
        new THREE.Matrix4().set(0, 0, 1000, 0, -1000, 0, 0, 75, 0, -1000, 0, 0, 0, 0, 0, 1),
      );
    default:
      return null;
  }
}

export function createDetailedSlotCover(index = 0) {
  if (!sources.has('case')) return null;
  // The existing two removal actions each carry a pair of adjacent cover plates.
  const group = bake('case', caseMatrix, [
    `case_Slot_Cover_${index * 2 + 1}`,
    `case_Slot_Cover_${index * 2 + 2}`,
  ]);
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  for (const mesh of group.children) mesh.geometry.translate(-center.x, -bounds.min.y, -center.z);
  return group;
}

export function createDetailedMount(stock = false) {
  if (!hasDetailedModels()) return null;
  if (stock) {
    const excluded = [];
    sources.get('motherboard').traverse((object) => {
      if (object.name.startsWith('Bracket_Screw_Upper')) excluded.push(object.name);
    });
    return bake(
      'motherboard',
      new THREE.Matrix4().makeTranslation(-7, -1, 110).multiply(mm),
      ['Cooler_Bracket_Upper'],
      excluded,
    );
  }
  return bake('cooler', transform(coolerRotation, [0, 0, 45]), [
    'cooler_AM5_Rail_1',
    'cooler_Spacer_1_27',
    'cooler_Spacer_1_-27',
  ]);
}
