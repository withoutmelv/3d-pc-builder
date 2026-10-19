import { getCooling, getFanConnections, getGraphics, getPower, getStorage } from './assembly.js';
import { getWiring } from './power-wiring.js';

// Simulated assembly checks only: AC input, PSU switch, firmware and OS are not modelled.
export function checkPowerOn(state) {
  const result = (stage, powered, message, warnings = []) => ({
    stage,
    powered,
    message,
    warnings,
  });
  if (!state.frontPower) return result('power', false, '无响应：POWER SW 开机键线尚未连接');
  if (!getPower(state).placed) return result('power', false, '无响应：电源尚未装入机箱');
  const wiring = getWiring(state);
  if (!wiring.board) return result('power', false, '无响应：主板 24Pin 供电线未连接');
  if (!wiring.cpu) return result('cpu', true, 'CPU 检查停止：EPS 8Pin 供电线未连接');
  if (state.cpu !== 'locked') return result('cpu', true, 'CPU 检查停止：请安装 CPU 并锁定扣具');
  if (!state.memory.includes('locked'))
    return result('dram', true, '内存检查停止：至少需要一根压紧并锁定的内存');
  const cooling = getCooling(state);
  if (!cooling.placed || !cooling.screws.every(Boolean))
    return result('cooling', false, '模拟保护停机：散热器尚未落位或固定');
  if (!cooling.paste) return result('cooling', false, '模拟保护停机：CPU 尚未涂硅脂');
  if (state.coolerFilm === true)
    return result('cooling', false, '模拟保护停机：散热器底部保护膜尚未撕下');
  if (!getFanConnections(state).some(Boolean))
    return result('cooling', false, '模拟保护停机：散热风扇线未连接');
  const graphics = getGraphics(state);
  if (graphics.placed && !wiring.gpu) return result('vga', true, '显卡检查停止：PCIe 供电线未连接');
  const warnings = [];
  if (state.layout?.gpu && !graphics.placed) warnings.push('已选显卡尚未安装');
  if (!graphics.placed) warnings.push('显示输出尚未检查');
  if (getStorage(state) !== 'locked') warnings.push('未检测到已固定的 M.2 磁盘');
  if (!state.screws.every(Boolean)) warnings.push('主板仍有螺丝未固定');
  if (!getPower(state).screws.every(Boolean)) warnings.push('电源仍有螺丝未固定');
  return result('ready', true, '基础装配检查通过', warnings);
}
