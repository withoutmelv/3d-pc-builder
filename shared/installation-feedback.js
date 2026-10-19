import { getMemoryPart, getSocketLeverOpen } from './assembly.js';

// Aiming feedback for keyed parts; installation still passes through the state machine.
export function keyedInstallationError(state, part, target, rotation, targetRotation, parts = {}) {
  const cpu = part === 'cpu' && target === 'socket';
  const memory = /^memory[01]$/.test(part) && /^memory[01]$/.test(target);
  if (!cpu && !memory) return null;
  if (state.board === 'case' && !state.panelRemoved) return '请先打开机箱侧板';
  if (cpu) {
    if (parts.cpu && parts.motherboard && parts.cpu.specs.socket !== parts.motherboard.specs.socket)
      return 'CPU 插槽与主板不匹配，旋转无法解决';
    if (state.cpu === 'locked') return 'CPU 插槽已占用，请先解锁并取出原 CPU';
    if (!getSocketLeverOpen(state)) return '请先释放 CPU 压杆，再打开压盖';
    if (!state.socketOpen) return '请先打开 CPU 压盖';
  } else {
    if (
      parts.memory &&
      parts.motherboard &&
      parts.memory.specs.memoryType !== parts.motherboard.specs.memoryType
    )
      return '内存代际与主板不匹配，旋转无法解决';
    const index = Number(target.at(-1)),
      occupant = getMemoryPart(state, index);
    const label = index === 0 ? 'A2' : 'B2';
    if (occupant !== -1 && occupant !== Number(part.at(-1)))
      return `${label} 插槽已被另一根内存占用`;
    if (!state.memoryOpen[index]) return `请先打开 ${label} 内存卡扣`;
  }
  const difference = Math.abs(((((rotation - targetRotation + 540) % 360) + 360) % 360) - 180);
  if (difference > 45)
    return cpu
      ? 'CPU 角标未对齐 · 按 R 旋转，让金色角标与插槽角标重合'
      : '内存缺口未对齐 · 按 R 旋转，让缺口与插槽凸起重合';
  return '';
}
