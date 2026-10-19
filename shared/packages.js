// Dimensions describe the simplified interactive packaging, not shipping specifications.
export const PACKAGES = Object.freeze({
  cpu: { name: 'CPU 包装盒', size: [170, 215, 60], position: [-3100, 480], parts: ['cpu'] },
  motherboard: {
    name: '主板包装盒',
    size: [340, 280, 90],
    position: [-3020, 0],
    parts: ['board', 'stockMount0', 'stockMount1', 'ioShield'],
  },
  memory: {
    name: '内存包装盒',
    size: [175, 190, 80],
    position: [-2890, 480],
    parts: ['memory0', 'memory1'],
  },
  storage: { name: '磁盘包装盒', size: [155, 205, 28], position: [-2690, 480], parts: ['storage'] },
  gpu: { name: '显卡包装盒', size: [380, 210, 100], position: [-2610, 0], parts: ['gpu'] },
  cooler: {
    name: '散热器包装盒',
    size: [200, 230, 200],
    position: [-2240, 30],
    parts: ['cooler', 'coolerFan0', 'coolerFan1', 'coolerMount0', 'coolerMount1'],
  },
  psu: { name: '电源包装盒', size: [260, 210, 200], position: [-2240, 450], parts: ['psu'] },
  case: {
    name: '机箱包装盒',
    size: [510, 540, 520],
    position: [-1740, 240],
    parts: [
      'case',
      'panel',
      'slotCover0',
      'slotCover1',
      'standoff0',
      'standoff1',
      'standoff2',
      'standoff3',
    ],
  },
});
export const packageKey = (category) => `package-${category}`;
export const packageNames = Object.fromEntries(
  Object.entries(PACKAGES).map(([category, box]) => [packageKey(category), box.name]),
);
export const PACKAGE_ITEMS = Object.freeze({
  cpu: ['cpu'],
  motherboard: ['board', 'ioShield'],
  memory: ['memory0', 'memory1'],
  storage: ['storage'],
  gpu: ['gpu'],
  cooler: ['cooler', 'coolerFan0', 'coolerFan1', 'coolerMount0', 'coolerMount1'],
  psu: ['psu'],
  case: ['case'],
});
export function packageItemOwner(part) {
  if (['stockMount0', 'stockMount1'].includes(part)) return 'board';
  if (PACKAGES.case.parts.includes(part)) return 'case';
  return part;
}
export function packageCategory(part) {
  return Object.keys(PACKAGE_ITEMS).find((category) => PACKAGE_ITEMS[category].includes(part));
}
export function packageItems(state, category) {
  return (PACKAGE_ITEMS[category] ?? []).filter(
    (part) => state.layout?.[part] && isPacked(state, part),
  );
}
export function releasePackageItem(state, part) {
  const category = packageCategory(part);
  if (
    !category ||
    state.packages?.[category] !== 'open' ||
    !packageItems(state, category).includes(part)
  )
    throw new Error('请先打开包装盒，再拿出其中的配件');
  state.unpackedParts = [...(state.unpackedParts ?? []), part];
  state.packages = { ...state.packages };
  if (!packageItems(state, category).length) state.packages[category] = 'empty';
}
export function isPacked(state, part) {
  return Object.entries(PACKAGES).some(
    ([category, box]) =>
      box.parts.includes(part) &&
      ['closed', 'open'].includes(state.packages?.[category]) &&
      !state.unpackedParts?.includes(packageItemOwner(part)),
  );
}
export function validatePackages(state) {
  const fail = (message) => {
    throw new Error(message);
  };
  if (state.unpackedParts !== undefined) {
    if (
      !Array.isArray(state.unpackedParts) ||
      new Set(state.unpackedParts).size !== state.unpackedParts.length ||
      state.unpackedParts.some(
        (part) =>
          !packageCategory(part) ||
          !state.layout?.[part] ||
          !['open', 'empty'].includes(state.packages?.[packageCategory(part)]),
      )
    )
      fail('已拆箱配件记录无效');
  }
  if (state.packages !== undefined) {
    if (
      !state.room ||
      !state.packages ||
      typeof state.packages !== 'object' ||
      Array.isArray(state.packages)
    )
      fail('包装状态无效');
    for (const [category, status] of Object.entries(state.packages)) {
      if (
        !PACKAGES[category] ||
        !['closed', 'open', 'empty'].includes(status) ||
        !state.layout?.[packageKey(category)]
      )
        fail('包装状态或位置无效');
      if (!state.layout?.[PACKAGES[category].parts[0]]) fail('包装盒缺少对应配件');
    }
  }
  for (const key of Object.keys(state.layout ?? {}))
    if (key.startsWith('package-') && !state.packages?.[key.slice(8)]) fail('包装盒缺少状态');
  const packed = (part) => isPacked(state, part);
  if (
    (packed('cpu') && state.cpu !== 'tray') ||
    state.memory.some((v, i) => packed(`memory${i}`) && v !== 'tray') ||
    (packed('board') &&
      (state.board !== 'tray' ||
        state.socketOpen ||
        state.socketLeverOpen ||
        state.memoryOpen.some(Boolean) ||
        state.cpu !== 'tray' ||
        state.memory.some((v) => v !== 'tray') ||
        state.storage !== 'tray' ||
        state.graphics?.placed ||
        state.mounting?.stock.some((v) => !v) ||
        state.mounting?.stockScrews.some((v) => !v) ||
        state.graphics?.latchOpen ||
        state.ioShield === 'installed')) ||
    (packed('cooler') && (state.cooling?.placed || state.coolerFilm === false)) ||
    state.coolerFans?.some((v, i) => packed(`coolerFan${i}`) && v !== 'tray') ||
    state.mounting?.rails.some((v, i) => packed(`coolerMount${i}`) && v) ||
    (packed('gpu') && state.graphics?.placed) ||
    (packed('storage') && state.storage !== 'tray') ||
    (packed('psu') && state.power?.placed) ||
    (packed('case') &&
      (state.panelRemoved ||
        state.board === 'case' ||
        state.power?.placed ||
        state.standoffs?.some((v) => !v) ||
        state.slotCovers?.some((v) => v !== 'locked')))
  )
    fail('请先开盒取出配件，再进行安装或操作');
}
