export const POWER_CABLES = Object.freeze({
  board: '主板 24Pin',
  cpu: 'CPU EPS 8Pin',
  gpu: '显卡 PCIe 8Pin',
});
export const getWiring = (state) => state.wiring ?? { board: false, cpu: false, gpu: false };

export const CABLE_NAMES = Object.freeze({ ...POWER_CABLES, frontPower: 'POWER SW 开机键' });
export const getCableConnections = (state) => ({
  ...getWiring(state),
  frontPower: state.frontPower ?? false,
});
