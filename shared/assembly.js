import { validatePackages, isPacked, releasePackageItem } from './packages.js';
import { COVER_KEYS, getSlotCovers, gpuBayOpen } from './slot-covers.js';
import { STANDOFF_KEYS, STANDOFF_LAYOUT, getStandoffs, getStandoffSlots } from './standoffs.js';
export { getStandoffs, getStandoffSlots } from './standoffs.js';
import {
  MOUNT_PARTS,
  getMounting,
  mountingSecure,
  validateMounting,
  changeMounting,
} from './cooler-mount.js';
import { POWER_CABLES, getWiring } from './power-wiring.js';
import {
  BENCH_POSE,
  EXTRA_LAYOUT,
  createLayout,
  validateLayout,
  validateTablePlacement,
} from './workbench-layout.js';
export {
  DEFAULT_LAYOUT,
  TABLE_LIMITS,
  FLOOR_Y,
  FLOOR_LIMITS,
  PART_FOOTPRINTS,
  getPartPose,
  validateTablePlacement,
} from './workbench-layout.js';

export const KIT_SELECTION = Object.freeze({
  case: 'case-air',
  motherboard: 'board-a5',
  cpu: 'cpu-a5',
  memory: 'ram-d5',
  cooler: 'cooler-air',
});

export const getPower = (state) =>
  state.power ?? { placed: false, screws: [false, false, false, false] };

export const getGraphics = (state) =>
  state.graphics ?? { placed: false, latchOpen: false, screwed: false };

export const getStorage = (state) => state.storage ?? 'tray';
export const getStoragePressed = (state) => state.storagePressed ?? getStorage(state) === 'locked';
export const getCoolerScrewDepths = (state) =>
  state.coolerScrewDepths ?? getCooling(state).screws.map((fixed) => (fixed ? 3 : 0));

export const getCoolerFans = (state) => state.coolerFans ?? ['locked', 'locked'];
export const getFanConnections = (state) =>
  state.fanConnections ?? [getCooling(state).fanConnected, getCooling(state).fanConnected];

// Older saves moved the lever and cover together.
export const getSocketLeverOpen = (state) => state.socketLeverOpen ?? state.socketOpen;

export function getCooling(state) {
  return (
    state.cooling ?? { placed: false, paste: false, screws: [false, false], fanConnected: false }
  );
}

export function createAssembly(selection = {}) {
  return {
    version: 1,
    storage: 'tray',
    graphics: getGraphics({}),
    power: getPower({}),
    wiring: getWiring({}),
    cooling: getCooling({}),
    board: 'tray',
    cpu: 'tray',
    memory: ['tray', 'tray'],
    memorySlots: [null, null],
    socketOpen: false,
    memoryOpen: [false, false],
    panelRemoved: false,
    screws: [false, false, false, false],
    layout: {
      ...createLayout(),
      ...Object.fromEntries(
        Object.entries(EXTRA_LAYOUT)
          .filter(([part]) => selection[part])
          .map(([part, pose]) => [part, { ...pose }]),
      ),
    },
  };
}
function requireState(condition, message) {
  if (!condition) throw new Error(message);
}
const arrayOf = (value, length, check) =>
  Array.isArray(value) && value.length === length && Array.from(value).every(check);

export function getMemorySlot(state, partIndex) {
  if (
    !Number.isInteger(partIndex) ||
    partIndex < 0 ||
    partIndex > 1 ||
    state.memory[partIndex] === 'tray'
  )
    return -1;
  return state.memorySlots === undefined ? partIndex : (state.memorySlots[partIndex] ?? -1);
}

export function getMemoryPart(state, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 1) return -1;
  return state.memory.findIndex((_, partIndex) => getMemorySlot(state, partIndex) === slotIndex);
}

