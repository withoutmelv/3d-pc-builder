import { transitionAssembly as apply } from '../../../shared/assembly.js';
import { CART_LAYOUT } from '../../../shared/workbench-layout.js';
export function mountReady(state) {
  let s = state;
  for (const side of [1, 0]) {
    const part = `stockMount${side}`;
    for (const index of [1, 0]) s = apply(s, { type: 'mount-unscrew', part, index });
    s = apply(s, { type: 'table-place', part, pose: CART_LAYOUT[part] });
    s = apply(s, { type: 'mount-place', part: `coolerMount${side}` });
    for (const index of [0, 1])
      s = apply(s, { type: 'mount-screw', part: `coolerMount${side}`, index });
  }
  return s;
}
