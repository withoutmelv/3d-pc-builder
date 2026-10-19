// Display identities come from the delivered assets, not the legacy demo IDs.
export const productIdentity = Object.freeze({
  'cpu-a5': { name: 'AMD Ryzen 7 9800X3D', brand: 'AMD', summary: 'AM5 / Ryzen 7 / 9800X3D' },
  'board-a5': {
    name: 'ROG STRIX B850-F GAMING WIFI7 NEO',
    brand: 'ASUS ROG',
    summary: 'AM5 / DDR5 / ATX',
  },
  'ram-d5': {
    name: 'CORSAIR VENGEANCE RGB DDR5',
    brand: 'CORSAIR',
    summary: 'DDR5 / RGB / 双条套装',
  },
  'gpu-dual': {
    name: 'GIGABYTE RTX 4090 AERO OC 24G',
    brand: 'GIGABYTE',
    summary: 'RTX 4090 / 24GB / 三风扇',
  },
  'ssd-1': { name: 'Samsung 990 EVO 1TB', brand: 'SAMSUNG', summary: '990 EVO / 1TB / M.2 NVMe' },
  'cooler-air': {
    name: 'Thermalright Phantom Spirit 120 SE',
    brand: 'Thermalright',
    summary: '双塔 / 双风扇 / 120 SE',
  },
  'psu-750': {
    name: 'CORSAIR RM1000x (2024)',
    brand: 'CORSAIR',
    summary: 'RM1000x / 2024 / 全模组',
  },
  'case-air': {
    name: 'LIAN LI LANCOOL 216X',
    brand: 'LIAN LI',
    summary: 'LANCOOL 216X / 黑色无光版',
  },
});
export const withProductIdentity = (part) =>
  productIdentity[part.id]
    ? {
        ...part,
        ...productIdentity[part.id],
        description: `${productIdentity[part.id].name} 参考建模。`,
      }
    : part;
