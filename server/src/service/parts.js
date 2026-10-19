import { withProductIdentity } from '../../../shared/product-identity.js';
import { readFileSync } from 'node:fs';
import { AppError } from '../errors/index.js';
export const categories = [
  'case',
  'motherboard',
  'cpu',
  'cooler',
  'memory',
  'gpu',
  'storage',
  'psu',
];
const parts = JSON.parse(readFileSync(new URL('../data/parts.json', import.meta.url), 'utf8')).map(
  withProductIdentity,
);
export function listParts({ category, q = '' } = {}) {
  return parts.filter(
    (p) =>
      (!category || p.category === category) &&
      `${p.name} ${p.brand} ${p.summary}`.toLowerCase().includes(q.toLowerCase()),
  );
}
export function getPart(id) {
  const part = parts.find((p) => p.id === id);
  if (!part) throw new AppError('PART_NOT_FOUND');
  return part;
}
export function resolveSelection(selection) {
  return Object.fromEntries(
    Object.entries(selection).map(([category, id]) => {
      const part = getPart(id);
      if (part.category !== category)
        throw new AppError('VALIDATION_ERROR', '配件类别与安装位置不匹配');
      return [category, part];
    }),
  );
}
