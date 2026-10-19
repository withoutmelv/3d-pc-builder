import { PACKAGES, packageKey, packageCategory } from './packages.js';
import { compatibilityChecks } from './compatibility.js';
import { hasIntegratedIO } from './model-state.js';
import { COVER_KEYS, COVER_LAYOUT, getSlotCovers } from './slot-covers.js';
import { STANDOFF_KEYS, getStandoffSlots } from './standoffs.js';
import { MOUNT_PARTS, createMounting, getMounting, mountingSecure } from './cooler-mount.js';
import {
  createAssembly,
  validateAssembly,
  getCooling,
  getCoolerFans,
  getStorage,
  getGraphics,
  getPower,
} from './assembly.js';
import { CART, CART_LAYOUT, createLayout, validateTablePlacement } from './workbench-layout.js';

export const CATEGORY_PARTS = Object.freeze({
  cpu: ['cpu'],
  motherboard: ['board'],
  memory: ['memory0', 'memory1'],
  cooler: ['cooler'],
  case: ['case', 'panel'],
  storage: ['storage'],
  gpu: ['gpu'],
  psu: ['psu'],
});
export function createRoomAssembly(selection = {}, { boxed = false } = {}) {
  const assembly = { ...createAssembly(), room: true, layout: {} };
  for (const category of Object.keys(selection))
    for (const part of CATEGORY_PARTS[category] ?? [])
      assembly.layout[part] = { ...CART_LAYOUT[part] };
  if (selection.cooler) {
    assembly.coolerFans = ['tray', 'tray'];
    assembly.coolerFilm = true;
    for (const key of ['coolerFan0', 'coolerFan1']) assembly.layout[key] = { ...CART_LAYOUT[key] };
  }
  if (selection.motherboard && !hasIntegratedIO(selection)) {
    assembly.ioShield = 'tray';
    assembly.layout.ioShield = { ...CART_LAYOUT.ioShield };
  }
  if (selection.case) {
    assembly.standoffs = [true, true, true, true];
    assembly.slotCovers = ['locked', 'locked'];
    for (const key of COVER_KEYS) assembly.layout[key] = { ...COVER_LAYOUT[key] };
  }
  assembly.mounting = createMounting(Boolean(selection.motherboard));
  for (const [key, part] of Object.entries(MOUNT_PARTS))
    if (selection[part.kind === 'stock' ? 'motherboard' : 'cooler'])
      assembly.layout[key] = { ...CART_LAYOUT[key] };
  if (boxed) {
    assembly.packages = {};
    for (const category of Object.keys(selection)) addPackage(assembly, category);
  }
  return validateAssembly(assembly);
}
function addPackage(state, category) {
  const [x, z] = PACKAGES[category].position;
  state.packages[category] = 'closed';
  state.layout[packageKey(category)] = { x, z, y: CART.y, rotation: 0 };
}
export function canChangeStock(state, category) {
  if (state.packages?.[category] && state.layout?.[packageKey(category)]?.y !== CART.y)
    return false;
  const keys = CATEGORY_PARTS[category];
  if (state.frontPower && ['case', 'motherboard'].includes(category)) return false;
  if (!keys) return false;
  if (keys.every((key) => !state.layout?.[key]))
    return Boolean(state.room) || ['gpu', 'storage', 'psu'].includes(category);
  const cooling = getCooling(state);
  if (
    category === 'motherboard' &&
    state.ioShield !== undefined &&
    (state.ioShield === 'installed' || state.layout?.ioShield?.y !== CART.y)
  )
    return false;
  if (
    category === 'case' &&
    getStandoffSlots(state).some(
      (slot, i) =>
        slot === null &&
        state.layout?.[STANDOFF_KEYS[i]] &&
        state.layout[STANDOFF_KEYS[i]].y !== CART.y,
    )
  )
    return false;
  if (
    category === 'case' &&
    state.slotCovers &&
    getSlotCovers(state).some(
      (value, i) =>
        value === 'seated' || (value === 'tray' && state.layout?.[COVER_KEYS[i]]?.y !== CART.y),
    )
  )
    return false;
  if (category === 'case' && state.ioShield === 'installed') return false;
  if (
    category === 'motherboard' &&
    (!mountingSecure(state) || (state.mounting && getMounting(state).rails.some(Boolean)))
  )
    return false;
  if (state.mounting && ['motherboard', 'cooler'].includes(category)) {
    const kind = category === 'motherboard' ? 'stock' : 'rails';
    for (const [key, part] of Object.entries(MOUNT_PARTS)) {
      if (part.kind !== kind) continue;
      const placed = getMounting(state)[kind][part.index];
      if ((kind === 'rails' && placed) || (!placed && state.layout?.[key]?.y !== CART.y))
        return false;
    }
  }
  if (category === 'psu' && getPower(state).placed) return false;
  if (category === 'gpu' && getGraphics(state).placed) return false;
  if (category === 'storage' && getStorage(state) !== 'tray') return false;
  if (category === 'cpu' && state.cpu !== 'tray') return false;
  if (category === 'memory' && state.memory.some((v) => v !== 'tray')) return false;
  if (category === 'cooler' && cooling.placed) return false;
  if (
    category === 'cooler' &&
    state.coolerFans &&
    getCoolerFans(state).some(
      (v, i) => v !== 'tray' || state.layout?.[`coolerFan${i}`]?.y !== CART.y,
    )
  )
    return false;
  if (
    category === 'motherboard' &&
    (state.board === 'case' ||
      state.cpu !== 'tray' ||
      state.memory.some((v) => v !== 'tray') ||
      cooling.placed ||
      getStorage(state) !== 'tray' ||
      getGraphics(state).placed)
  )
    return false;
  if (
    category === 'case' &&
    (state.board === 'case' || state.panelRemoved || getPower(state).placed)
  )
    return false;
  return keys.filter((key) => key !== 'panel').every((key) => state.layout?.[key]?.y === CART.y);
}
export function changeStock(state, selection, category, id) {
  if (!canChangeStock(state, category)) throw new Error('请先拆下配件并放回推车，再更换或移除型号');
  const next = {
    ...state,
    room: true,
    layout: Object.fromEntries(
      Object.entries(createLayout(state)).map(([key, pose]) => [key, { ...pose }]),
    ),
  };
  if (state.packages) next.packages = { ...state.packages };
  if (state.unpackedParts)
    next.unpackedParts = state.unpackedParts.filter((part) => packageCategory(part) !== category);
  const chosen = { ...selection };
  if (['case', 'motherboard'].includes(category)) delete next.frontPower;
  if (category === 'storage') delete next.storagePressed;
  if (category === 'case') {
    delete next.slotCovers;
    for (const key of COVER_KEYS) delete next.layout[key];
    if (id) {
      next.slotCovers = ['locked', 'locked'];
      for (const key of COVER_KEYS) next.layout[key] = { ...COVER_LAYOUT[key] };
    }
    delete next.standoffs;
    delete next.standoffSlots;
    for (const key of STANDOFF_KEYS) delete next.layout[key];
    if (id) next.standoffs = [true, true, true, true];
  }
  if (category === 'cpu') next.cooling = { ...getCooling(state), paste: false };
  for (const [existingCategory, parts] of Object.entries(CATEGORY_PARTS))
    if (!selection[existingCategory]) for (const key of parts) delete next.layout[key];
  if (category === 'motherboard') {
    delete next.ioShield;
    delete next.layout.ioShield;
    if (id && !hasIntegratedIO({ motherboard: id })) {
      next.ioShield = 'tray';
      next.layout.ioShield = { ...CART_LAYOUT.ioShield };
    }
    next.graphics = { ...getGraphics(next), latchOpen: false };
    next.socketOpen = false;
    delete next.socketLeverOpen;
    next.memoryOpen = [false, false];
    next.board = 'tray';
  }
  if (category === 'cooler') {
    delete next.coolerFans;
    delete next.fanConnections;
    delete next.coolerFilm;
    delete next.coolerScrewDepths;
    for (const key of ['coolerFan0', 'coolerFan1']) delete next.layout[key];
    if (id) {
      next.coolerFans = ['tray', 'tray'];
      next.coolerFilm = true;
      for (const key of ['coolerFan0', 'coolerFan1']) next.layout[key] = { ...CART_LAYOUT[key] };
    }
  }
  if (['motherboard', 'cooler'].includes(category)) {
    next.mounting = Object.fromEntries(
      Object.entries(getMounting(state)).map(([key, values]) => [key, [...values]]),
    );
    const kind = category === 'motherboard' ? 'stock' : 'rails';
    next.mounting[kind] = [Boolean(id) && kind === 'stock', Boolean(id) && kind === 'stock'];
    next.mounting[kind === 'stock' ? 'stockScrews' : 'railScrews'] = Array(4).fill(
      Boolean(id) && kind === 'stock',
    );
    // Legacy saves have no physical rail inventory; introduce it when either owner changes.
    if (!state.mounting) {
      next.mounting.rails = [false, false];
      next.mounting.railScrews = Array(4).fill(false);
    }
    for (const [key, part] of Object.entries(MOUNT_PARTS)) {
      if (part.kind === kind) {
        delete next.layout[key];
        if (id) next.layout[key] = { ...CART_LAYOUT[key] };
      } else if (selection[part.kind === 'stock' ? 'motherboard' : 'cooler'] && !next.layout[key])
        next.layout[key] = { ...CART_LAYOUT[key] };
    }
  }
  if (next.packages) {
    delete next.packages[category];
    delete next.layout[packageKey(category)];
    if (id) addPackage(next, category);
  }
  const keys = CATEGORY_PARTS[category];
  for (const key of keys) delete next.layout[key];
  if (id) {
    chosen[category] = id;
    for (const key of keys) next.layout[key] = { ...CART_LAYOUT[key] };
    for (const key of keys)
      if (key !== 'panel' && !next.packages) validateTablePlacement(next, key, next.layout[key]);
  } else delete chosen[category];
  validateAssembly(next);
  return { assembly: next, selection: chosen };
}
export function validateRoomSelection(state, selection, catalogue) {
  validateAssembly(state);
  if (!state.room) return state;
  const parts = Object.fromEntries(
    Object.entries(selection).map(([category, id]) => {
      const part = catalogue.find((p) => p.id === id && p.category === category);
      if (!part) throw new Error('配件型号或分类无效');
      return [category, part];
    }),
  );
  for (const [category, keys] of Object.entries(CATEGORY_PARTS)) {
    if (keys.some((key) => Boolean(state.layout[key]) !== Boolean(parts[category])))
      throw new Error('货架清单与房间中的配件不一致');
  }
  const require = (valid, message) => {
    if (!valid) throw new Error(message);
  };
  if (getPower(state).placed) {
    require(parts.case?.specs.psuFormFactors?.includes(
      parts.psu?.specs.formFactor,
    ), '电源规格与机箱电源位不匹配');
    require(parts.psu?.dimensions[2] <= parts.case?.specs.maxPsuLength, '电源长度超过机箱限制');
  }
  if (getStorage(state) !== 'tray')
    require(parts.motherboard?.specs.storageInterfaces?.includes(
      parts.storage?.specs.interface,
    ), '磁盘接口与主板 M.2 插槽不匹配');
  const relevant = new Set();
  if (state.cpu !== 'tray') relevant.add('CPU_SOCKET');
  if (state.memory.some((v) => v !== 'tray')) relevant.add('MEMORY_TYPE');
  if (state.board === 'case') {
    relevant.add('BOARD_SIZE');
    if (getGraphics(state).placed) relevant.add('GPU_LENGTH');
    if (getCooling(state).placed && !state.panelRemoved) relevant.add('COOLER_HEIGHT');
  }
  for (const check of compatibilityChecks(parts)) {
    if (!relevant.has(check.code)) continue;
    require(check.status === 'pass', check.message +
      (check.code === 'COOLER_HEIGHT' ? ' 侧板无法合上，可保持侧板打开。' : ''));
  }
  return state;
}