export function validateAssembly(state) {
  const keys = [
    'version',
    'board',
    'cpu',
    'memory',
    'socketOpen',
    'memoryOpen',
    'panelRemoved',
    'screws',
  ];
  requireState(
    state &&
      typeof state === 'object' &&
      !Array.isArray(state) &&
      keys.every((key) => Object.hasOwn(state, key)) &&
      Object.keys(state).every(
        (key) =>
          keys.includes(key) ||
          key === 'packages' ||
          key === 'unpackedParts' ||
          key === 'layout' ||
          key === 'memorySlots' ||
          key === 'socketLeverOpen' ||
          key === 'cooling' ||
          key === 'coolerFans' ||
          key === 'fanConnections' ||
          key === 'mounting' ||
          key === 'ioShield' ||
          key === 'standoffs' ||
          key === 'slotCovers' ||
          key === 'standoffSlots' ||
          key === 'coolerFilm' ||
          key === 'coolerScrewDepths' ||
          key === 'room' ||
          key === 'storage' ||
          key === 'storagePressed' ||
          key === 'graphics' ||
          key === 'power' ||
          key === 'wiring' ||
          key === 'frontPower',
      ),
    '装配进度字段不完整或包含未知字段',
  );
  requireState(state.version === 1, '不支持此装配进度版本');
  if (state.slotCovers !== undefined) {
    requireState(
      arrayOf(state.slotCovers, 2, (v) => ['tray', 'seated', 'locked'].includes(v)),
      '槽位挡板状态无效',
    );
    requireState(
      Boolean(state.layout?.case) && COVER_KEYS.every((key) => Boolean(state.layout?.[key])),
      '槽位挡板需要机箱和摆放位置',
    );
    requireState(
      state.board !== 'case' || !getGraphics(state).placed || gpuBayOpen(state),
      '槽位挡板挡住显卡开口',
    );
  } else
    requireState(
      COVER_KEYS.every((key) => !state.layout?.[key]),
      '槽位挡板缺少状态',
    );
  if (state.ioShield !== undefined) {
    requireState(['tray', 'installed'].includes(state.ioShield), 'I/O 挡板状态无效');
    requireState(
      Boolean(state.layout?.ioShield && state.layout?.board),
      '挡板需要对应主板及摆放位置',
    );
    requireState(state.ioShield !== 'installed' || Boolean(state.layout?.case), '挡板需要机箱');
  } else requireState(!state.layout?.ioShield, '挡板缺少装配状态');
  if (state.standoffs !== undefined) {
    requireState(
      arrayOf(state.standoffs, 4, (value) => typeof value === 'boolean'),
      '铜柱状态必须为四个布尔值',
    );
    requireState(Boolean(state.layout?.case), '铜柱需要对应机箱');
    requireState(state.board !== 'case' || state.standoffs.every(Boolean), '主板下方缺少铜柱支撑');
  }
  if (state.standoffSlots !== undefined) {
    requireState(
      arrayOf(
        state.standoffSlots,
        4,
        (slot) => slot === null || (Number.isInteger(slot) && slot >= 0 && slot < 4),
      ),
      '铜柱孔位无效',
    );
    const occupied = state.standoffSlots.filter((slot) => slot !== null);
    requireState(new Set(occupied).size === occupied.length, '同一孔位不能安装两颗铜柱');
    requireState(
      Boolean(state.layout?.case) &&
        state.standoffs !== undefined &&
        getStandoffs(state).every((installed, i) => installed === occupied.includes(i)),
      '铜柱与孔位状态不一致',
    );
  }
  for (const key of STANDOFF_KEYS)
    requireState(!state.layout?.[key] || Boolean(state.layout.case), '铜柱需要对应机箱');
  requireState(['tray', 'bench', 'case'].includes(state.board), '主板位置无效');
  requireState(['tray', 'seated', 'locked'].includes(state.cpu), 'CPU 安装状态无效');
  requireState(
    arrayOf(state.memory, 2, (value) => ['tray', 'seated', 'locked'].includes(value)),
    '需要两根内存的有效安装状态',
  );
  requireState(
    typeof state.socketOpen === 'boolean' &&
      typeof state.panelRemoved === 'boolean' &&
      arrayOf(state.memoryOpen, 2, (value) => typeof value === 'boolean') &&
      arrayOf(state.screws, 4, (value) => typeof value === 'boolean'),
    '扣具、侧板和固定点状态必须是布尔值',
  );
  requireState(state.cpu !== 'locked' || !state.socketOpen, 'CPU 锁定时压盖必须关闭');
  requireState(
    !Object.hasOwn(state, 'socketLeverOpen') || typeof state.socketLeverOpen === 'boolean',
    'CPU 压杆状态必须是布尔值',
  );
  const leverOpen = getSocketLeverOpen(state);
  requireState(!state.socketOpen || leverOpen, '打开压盖前必须释放 CPU 压杆');
  requireState(state.cpu !== 'locked' || !leverOpen, 'CPU 锁定时压杆必须扣紧');
  requireState(state.cpu !== 'seated' || leverOpen, 'CPU 尚未锁定时压杆必须释放');
  const memorySlots =
    state.memorySlots === undefined
      ? state.memory.map((status, index) => (status === 'tray' ? null : index))
      : state.memorySlots;
  requireState(
    arrayOf(memorySlots, 2, (slot) => slot === null || slot === 0 || slot === 1),
    '内存插槽映射必须为两个空值或有效槽位',
  );
  const occupiedSlots = memorySlots.filter((slot) => slot !== null);
  requireState(
    new Set(occupiedSlots).size === occupiedSlots.length,
    '一个内存插槽不能被两根内存同时占用',
  );
  state.memory.forEach((status, partIndex) => {
    const slot = memorySlots[partIndex];
    requireState((status === 'tray') === (slot === null), '内存安装状态与插槽映射不一致');
    requireState(status !== 'locked' || !state.memoryOpen[slot], '内存锁定时卡扣必须关闭');
    requireState(status !== 'seated' || state.memoryOpen[slot], '内存尚未锁定时卡扣必须打开');
  });
  requireState(
    state.board === 'case' || state.screws.every((value) => !value),
    '主板未在机箱内，不能存在已固定螺丝',
  );
  const power = getPower(state);
  requireState(
    power &&
      typeof power === 'object' &&
      !Array.isArray(power) &&
      Object.keys(power).length === 2 &&
      typeof power.placed === 'boolean' &&
      arrayOf(power.screws, 4, (v) => typeof v === 'boolean'),
    '电源安装状态无效',
  );
  requireState(power.placed || !power.screws.some(Boolean), '电源未落位，不能固定螺丝');
  requireState(!power.placed || Boolean(state.layout?.psu), '安装电源前需从配件区选择电源');
  const graphics = getGraphics(state);
  requireState(
    graphics &&
      typeof graphics === 'object' &&
      !Array.isArray(graphics) &&
      Object.keys(graphics).length === 3 &&
      ['placed', 'latchOpen', 'screwed'].every((key) => typeof graphics[key] === 'boolean'),
    '显卡安装状态无效',
  );
  requireState(!graphics.placed || Boolean(state.layout?.gpu), '安装显卡前需从货架选择显卡');
  requireState(
    !graphics.screwed || (graphics.placed && !graphics.latchOpen && state.board === 'case'),
    '显卡挡板固定前需入箱并锁定卡扣',
  );
  if (state.frontPower !== undefined) {
    requireState(typeof state.frontPower === 'boolean', '开机键接线状态无效');
    requireState(
      !state.frontPower || Boolean(state.layout?.case && state.layout?.board),
      '开机键接线需要机箱和主板',
    );
  }
  const wiring = getWiring(state);
  requireState(
    wiring &&
      typeof wiring === 'object' &&
      !Array.isArray(wiring) &&
      Object.keys(wiring).length === 3 &&
      Object.keys(POWER_CABLES).every((key) => typeof wiring[key] === 'boolean'),
    '供电接线状态无效',
  );
  requireState(
    !Object.values(wiring).some(Boolean) || (power.placed && state.board === 'case'),
    '接线前需将电源和主板放入机箱',
  );
  requireState(!wiring.gpu || graphics.placed, '显卡供电线需要已安装的显卡');
  const storage = getStorage(state);
  requireState(['tray', 'seated', 'locked'].includes(storage), '磁盘安装状态无效');
  if (state.storagePressed !== undefined) {
    requireState(typeof state.storagePressed === 'boolean', 'M.2 下压状态无效');
    requireState(storage !== 'tray' || !state.storagePressed, '未插入的磁盘不能处于下压状态');
    requireState(storage !== 'locked' || state.storagePressed, '已固定的磁盘必须压平');
  }
  requireState(storage === 'tray' || Boolean(state.layout?.storage), '安装磁盘前需从货架选择磁盘');
  const cooling = getCooling(state);
  requireState(
    cooling &&
      typeof cooling === 'object' &&
      !Array.isArray(cooling) &&
      Object.keys(cooling).length === 4 &&
      ['placed', 'paste', 'fanConnected'].every((key) => typeof cooling[key] === 'boolean') &&
      arrayOf(cooling.screws, 2, (value) => typeof value === 'boolean'),
    '散热器状态无效',
  );
  requireState(!cooling.paste || !state.room || Boolean(state.layout?.cpu), '硅脂需要对应的 CPU');
  requireState(
    !cooling.placed || (state.cpu === 'locked' && cooling.paste),
    '散热器需要已锁定且涂好硅脂的 CPU',
  );
  requireState(
    cooling.placed || (!cooling.screws.some(Boolean) && !cooling.fanConnected),
    '散热器未落位，不能固定或接线',
  );
  requireState(
    state.coolerFilm === undefined || typeof state.coolerFilm === 'boolean',
    '保护膜状态无效',
  );
  const depths = getCoolerScrewDepths(state);
  requireState(
    !Object.hasOwn(state, 'coolerScrewDepths') || Array.isArray(state.coolerScrewDepths),
    '散热器螺丝深度无效',
  );
  requireState(
    arrayOf(depths, 2, (v) => Number.isInteger(v) && v >= 0 && v <= 3),
    '散热器螺丝深度无效',
  );
  requireState(
    depths.every((v, i) => cooling.screws[i] === (v === 3)),
    '散热器螺丝状态不一致',
  );
  requireState(cooling.placed || depths.every((v) => v === 0), '散热器未落位，不能拧入螺丝');
  if (state.room && !state.layout?.cooler)
    requireState(
      state.coolerFilm === undefined && state.coolerScrewDepths === undefined,
      '请先选择散热器',
    );
  const fans = getCoolerFans(state);
  requireState(
    !Object.hasOwn(state, 'coolerFans') || Array.isArray(state.coolerFans),
    '散热风扇状态无效',
  );
  requireState(
    arrayOf(fans, 2, (v) => ['tray', 'seated', 'locked'].includes(v)),
    '散热风扇状态无效',
  );
  const connections = getFanConnections(state);
  requireState(
    !Object.hasOwn(state, 'fanConnections') || Array.isArray(state.fanConnections),
    '风扇接线状态无效',
  );
  requireState(
    arrayOf(connections, 2, (v) => typeof v === 'boolean'),
    '风扇接线状态无效',
  );
  requireState(connections.some(Boolean) === cooling.fanConnected, '风扇接线状态不一致');
  requireState(
    connections.every((connected, i) => !connected || fans[i] === 'locked'),
    '接线前需扣紧对应风扇',
  );
  fans.forEach((status, i) => {
    requireState(
      status !== 'tray' || Boolean(state.layout?.[`coolerFan${i}`]),
      '未安装的风扇需要有效摆放位置',
    );
  });
  if (state.room && !state.layout?.cooler)
    requireState(
      state.coolerFans === undefined && !state.layout?.coolerFan0 && !state.layout?.coolerFan1,
      '请先选择散热器再操作风扇',
    );
  requireState(state.room === undefined || state.room === true, '房间模式无效');
  if (state.room) {
    const has = (part) => Boolean(state.layout?.[part]);
    requireState(
      has('board') ||
        (state.board === 'tray' &&
          !state.socketOpen &&
          !leverOpen &&
          !state.memoryOpen.some(Boolean) &&
          state.cpu === 'tray' &&
          state.memory.every((v) => v === 'tray') &&
          !cooling.placed &&
          storage === 'tray' &&
          !graphics.placed &&
          !graphics.latchOpen),
      '请先从货架选择主板',
    );
    requireState(has('cpu') || state.cpu === 'tray', '请先从货架选择 CPU');
    requireState(has('memory0') || state.memory.every((v) => v === 'tray'), '请先从货架选择内存');
    requireState(
      has('case') || (state.board !== 'case' && !state.panelRemoved && !power.placed),
      '请先从货架选择机箱',
    );
    requireState(has('cooler') || !cooling.placed, '请先从货架选择散热器');
  }
  validateMounting(state);
  validatePackages(state);
  validateLayout(state);
  return state;
}
function boardAccessible(state) {
  requireState(state.board !== 'case' || state.panelRemoved, '请先打开机箱侧板，才能操作内部配件');
}
function attachedPartsSecure(state) {
  requireState(mountingSecure(state), '支架尚未固定，请拧紧或取下后再搬动');
  requireState(
    !getGraphics(state).placed || !getGraphics(state).latchOpen,
    '显卡卡扣尚未锁定，请先关闭卡扣或取下显卡',
  );
  requireState(
    state.cpu !== 'seated' &&
      state.memory.every((value) => value !== 'seated') &&
      (!getCooling(state).placed || getCooling(state).screws.every(Boolean)) &&
      (!getCooling(state).placed || !getCoolerFans(state).includes('seated')) &&
      getStorage(state) !== 'seated',
    '配件尚未锁定，请先固定 CPU、内存及散热器，或将它们取出',
  );
}
function boardMovable(state) {
  requireState(!state.frontPower, '请先拔下 POWER SW 开机键线');
  requireState(!Object.values(getWiring(state)).some(Boolean), '请先拔下主板、CPU 和显卡供电线');
  boardAccessible(state);
  requireState(!getGraphics(state).screwed, '请先松开显卡挡板螺丝');
  requireState(
    state.screws.every((value) => !value),
    '请先卸下所有主板固定螺丝',
  );
  attachedPartsSecure(state);
}

