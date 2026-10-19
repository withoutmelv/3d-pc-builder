import {
  Box,
  CircuitBoard,
  Cpu,
  Fan,
  MemoryStick,
  GalleryHorizontal,
  HardDrive,
  Zap,
} from 'lucide-react';
export const categories = [
  { id: 'case', label: '机箱', en: 'CHASSIS', Icon: Box },
  { id: 'motherboard', label: '主板', en: 'MOTHERBOARD', Icon: CircuitBoard },
  { id: 'cpu', label: '处理器', en: 'PROCESSOR', Icon: Cpu },
  { id: 'cooler', label: '散热器', en: 'COOLING', Icon: Fan },
  { id: 'memory', label: '内存', en: 'MEMORY', Icon: MemoryStick },
  { id: 'gpu', label: '显卡', en: 'GRAPHICS', Icon: GalleryHorizontal },
  { id: 'storage', label: '存储', en: 'STORAGE', Icon: HardDrive },
  { id: 'psu', label: '电源', en: 'POWER', Icon: Zap },
];
export const money = (n) => (n == null ? '价格未录入' : `¥${Number(n).toLocaleString('zh-CN')}`);
export { availableStock as preset } from '../../../shared/stock-catalogue.js';

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Box size={22} />
      </span>
      3D 装机工作室
    </span>
  );
}
export function PartArt({ category, large = false }) {
  const Icon = categories.find((c) => c.id === category)?.Icon || Box;
  return (
    <div className={`part-art art-${category} ${large ? 'large' : ''}`}>
      <div className="art-grid" />
      <Icon strokeWidth={0.9} />
    </div>
  );
}
