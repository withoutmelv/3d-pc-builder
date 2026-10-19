// These simplified AMD mounting bars reuse the motherboard's stock backplate.
export const MOUNT_PARTS = Object.freeze({
  stockMount0: { kind: 'stock', index: 0, x: -77 },
  stockMount1: { kind: 'stock', index: 1, x: 17 },
  coolerMount0: { kind: 'rails', index: 0, x: -77 },
  coolerMount1: { kind: 'rails', index: 1, x: 17 },
});
export const createMounting = (board = true) => ({
  stock: [board, board],
  stockScrews: [board, board, board, board],
  rails: [false, false],
  railScrews: [false, false, false, false],
});
export const getMounting = (state) =>
  state.mounting ?? {
    stock: [false, false],
    stockScrews: [false, false, false, false],
    rails: [true, true],
    railScrews: [true, true, true, true],
  };
export const mountingSecure = (state) => {
  const m = getMounting(state);
  return ['stock', 'rails'].every((kind) =>
    m[kind].every(
      (placed, i) =>
        !placed ||
        m[kind === 'stock' ? 'stockScrews' : 'railScrews'].slice(i * 2, i * 2 + 2).every(Boolean),
    ),
  );
};
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
export function validateMounting(state) {
  if (state.mounting === undefined) return;
  const m = state.mounting;
  ensure(
    m && typeof m === 'object' && !Array.isArray(m) && Object.keys(m).length === 4,
    '散热支架状态无效',
  );
  for (const [key, length] of [
    ['stock', 2],
    ['stockScrews', 4],
    ['rails', 2],
    ['railScrews', 4],
  ])
    ensure(
      Array.isArray(m[key]) &&
        m[key].length === length &&
        m[key].every((v) => typeof v === 'boolean'),
      '散热支架状态无效',
    );
  for (let i = 0; i < 2; i++) {
    ensure(!(m.stock[i] && m.rails[i]), '原卡座与散热支架不能占用同一位置');
    for (const kind of ['stock', 'rails']) {
      const screws = m[kind === 'stock' ? 'stockScrews' : 'railScrews'];
      ensure(
        m[kind][i] || !screws.slice(i * 2, i * 2 + 2).some(Boolean),
        '支架未落位，不能固定螺丝',
      );
      if (state.room) {
        const owner = kind === 'stock' ? 'board' : 'cooler';
        ensure(state.layout?.[owner] || !m[kind][i], '请先选择对应的主板或散热器');
        const part = `${kind === 'stock' ? 'stockMount' : 'coolerMount'}${i}`;
        ensure(state.layout?.[owner] || !state.layout?.[part], '支架不能脱离所属配件单独存在');
        if (state.layout?.[owner]) ensure(Boolean(state.layout[part]), '支架缺少摆放位置');
      }
    }
  }
  ensure(
    !state.room || state.layout?.board || (!m.stock.some(Boolean) && !m.rails.some(Boolean)),
    '请先选择主板',
  );
  ensure(!state.cooling?.placed || m.railScrews.every(Boolean), '请先安装并固定两侧散热支架');
}
export function changeMounting(state, action) {
  const part = MOUNT_PARTS[action.part];
  ensure(part, '支架位置无效');
  ensure(!state.room || state.layout?.board, '请先选择主板');
  ensure(part.kind !== 'rails' || !state.room || state.layout?.cooler, '请先选择散热器');
  ensure(state.board !== 'case' || state.panelRemoved, '请先打开机箱侧板');
  ensure(!state.cooling?.placed, '请先取下散热塔，再操作支架');
  const m = Object.fromEntries(
    Object.entries(getMounting(state)).map(([key, values]) => [key, [...values]]),
  );
  const { kind, index } = part;
  const screws = m[kind === 'stock' ? 'stockScrews' : 'railScrews'];
  if (action.type === 'mount-place') {
    ensure(!m[kind][index], '支架已经落位');
    ensure(!m[kind === 'stock' ? 'rails' : 'stock'][index], '请先拿走占用此位置的卡座或支架');
    m[kind][index] = true;
  } else if (action.type === 'mount-remove') {
    ensure(!screws.slice(index * 2, index * 2 + 2).some(Boolean), '请先松开此支架的两颗螺丝');
    m[kind][index] = false;
  } else {
    ensure(['mount-screw', 'mount-unscrew'].includes(action.type), '支架操作无效');
    ensure(m[kind][index], '请先放入支架');
    ensure(Number.isInteger(action.index) && action.index >= 0 && action.index < 2, '螺丝位置无效');
    const slot = index * 2 + action.index;
    const tighten = action.type === 'mount-screw';
    ensure(screws[slot] !== tighten, tighten ? '螺丝已经固定' : '螺丝已经松开');
    screws[slot] = tighten;
  }
  return m;
}