export function transitionAssembly(state, action) {
  validateAssembly(state);
  requireState(action && typeof action.type === 'string', '装配操作无效');
  const next = {
    ...state,
    storage: getStorage(state),
    wiring: { ...getWiring(state) },
    graphics: { ...getGraphics(state) },
    power: { ...getPower(state), screws: [...getPower(state).screws] },
    cooling: { ...getCooling(state), screws: [...getCooling(state).screws] },
    memory: [...state.memory],
    memorySlots: state.memory.map((_, partIndex) => {
      const slot = getMemorySlot(state, partIndex);
      return slot < 0 ? null : slot;
    }),
    memoryOpen: [...state.memoryOpen],
    screws: [...state.screws],
    layout: createLayout(state),
  };
  if (action.unpack) releasePackageItem(next, action.unpack);
  const index = (length) => {
    requireState(
      Number.isInteger(action.index) && action.index >= 0 && action.index < length,
      '安装位置无效',
    );
    return action.index;
  };
  const ensureMountLayouts = () => {
    for (const [key, part] of Object.entries(MOUNT_PARTS)) {
      if (
        (!next.room || next.layout[part.kind === 'stock' ? 'board' : 'cooler']) &&
        !next.layout[key]
      )
        next.layout[key] = { ...EXTRA_LAYOUT[key] };
    }
  };
  const placeOnTable = (part, pose) => {
    requireState(
      !next.room ||
        Boolean(next.layout[part]) ||
        (part.startsWith('coolerFan') && Boolean(next.layout.cooler)) ||
        (STANDOFF_KEYS.includes(part) && Boolean(next.layout.case)) ||
        (MOUNT_PARTS[part] &&
          Boolean(next.layout[MOUNT_PARTS[part].kind === 'stock' ? 'board' : 'cooler'])),
      '请先从货架选择此配件',
    );
    if (MOUNT_PARTS[part]) {
      const { kind, index } = MOUNT_PARTS[part];
      if (getMounting(next)[kind][index]) {
        next.mounting = changeMounting(next, { type: 'mount-remove', part });
        ensureMountLayouts();
      }
    }
    if (STANDOFF_KEYS.includes(part)) {
      requireState(Boolean(next.layout.case), '请先选择机箱');
      const i = STANDOFF_KEYS.indexOf(part);
      const slots = [...getStandoffSlots(next)];
      if (slots[i] !== null) {
        requireState(next.panelRemoved, '请先打开机箱侧板');
        requireState(next.board !== 'case', '主板遮挡铜柱，请先取出主板');
      }
      slots[i] = null;
      next.standoffSlots = slots;
      next.standoffs = STANDOFF_KEYS.map((_, hole) => slots.includes(hole));
      next.layout[part] = validateTablePlacement(next, part, pose);
      return;
    }
    if (COVER_KEYS.includes(part)) {
      const i = COVER_KEYS.indexOf(part);
      requireState(next.slotCovers !== undefined, '请先选择带槽位挡板的机箱');
      requireState(getSlotCovers(next)[i] !== 'locked', '请先松开槽位挡板螺丝');
      if (getSlotCovers(next)[i] !== 'tray') requireState(next.panelRemoved, '请先打开机箱侧板');
      next.slotCovers = [...getSlotCovers(next)];
      next.slotCovers[i] = 'tray';
      next.layout[part] = validateTablePlacement(next, part, pose);
      return;
    }
    switch (part) {
      case 'ioShield':
        requireState(next.ioShield !== undefined, '请先选择带独立挡板的主板');
        if (next.ioShield === 'installed') {
          requireState(next.panelRemoved, '请先打开机箱侧板');
          requireState(next.board !== 'case', '主板接口挡住了挡板，请先取出主板');
        }
        next.ioShield = 'tray';
        break;
      case 'stockMount0':
      case 'stockMount1':
      case 'coolerMount0':
      case 'coolerMount1':
        break;
      case 'coolerFan0':
      case 'coolerFan1': {
        if (next.cooling.placed) boardAccessible(next);
        const i = Number(part.at(-1));
        requireState(!getFanConnections(next)[i], '请先拔下这只风扇的线');
        requireState(getCoolerFans(next)[i] !== 'locked', '请先松开风扇钢丝扣');
        next.coolerFans = [...getCoolerFans(next)];
        next.coolerFans[i] = 'tray';
        break;
      }
      case 'storage':
        requireState(Boolean(next.layout.storage), '请先从配件区选择磁盘');
        requireState(next.storage !== 'locked', '请先松开 M.2 固定螺丝');
        if (next.storage === 'seated') boardAccessible(next);
        next.storage = 'tray';
        next.storagePressed = false;
        break;
      case 'gpu':
        requireState(Boolean(next.layout.gpu), '请先从配件区选择显卡');
        if (next.graphics.placed) {
          requireState(!next.wiring.gpu, '请先拔下显卡供电线');
          boardAccessible(next);
          requireState(!next.graphics.screwed, '请先松开显卡挡板螺丝');
          requireState(next.graphics.latchOpen, '请先打开 PCIe 卡扣');
          next.graphics.placed = false;
        }
        break;
      case 'psu':
        requireState(Boolean(next.layout[part]), '请先从配件区选择此配件');
        if (next.power.placed) {
          requireState(!Object.values(next.wiring).some(Boolean), '请先拔下全部供电线');
          requireState(next.panelRemoved, '请先打开机箱侧板');
          requireState(!next.power.screws.some(Boolean), '请先松开全部电源固定螺丝');
          next.power.placed = false;
        }
        break;
      case 'cooler':
        requireState(!getCoolerFans(next).includes('seated'), '风扇尚未扣紧，请先固定或取下风扇');
        if (next.cooling.placed) {
          boardAccessible(next);
          requireState(!next.cooling.fanConnected, '请先拔下散热器风扇线');
          requireState(!getCoolerScrewDepths(next).some(Boolean), '请先松开散热器固定螺丝');
          next.cooling.placed = false;
          next.cooling.paste = false;
        }
        break;
      case 'board':
        boardMovable(next);
        next.board = 'bench';
        break;
      case 'cpu':
        if (next.cpu !== 'tray') {
          boardAccessible(next);
          requireState(next.cpu === 'seated' && next.socketOpen, '请先打开压盖，再取出 CPU');
          next.cpu = 'tray';
        }
        break;
      case 'memory0':
      case 'memory1': {
        const i = Number(part.at(-1));
        if (next.memory[i] !== 'tray') {
          boardAccessible(next);
          requireState(
            next.memory[i] === 'seated' && next.memoryOpen[getMemorySlot(next, i)],
            '请先打开卡扣，再取出内存',
          );
          next.memory[i] = 'tray';
          next.memorySlots[i] = null;
        }
        break;
      }
      case 'panel':
        next.panelRemoved = true;
        break;
      case 'case':
        requireState(
          !next.frontPower || next.board === 'case',
          '机箱仍连着外部主板，请先拔下 POWER SW 开机键线',
        );
        requireState(!getSlotCovers(next).includes('seated'), '槽位挡板尚未固定，请先拧紧或取下');
        requireState(
          !next.power.placed || next.power.screws.every(Boolean),
          '电源尚未固定，请先拧紧全部螺丝或取下电源',
        );
        if (next.board === 'case') {
          requireState(
            next.screws.every(Boolean),
            '机箱内的主板尚未固定，请先旋紧全部固定螺丝，或取出主板',
          );
          attachedPartsSecure(next);
        }
        break;
      default:
        throw new Error('物品无效');
    }
    next.layout[part] = validateTablePlacement(next, part, pose);
  };
  switch (action.type) {
    case 'slot-cover-place':
    case 'slot-cover-screw':
    case 'slot-cover-unscrew': {
      requireState(next.slotCovers !== undefined, '请先选择带槽位挡板的机箱');
      requireState(next.panelRemoved, '请先打开机箱侧板');
      requireState(next.board !== 'case' || !next.graphics.placed, '显卡占用开口，请先取出显卡');
      const i = index(2);
      const from =
        action.type === 'slot-cover-place'
          ? 'tray'
          : action.type === 'slot-cover-screw'
            ? 'seated'
            : 'locked';
      requireState(getSlotCovers(next)[i] === from, '请先放入挡板，或确认固定螺丝状态');
      next.slotCovers = [...getSlotCovers(next)];
      next.slotCovers[i] = action.type === 'slot-cover-screw' ? 'locked' : 'seated';
      break;
    }
    case 'standoff-install':
    case 'standoff-remove': {
      requireState(Boolean(next.layout.case), '请先选择机箱');
      requireState(next.panelRemoved, '请先打开机箱侧板');
      requireState(next.board !== 'case', '主板遮挡铜柱，请先取出主板');
      const i = index(4);
      const installing = action.type === 'standoff-install';
      requireState(
        getStandoffs(next)[i] !== installing,
        installing ? '此孔位已装有铜柱' : '此孔位没有铜柱',
      );
      const slots = [...getStandoffSlots(next)];
      const partIndex = installing
        ? (action.partIndex ?? slots.findIndex((slot) => slot === null))
        : slots.indexOf(i);
      requireState(Number.isInteger(partIndex) && partIndex >= 0 && partIndex < 4, '铜柱编号无效');
      if (!installing) {
        placeOnTable(
          STANDOFF_KEYS[partIndex],
          next.layout[STANDOFF_KEYS[partIndex]] ?? STANDOFF_LAYOUT[STANDOFF_KEYS[partIndex]],
        );
      } else {
        slots[partIndex] = i;
        next.standoffSlots = slots;
        next.standoffs = STANDOFF_KEYS.map((_, hole) => slots.includes(hole));
      }
      break;
    }
    case 'io-shield-install':
      requireState(next.ioShield === 'tray' && Boolean(next.layout.case), '请先选择主板挡板和机箱');
      requireState(next.panelRemoved, '请先打开机箱侧板');
      requireState(next.board !== 'case', '主板接口挡住了挡板，请先取出主板');
      next.ioShield = 'installed';
      break;
    case 'cooler-fan-place':
    case 'cooler-fan-clip':
    case 'cooler-fan-unclip': {
      requireState(!next.room || Boolean(next.layout.cooler), '请先选择散热器');
      if (next.cooling.placed) boardAccessible(next);
      const i = index(2);
      requireState(!getFanConnections(next)[i], '请先拔下这只风扇的线');
      const from =
        action.type === 'cooler-fan-place'
          ? 'tray'
          : action.type === 'cooler-fan-clip'
            ? 'seated'
            : 'locked';
      requireState(
        getCoolerFans(next)[i] === from,
        from === 'tray'
          ? '风扇已经落位'
          : from === 'seated'
            ? '请先将风扇贴到散热塔侧面'
            : '钢丝扣尚未扣紧',
      );
      next.coolerFans = [...getCoolerFans(next)];
      next.coolerFans[i] = action.type === 'cooler-fan-clip' ? 'locked' : 'seated';
      break;
    }
    case 'cable-connect': {
      if (action.cable === 'frontPower' || action.target === 'frontPower') {
        requireState(
          action.cable === 'frontPower' && action.target === 'frontPower',
          '接口不匹配，请将开机键线接到 POWER SW 针脚',
        );
        requireState(Boolean(next.layout.case && next.layout.board), '开机键接线需要机箱和主板');
        requireState(next.panelRemoved, '请先打开机箱侧板');
        requireState(!next.frontPower, '开机键线已连接');
        next.frontPower = true;
        break;
      }

      requireState(
        Object.hasOwn(POWER_CABLES, action.cable) && Object.hasOwn(POWER_CABLES, action.target),
        '供电线或接口无效',
      );
      requireState(action.cable === action.target, '线缆与接口不匹配，请使用对应供电线');
      requireState(next.panelRemoved, '请先打开机箱侧板');
      requireState(next.power.placed && next.board === 'case', '接线前需将电源和主板放入机箱');
      if (action.target === 'gpu') requireState(next.graphics.placed, '请先安装显卡');
      requireState(!next.wiring[action.target], '此供电接口已连接');
      next.wiring[action.target] = true;
      break;
    }
    case 'cable-disconnect':
      if (action.target === 'frontPower') {
        requireState(next.panelRemoved, '请先打开机箱侧板');
        requireState(next.frontPower, '开机键线尚未连接');
        next.frontPower = false;
        break;
      }
      requireState(Object.hasOwn(POWER_CABLES, action.target), '供电接口无效');
      requireState(next.panelRemoved, '请先打开机箱侧板');
      requireState(next.wiring[action.target], '此供电接口尚未连接');
      next.wiring[action.target] = false;
      break;
    case 'psu-place':
      requireState(next.panelRemoved, '请先打开机箱侧板');
      requireState(Boolean(next.layout.psu), '请先从配件区选择电源');
      requireState(!next.power.placed, '电源已经落位');
      next.power.placed = true;
      break;
    case 'psu-screw':
    case 'psu-unscrew': {
      requireState(next.power.placed, '请先将电源放入机箱电源位');
      const i = index(4);
      const tighten = action.type === 'psu-screw';
      requireState(
        next.power.screws[i] !== tighten,
        tighten ? '该电源固定点已拧紧' : '该电源固定点尚未拧紧',
      );
      next.power.screws[i] = tighten;
      break;
    }
    case 'gpu-open':
    case 'gpu-close':
      boardAccessible(next);
      requireState(!next.graphics.screwed, '请先松开显卡挡板螺丝');
      next.graphics.latchOpen = action.type === 'gpu-open';
      break;
    case 'gpu-place':
      boardAccessible(next);
      requireState(Boolean(next.layout.gpu), '请先从货架选择显卡');
      requireState(next.graphics.latchOpen, '请先打开 PCIe 卡扣');
      requireState(!next.graphics.screwed, '请先松开显卡挡板螺丝');
      requireState(next.board !== 'case' || gpuBayOpen(next), '请先取下两块槽位挡板，腾出显卡开口');
      next.graphics.placed = true;
      next.graphics.latchOpen = false;
      break;
    case 'gpu-screw':
    case 'gpu-unscrew': {
      boardAccessible(next);
      const tighten = action.type === 'gpu-screw';
      requireState(next.board === 'case' && next.graphics.placed, '请先将主板和显卡装入机箱');
      requireState(!next.graphics.latchOpen, '请先关闭 PCIe 卡扣');
      requireState(
        next.graphics.screwed !== tighten,
        tighten ? '显卡挡板已固定' : '显卡挡板尚未固定',
      );
      next.graphics.screwed = tighten;
      break;
    }
    case 'storage-place':
      boardAccessible(next);
      requireState(Boolean(next.layout.storage), '请先从货架选择磁盘');
      requireState(next.storage === 'tray', '磁盘已经插入');
      next.storage = 'seated';
      next.storagePressed = false;
      break;
    case 'storage-press':
    case 'storage-lift': {
      boardAccessible(next);
      requireState(next.storage === 'seated', '请先插入磁盘，已固定的磁盘须先松开螺丝');
      const pressed = action.type === 'storage-press';
      requireState(getStoragePressed(next) !== pressed, pressed ? '磁盘已经压平' : '磁盘已经抬起');
      next.storagePressed = pressed;
      break;
    }
    case 'storage-screw':
      boardAccessible(next);
      requireState(next.storage === 'seated', '请先将磁盘插入 M.2 插槽');
      requireState(getStoragePressed(next), '请先用手将 M.2 磁盘末端压平，再拧紧螺丝');
      next.storage = 'locked';
      break;
    case 'storage-unscrew':
      boardAccessible(next);
      requireState(next.storage === 'locked', 'M.2 固定螺丝尚未锁紧');
      next.storage = 'seated';
      next.storagePressed = true;
      break;
    case 'paste-apply':
      boardAccessible(next);
      requireState(next.cpu === 'locked', '请先安装并锁定 CPU，再涂硅脂');
      requireState(!next.cooling.placed, '请先移开散热器');
      requireState(!next.cooling.paste, '硅脂已经涂好，无需重复添加');
      next.cooling.paste = true;
      break;
    case 'mount-place':
    case 'mount-screw':
    case 'mount-unscrew':
      next.mounting = changeMounting(next, action);
      ensureMountLayouts();
      break;
    case 'cooler-film-remove':
      requireState(next.coolerFilm === true, '底座保护膜已经移除');
      requireState(!next.cooling.placed, '底座被 CPU 挡住，请先取下散热器');
      next.coolerFilm = false;
      break;
    case 'cooler-place':
      requireState(!getCoolerFans(next).includes('seated'), '风扇尚未扣紧，请先固定或取下风扇');
      boardAccessible(next);
      requireState(next.cpu === 'locked', '请先安装并锁定 CPU');
      requireState(next.cooling.paste, '请先在 CPU 上涂硅脂');
      requireState(!next.cooling.placed, '散热器已经落位');
      requireState(getMounting(next).railScrews.every(Boolean), '请先拆下原卡座并固定两侧散热支架');
      next.cooling.placed = true;
      break;
    case 'cooler-screw-step':
    case 'cooler-screw':
    case 'cooler-unscrew': {
      boardAccessible(next);
      requireState(next.cooling.placed, '请先放入散热器');
      const i = index(2);
      const tighten = action.type !== 'cooler-unscrew';
      requireState(
        tighten ? !next.cooling.screws[i] : getCoolerScrewDepths(next)[i] > 0,
        tighten ? '该固定点已经旋紧' : '该固定点尚未旋紧',
      );
      const depths = [...getCoolerScrewDepths(next)];
      depths[i] = tighten ? (action.type === 'cooler-screw-step' ? depths[i] + 1 : 3) : 0;
      next.cooling.screws[i] = depths[i] === 3;
      next.coolerScrewDepths = depths;
      break;
    }
    case 'fan-connect':
    case 'fan-disconnect': {
      boardAccessible(next);
      const connect = action.type === 'fan-connect';
      const indices = action.index === undefined ? [0, 1] : [index(2)];
      const connections = [...getFanConnections(next)];
      if (connect) {
        requireState(next.cooling.placed, '请先将散热塔放到主板上');
        requireState(
          indices.every((i) => getCoolerFans(next)[i] === 'locked'),
          action.index === undefined ? '请先安装并扣紧两侧风扇' : '请先安装并扣紧这只风扇',
        );
      }
      requireState(
        indices.some((i) => connections[i] !== connect),
        connect ? '风扇线已经连接' : '风扇线尚未连接',
      );
      for (const i of indices) connections[i] = connect;
      next.fanConnections = connections;
      next.cooling.fanConnected = connections.some(Boolean);
      break;
    }
    case 'table-place':
      requireState(!isPacked(next, action.part), '请先开盒取出配件');
      if (action.part?.startsWith('package-')) {
        requireState(Boolean(next.packages?.[action.part.slice(8)]), '包装盒不存在');
        next.layout[action.part] = validateTablePlacement(next, action.part, action.pose);
        break;
      }
      placeOnTable(action.part, action.pose);
      break;
    case 'board-to-bench':
      placeOnTable('board', BENCH_POSE);
      break;
    case 'socket-lever-open':
      boardAccessible(next);
      requireState(!next.cooling.placed, '请先移开散热器，再释放 CPU 压杆');
      requireState(!getSocketLeverOpen(next), 'CPU 压杆已经释放');
      next.socketLeverOpen = true;
      if (next.cpu === 'locked') next.cpu = 'seated';
      break;
    case 'socket-cover-open':
      boardAccessible(next);
      requireState(!next.cooling.placed, '请先移开散热器，再打开 CPU 压盖');
      requireState(getSocketLeverOpen(next), '请先释放 CPU 压杆，再打开压盖');
      requireState(!next.socketOpen, 'CPU 压盖已经打开');
      next.socketLeverOpen = true;
      next.socketOpen = true;
      break;
    case 'socket-cover-close':
      boardAccessible(next);
      requireState(next.socketOpen, 'CPU 压盖已经关闭');
      next.socketLeverOpen = true;
      next.socketOpen = false;
      break;
    case 'socket-lever-lock':
      boardAccessible(next);
      requireState(getSocketLeverOpen(next), 'CPU 压杆已经扣紧');
      requireState(!next.socketOpen, '请先合上 CPU 压盖，再锁住压杆');
      next.socketLeverOpen = false;
      if (next.cpu === 'seated') next.cpu = 'locked';
      break;
    // Keep the former combined actions for existing callers.
    case 'socket-open':
      boardAccessible(next);
      requireState(!next.cooling.placed, '请先移开散热器，再打开 CPU 压盖');
      requireState(!next.socketOpen, 'CPU 压盖已经打开');
      next.socketOpen = true;
      next.socketLeverOpen = true;
      if (next.cpu === 'locked') next.cpu = 'seated';
      break;
    case 'cpu-place':
      boardAccessible(next);
      requireState(next.socketOpen, '请先打开 CPU 插槽压盖');
      requireState(next.cpu === 'tray', 'CPU 已经放入插槽');
      next.cpu = 'seated';
      break;
    case 'cpu-lock':
      boardAccessible(next);
      requireState(next.socketOpen, 'CPU 压盖已经关闭');
      if (next.cpu === 'seated') next.cpu = 'locked';
      next.socketOpen = false;
      next.socketLeverOpen = false;
      break;
    case 'cpu-remove':
      boardAccessible(next);
      requireState(next.cpu === 'seated' && next.socketOpen, '请先打开压盖，再取出 CPU');
      placeOnTable('cpu', next.layout.cpu);
      break;
    case 'memory-open': {
      boardAccessible(next);
      const i = index(2);
      requireState(!next.memoryOpen[i], '该内存插槽卡扣已经打开');
      next.memoryOpen[i] = true;
      const partIndex = getMemoryPart(next, i);
      if (partIndex !== -1 && next.memory[partIndex] === 'locked')
        next.memory[partIndex] = 'seated';
      break;
    }
    case 'memory-place': {
      boardAccessible(next);
      const i = index(2);
      const partIndex = action.partIndex === undefined ? i : action.partIndex;
      requireState(
        Number.isInteger(partIndex) && partIndex >= 0 && partIndex < 2,
        '内存物品编号无效',
      );
      requireState(next.memoryOpen[i], '请先打开对应内存插槽的卡扣');
      requireState(next.memory[partIndex] !== 'locked', '内存仍被锁定，请先打开卡扣再移动');
      const occupied = getMemoryPart(next, i);
      requireState(occupied === -1 || occupied === partIndex, '该内存插槽已经被另一根内存占用');
      next.memory[partIndex] = 'seated';
      next.memorySlots[partIndex] = i;
      break;
    }
    case 'memory-press': {
      boardAccessible(next);
      const i = index(2);
      const partIndex = getMemoryPart(next, i);
      requireState(partIndex !== -1, '请先将内存对准缺口放入插槽');
      requireState(next.memoryOpen[i], '内存已经压紧，卡扣已闭合');
      requireState(next.memory[partIndex] === 'seated', '请先将内存放入插槽');
      next.memory[partIndex] = 'locked';
      next.memoryOpen[i] = false;
      break;
    }
    case 'memory-lock': {
      boardAccessible(next);
      const i = index(2);
      requireState(next.memoryOpen[i], '该内存插槽卡扣已经关闭');
      const partIndex = getMemoryPart(next, i);
      if (partIndex !== -1 && next.memory[partIndex] === 'seated')
        next.memory[partIndex] = 'locked';
      next.memoryOpen[i] = false;
      break;
    }
    case 'memory-remove': {
      boardAccessible(next);
      const i = index(2);
      requireState(
        next.memory[i] === 'seated' && next.memoryOpen[getMemorySlot(next, i)],
        '请先打开卡扣，再取出内存',
      );
      placeOnTable(`memory${i}`, next.layout[`memory${i}`]);
      break;
    }
    case 'panel-remove':
      requireState(!next.panelRemoved, '机箱侧板已经移开');
      next.panelRemoved = true;
      break;
    case 'panel-close':
      requireState(next.panelRemoved, '机箱侧板已经合上');
      next.panelRemoved = false;
      break;
    case 'board-to-case':
      requireState(!next.frontPower, '请先拔下 POWER SW 开机键线再移动主板');
      requireState(next.board !== 'case', '主板已经装入机箱');
      requireState(next.panelRemoved, '请先移开机箱侧板');
      requireState(
        getStandoffs(next).every(Boolean),
        '主板下方缺少铜柱支撑，请补齐四个固定孔的铜柱',
      );
      requireState(!next.graphics.placed || gpuBayOpen(next), '请先取下两块槽位挡板，腾出显卡开口');
      attachedPartsSecure(next);
      next.board = 'case';
      break;
    case 'screw': {
      requireState(next.board === 'case', '请先将主板放入机箱');
      boardAccessible(next);
      const i = index(4);
      requireState(!next.screws[i], '该固定点已经旋紧');
      next.screws[i] = true;
      break;
    }
    case 'unscrew': {
      requireState(next.board === 'case', '主板尚未装入机箱');
      boardAccessible(next);
      const i = index(4);
      requireState(next.screws[i], '该固定点尚未旋紧');
      next.screws[i] = false;
      break;
    }
    case 'board-remove':
      requireState(next.board === 'case', '主板尚未装入机箱');
      placeOnTable('board', BENCH_POSE);
      break;
    default:
      throw new Error('未知的装配操作');
  }
  return validateAssembly(next);
}
