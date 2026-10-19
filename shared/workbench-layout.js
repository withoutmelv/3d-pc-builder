import { PACKAGES, packageKey, packageNames, isPacked } from './packages.js';
import { COVER_KEYS, COVER_LAYOUT, getSlotCovers } from './slot-covers.js';
import { STANDOFF_KEYS, STANDOFF_LAYOUT, getStandoffSlots } from './standoffs.js';
import { MOUNT_PARTS, getMounting } from './cooler-mount.js';
export const TABLE_LIMITS = Object.freeze({ x: 920, z: 560 });
export const FLOOR_Y = -462;
export const CART = Object.freeze({ x: -2350, z: 250, y: -80, width: 1800, depth: 800 });
export const CART_LAYOUT = Object.freeze({
  ioShield: { x: -3130, z: -60, rotation: 0, y: CART.y },
  stockMount0: { x: -3180, z: 50, rotation: 0, y: CART.y },
  stockMount1: { x: -3180, z: 220, rotation: 0, y: CART.y },
  coolerMount0: { x: -2490, z: 300, rotation: 0, y: CART.y },
  coolerMount1: { x: -2420, z: 300, rotation: 0, y: CART.y },
  board: { x: -2920, z: 100, rotation: 0, y: CART.y },
  cpu: { x: -3130, z: 510, rotation: 180, y: CART.y },
  memory0: { x: -2980, z: 510, rotation: 180, y: CART.y },
  memory1: { x: -2880, z: 510, rotation: 180, y: CART.y },
  cooler: { x: -2620, z: 100, rotation: 180, y: CART.y },
  coolerFan0: { x: -2770, z: 300, rotation: 180, y: CART.y },
  coolerFan1: { x: -2600, z: 300, rotation: 180, y: CART.y },
  storage: { x: -2620, z: 500, rotation: 0, y: CART.y },
  gpu: { x: -2330, z: 100, rotation: 0, y: CART.y },
  psu: { x: -2330, z: 480, rotation: 0, y: CART.y },
  case: { x: -1760, z: 240, rotation: 0, y: CART.y },
  panel: { x: -1760, z: 240, rotation: 0, y: CART.y },
});
export const FLOOR_LIMITS = Object.freeze({ x: 5500, z: 5500 });
export const DEFAULT_LAYOUT = Object.freeze({
  cooler: Object.freeze({ x: -250, z: -425, rotation: 180 }),
  board: Object.freeze({ x: -570, z: -108, rotation: 0 }),
  cpu: Object.freeze({ x: -690, z: 117, rotation: 180 }),
  memory0: Object.freeze({ x: -571, z: 117, rotation: 180 }),
  memory1: Object.freeze({ x: -475, z: 117, rotation: 180 }),
  panel: Object.freeze({ x: 350, z: 365, rotation: 0 }),
  case: Object.freeze({ x: 460, z: -70, rotation: 0 }),
});
export const EXTRA_LAYOUT = Object.freeze({
  ...STANDOFF_LAYOUT,
  ...COVER_LAYOUT,
  ioShield: { x: -850, z: 180, rotation: 0 },
  stockMount0: { x: -820, z: -410, rotation: 0 },
  stockMount1: { x: -740, z: -410, rotation: 0 },
  coolerMount0: { x: -110, z: -270, rotation: 0 },
  coolerMount1: { x: -30, z: -270, rotation: 0 },
  coolerFan0: { x: -350, z: -425, rotation: 180 },
  coolerFan1: { x: -150, z: -425, rotation: 180 },
  storage: { x: -520, z: -420, rotation: 0 },
  gpu: { x: 30, z: -420, rotation: 0 },
  psu: { x: 760, z: -410, rotation: 0 },
});
export const BENCH_POSE = Object.freeze({ x: -65, z: -34, rotation: 0 });
export const PART_FOOTPRINTS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(PACKAGES).map(([category, box]) => [
      packageKey(category),
      [box.size[0], box.size[2]],
    ]),
  ),
  slotCover0: [12, 40],
  slotCover1: [12, 40],
  ...Object.fromEntries(STANDOFF_KEYS.map((key) => [key, [10, 10]])),
  ioShield: [8, 148],
  stockMount0: [68, 16],
  stockMount1: [68, 16],
  coolerMount0: [68, 16],
  coolerMount1: [68, 16],
  coolerFan0: [40, 142],
  coolerFan1: [40, 142],
  storage: [80, 24],
  gpu: [348, 156],
  psu: [170, 88],
  cooler: [112, 140],
  board: [244, 305],
  cpu: [43, 43],
  memory0: [20, 136],
  memory1: [20, 136],
  panel: [458, 356],
  case: [484, 494],
});
const names = {
  ...packageNames,
  slotCover0: '下方槽位挡板',
  slotCover1: '上方槽位挡板',
  ...Object.fromEntries(STANDOFF_KEYS.map((key) => [key, '铜柱'])),
  ioShield: 'I/O 挡板',
  stockMount0: '上方原卡座',
  stockMount1: '下方原卡座',
  coolerMount0: '上方散热支架',
  coolerMount1: '下方散热支架',
  coolerFan0: '前侧散热风扇',
  coolerFan1: '中间散热风扇',
  storage: '磁盘',
  gpu: '显卡',
  psu: '电源',
  cooler: '散热器',
  board: '主板',
  cpu: 'CPU',
  memory0: '第一根内存',
  memory1: '第二根内存',
  panel: '侧板',
  case: '机箱',
};
const fixtures = [
  { name: '硅脂管位置', pose: { x: 765, z: -130, rotation: 0 }, size: [40, 110] },
  { name: '螺丝盘', pose: { x: 711, z: 336, rotation: 0 }, size: [167, 111] },
  { name: '螺丝刀位置', pose: { x: 765, z: 94, rotation: 0 }, size: [48, 162] },
];
function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
export function createLayout(state = {}) {
  if (state.room)
    return Object.fromEntries(
      Object.entries(state.layout ?? {}).map(([key, pose]) => [key, { ...pose }]),
    );
  const layout = Object.fromEntries(
    Object.entries(DEFAULT_LAYOUT).map(([part, pose]) => [
      part,
      {
        ...(state.layout?.[part] ??
          (part === 'board' && state.board && state.board !== 'tray' ? BENCH_POSE : pose)),
      },
    ]),
  );
  if (state.board && !state.layout?.cooler) {
    // Legacy saves may already occupy the new part's default parking spot.
    for (const pose of [
      DEFAULT_LAYOUT.cooler,
      ...Array.from({ length: 20 }, (_, i) => ({
        x: -1400 - i * 150,
        z: 0,
        y: FLOOR_Y,
        rotation: 180,
      })),
    ]) {
      try {
        layout.cooler = validateTablePlacement({ ...state, layout }, 'cooler', pose);
        break;
      } catch {
        /* Try another clear support position. */
      }
    }
  }
  for (const part of Object.keys(EXTRA_LAYOUT)) {
    if (state.layout?.[part]) layout[part] = { ...state.layout[part] };
  }
  return layout;
}
export function getPartPose(state, part) {
  ensure(Object.hasOwn(PART_FOOTPRINTS, part), '物品无效');
  if (MOUNT_PARTS[part]) return state.layout?.[part] ?? EXTRA_LAYOUT[part];
  if (part.startsWith('coolerFan')) return state.layout?.[part] ?? EXTRA_LAYOUT[part];
  if (!state.room && part === 'cooler' && !state.layout?.cooler) return createLayout(state).cooler;
  if (part === 'board' && state.board === 'case') {
    const chassis = getPartPose(state, 'case');
    const angle = (chassis.rotation * Math.PI) / 180;
    return {
      x: chassis.x - 104 * Math.cos(angle) - 63 * Math.sin(angle),
      z: chassis.z + 104 * Math.sin(angle) - 63 * Math.cos(angle),
      rotation: chassis.rotation,
      ...(Object.hasOwn(chassis, 'y') ? { y: chassis.y } : {}),
    };
  }
  return {
    ...(state.layout?.[part] ??
      (part === 'board' && state.board === 'bench'
        ? BENCH_POSE
        : (DEFAULT_LAYOUT[part] ?? EXTRA_LAYOUT[part]))),
  };
}
function rectangle(pose, size) {
  const angle = (pose.rotation * Math.PI) / 180;
  const axes = [
    [Math.cos(angle), -Math.sin(angle)],
    [Math.sin(angle), Math.cos(angle)],
  ];
  return { x: pose.x, z: pose.z, axes, half: size.map((value) => value / 2) };
}
function radius(rect, axis) {
  return rect.axes.reduce(
    (sum, direction, index) =>
      sum + rect.half[index] * Math.abs(direction[0] * axis[0] + direction[1] * axis[1]),
    0,
  );
}
function overlaps(a, b) {
  return [...a.axes, ...b.axes].every(
    (axis) =>
      Math.abs((a.x - b.x) * axis[0] + (a.z - b.z) * axis[1]) <
      radius(a, axis) + radius(b, axis) + 2,
  );
}
export function validatePartPose(part, pose) {
  ensure(Object.hasOwn(PART_FOOTPRINTS, part), '物品无效');
  ensure(
    pose &&
      typeof pose === 'object' &&
      !Array.isArray(pose) &&
      Object.keys(pose).every((key) => ['x', 'z', 'rotation', 'y'].includes(key)) &&
      ['x', 'z', 'rotation'].every(
        (key) => Object.hasOwn(pose, key) && Number.isFinite(pose[key]),
      ) &&
      (!Object.hasOwn(pose, 'y') || pose.y === 0 || pose.y === FLOOR_Y || pose.y === CART.y) &&
      pose.rotation >= 0 &&
      pose.rotation < 360,
    '物品位置和旋转角度无效',
  );
  const rect = rectangle(pose, PART_FOOTPRINTS[part]);
  // y is the supporting surface, before each model's own height offset.
  const floor = pose.y === FLOOR_Y;
  const cart = pose.y === CART.y;
  const limits = cart
    ? { x: CART.width / 2, z: CART.depth / 2 }
    : floor
      ? FLOOR_LIMITS
      : TABLE_LIMITS;
  ensure(
    Math.abs(pose.x - (cart ? CART.x : 0)) + radius(rect, [1, 0]) <= limits.x &&
      Math.abs(pose.z - (cart ? CART.z : 0)) + radius(rect, [0, 1]) <= limits.z,
    floor ? `${names[part]}超出房间范围，请向内移动` : `${names[part]}超出桌面边缘，请向内移动`,
  );
  if (floor)
    ensure(
      !overlaps(
        rect,
        rectangle({ x: 0, z: 0, rotation: 0 }, [TABLE_LIMITS.x * 2, TABLE_LIMITS.z * 2]),
      ),
      '这里是工作台占用的空间，请移到工作台周围的地面',
    );
  return { ...pose };
}
export function isLoose(state, part) {
  if (isPacked(state, part)) return false;
  if (part.startsWith('package-')) return Boolean(state.layout?.[part]);
  if (STANDOFF_KEYS.includes(part))
    return (
      Boolean(state.layout?.case) && getStandoffSlots(state)[STANDOFF_KEYS.indexOf(part)] === null
    );
  if (COVER_KEYS.includes(part))
    return (
      Boolean(state.layout?.[part]) && getSlotCovers(state)[COVER_KEYS.indexOf(part)] === 'tray'
    );
  if (part === 'ioShield') return Boolean(state.layout?.ioShield) && state.ioShield !== 'installed';
  if (MOUNT_PARTS[part]) {
    const { kind, index } = MOUNT_PARTS[part];
    return Boolean(state.layout?.[part]) && !getMounting(state)[kind][index];
  }
  if (part.startsWith('coolerFan'))
    return state.coolerFans?.[Number(part.at(-1))] === 'tray' && Boolean(state.layout?.[part]);
  if (state.room && !state.layout?.[part]) return false;
  if (part === 'psu' && state.power?.placed) return false;
  if (part === 'gpu' && state.graphics?.placed) return false;
  if (part === 'storage' && state.storage && state.storage !== 'tray') return false;
  if (Object.hasOwn(EXTRA_LAYOUT, part)) return Boolean(state.layout?.[part]);
  if (part === 'cooler') return !state.cooling?.placed;
  if (part === 'board') return state.board !== 'case';
  if (part === 'cpu') return state.cpu === 'tray';
  if (part.startsWith('memory')) return state.memory[Number(part.at(-1))] === 'tray';
  return part !== 'panel' || state.panelRemoved;
}
export function validateTablePlacement(state, part, pose) {
  const result = validatePartPose(part, pose);
  const moving = rectangle(result, PART_FOOTPRINTS[part]);
  if (state.room && result.y === FLOOR_Y)
    ensure(
      !overlaps(moving, rectangle({ ...CART, rotation: 0 }, [CART.width, CART.depth])),
      '这里是推车占用的空间',
    );
  for (const other of Object.keys(PART_FOOTPRINTS)) {
    if (other === part || !isLoose(state, other)) continue;
    const otherPose = getPartPose(state, other);
    if ((result.y ?? 0) !== (otherPose.y ?? 0)) continue;
    ensure(
      !overlaps(moving, rectangle(otherPose, PART_FOOTPRINTS[other])),
      `这里与${names[other]}重叠，请换一个空位置`,
    );
  }
  for (const fixture of fixtures) {
    if ((result.y ?? 0) !== (fixture.pose.y ?? 0)) continue;
    ensure(
      !overlaps(moving, rectangle(fixture.pose, fixture.size)),
      `这里与${fixture.name}重叠，请换一个空位置`,
    );
  }
  return result;
}
export function validateLayout(state) {
  if (state.layout === undefined && !state.room) return;
  ensure(
    state.layout &&
      typeof state.layout === 'object' &&
      !Array.isArray(state.layout) &&
      Object.keys(state.layout).every((part) => Object.hasOwn(PART_FOOTPRINTS, part)) &&
      (state.room ||
        Object.keys(DEFAULT_LAYOUT)
          .filter((part) => part !== 'cooler')
          .every((part) => Object.hasOwn(state.layout, part))),
    '工作区布局字段不完整或包含未知字段',
  );
  for (const part of Object.keys(state.layout)) {
    validatePartPose(part, state.layout[part]);
    if (isLoose(state, part)) validateTablePlacement(state, part, state.layout[part]);
  }
}
