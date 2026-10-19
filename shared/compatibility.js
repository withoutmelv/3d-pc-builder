export function compatibilityChecks(parts) {
  const checks = [];
  function rule(code, title, slots, fields, compare, message) {
    const ready =
      slots.every((s) => parts[s]) && fields.every(([s, f]) => parts[s]?.specs?.[f] != null);
    const valid = ready && compare();
    checks.push({
      code,
      title,
      categories: slots,
      status: !ready ? 'unchecked' : valid ? 'pass' : 'conflict',
      message: !ready ? '配件或规格不完整，暂未校验' : valid ? '所选配件规格匹配' : message(),
    });
  }
  const s = (category) => parts[category]?.specs || {};
  rule(
    'CPU_SOCKET',
    'CPU 插槽',
    ['cpu', 'motherboard'],
    [
      ['cpu', 'socket'],
      ['motherboard', 'socket'],
    ],
    () => s('cpu').socket === s('motherboard').socket,
    () => `CPU 使用 ${s('cpu').socket}，主板使用 ${s('motherboard').socket}，插槽不匹配。`,
  );
  rule(
    'MEMORY_TYPE',
    '内存代际',
    ['memory', 'motherboard'],
    [
      ['memory', 'memoryType'],
      ['motherboard', 'memoryType'],
    ],
    () => s('memory').memoryType === s('motherboard').memoryType,
    () => `内存为 ${s('memory').memoryType}，主板仅支持 ${s('motherboard').memoryType}。`,
  );
  rule(
    'BOARD_SIZE',
    '主板规格',
    ['motherboard', 'case'],
    [
      ['motherboard', 'formFactor'],
      ['case', 'formFactors'],
    ],
    () =>
      s('case').formFactors.includes(s('motherboard').formFactor) &&
      (s('case').maxBoardWidth == null ||
        (parts.motherboard.dimensions?.[1] ?? Infinity) <= s('case').maxBoardWidth),
    () => `机箱不支持 ${s('motherboard').formFactor} 主板。`,
  );
  rule(
    'GPU_LENGTH',
    '显卡长度',
    ['gpu', 'case'],
    [
      ['gpu', 'length'],
      ['case', 'maxGpuLength'],
    ],
    () => s('gpu').length <= s('case').maxGpuLength,
    () => `显卡长度 ${s('gpu').length}mm，超过机箱 ${s('case').maxGpuLength}mm 限长。`,
  );
  rule(
    'COOLER_HEIGHT',
    '散热器高度',
    ['cooler', 'case'],
    [
      ['cooler', 'height'],
      ['case', 'maxCoolerHeight'],
    ],
    () => s('cooler').height <= s('case').maxCoolerHeight,
    () => `散热器高 ${s('cooler').height}mm，超过机箱 ${s('case').maxCoolerHeight}mm 限高。`,
  );
  return checks;
}
export const catalogueTotal = (parts) =>
  parts.some((p) => !Number.isFinite(p.price)) ? null : parts.reduce((sum, p) => sum + p.price, 0);
