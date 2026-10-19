// Only the delivered set is offered on shelves. Other catalogue records remain
// available for existing saves until their individual models are delivered.
export const availableStock = Object.freeze({
  case: 'case-air',
  motherboard: 'board-a5',
  cpu: 'cpu-a5',
  cooler: 'cooler-air',
  memory: 'ram-d5',
  gpu: 'gpu-dual',
  storage: 'ssd-1',
  psu: 'psu-750',
});
export const isStockAvailable = (part) => availableStock[part.category] === part.id;
