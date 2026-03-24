import { InventoryItem } from '../types';

export const getPlantDisplayName = (item: InventoryItem, includeLocation: boolean = true): string => {
  let name = item.plantName;
  if (item.identifier) {
    name += ` - ${item.identifier}`;
  }
  if (item.plantCode) {
    name += ` (${item.plantCode})`;
  }
  if (includeLocation) {
    if (item.locationName && item.areaName) {
      name += ` (${item.locationName} - ${item.areaName})`;
    } else if (item.locationName) {
      name += ` (${item.locationName})`;
    }
  }
  return name;
};
