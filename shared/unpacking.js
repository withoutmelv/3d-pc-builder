import { PACKAGES, packageKey } from './packages.js';
import { validateAssembly } from './assembly.js';
import { isLoose, validateTablePlacement } from './workbench-layout.js';

export function openPackage(state, category) {
  validateAssembly(state);
  if (state.packages?.[category] !== 'closed') throw new Error('包装盒已打开或不存在');
  return validateAssembly({ ...state, packages: { ...state.packages, [category]: 'open' } });
}

export function unpackPackage(state, category) {
  validateAssembly(state);
  if (state.packages?.[category] !== 'open') throw new Error('请先打开包装盒');
  const next = structuredClone(state);
  next.packages[category] = 'empty';
  const origin = next.layout[packageKey(category)];
  const keys = PACKAGES[category].parts.filter((key) => next.layout[key] && isLoose(next, key));
  for (const key of keys) delete next.layout[key];
  for (const key of keys) {
    let placed = false;
    // Search only the current supporting surface; never teleport contents to another area.
    for (let radius = 80; radius <= 1900 && !placed; radius += 80) {
      for (let direction = 0; direction < 16; direction++) {
        const angle = (direction * Math.PI) / 8;
        const pose = {
          x: origin.x + Math.cos(angle) * radius,
          z: origin.z + Math.sin(angle) * radius,
          y: origin.y ?? 0,
          rotation: ['cpu', 'memory0', 'memory1', 'cooler', 'coolerFan0', 'coolerFan1'].includes(
            key,
          )
            ? 180
            : 0,
        };
        try {
          next.layout[key] = validateTablePlacement(next, key, pose);
          placed = true;
          break;
        } catch {
          /* Try the next empty position on this surface. */
        }
      }
    }
    if (!placed) throw new Error('包装盒附近空间不足，请把盒子搬到更空的工作台或地面再取件');
  }
  if (category === 'case') next.layout.panel = { ...next.layout.case };
  return validateAssembly(next);
}
