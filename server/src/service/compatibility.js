import { compatibilityChecks, catalogueTotal } from '../../../shared/compatibility.js';
import { categories, resolveSelection } from './parts.js';
export function evaluateParts(parts) {
  const checks = compatibilityChecks(parts);
  return {
    total: catalogueTotal(Object.values(parts)),
    count: Object.keys(parts).length,
    missing: categories.filter((c) => !parts[c]),
    checks,
    conflicts: checks.filter((c) => c.status === 'conflict').length,
    unchecked: checks.filter((c) => c.status === 'unchecked').length,
    limitations: ['电源功率与接口', '散热器扣具', '内存与散热器间隙', 'BIOS 版本', 'M.2 接口支持'],
  };
}
export const checkBuild = (selection) => evaluateParts(resolveSelection(selection));
