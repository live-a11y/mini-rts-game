import { UnitType, BuildingType, ResourceType } from './types';

// Costs
export const UNIT_COSTS: Record<UnitType, { wood: number; food: number; time: number }> = {
  [UnitType.Peasant]: { wood: 0, food: 50, time: 5 },
  [UnitType.Militia]: { wood: 20, food: 60, time: 8 }, // Basic melee
  [UnitType.Archer]: { wood: 50, food: 40, time: 10 }, // Ranged
};

export const BUILDING_COSTS: Record<BuildingType, { wood: number; food: number; time: number }> = {
  [BuildingType.TownCenter]: { wood: 300, food: 0, time: 60 },
  [BuildingType.Barracks]: { wood: 150, food: 0, time: 20 },
  [BuildingType.House]: { wood: 50, food: 0, time: 10 },
  [BuildingType.Farm]: { wood: 60, food: 0, time: 10 },
};

// Stats
export const UNIT_STATS: Record<UnitType, { hp: number; attackDamage: number; attackRange: number; moveSpeed: number; attackCooldown: number; radius: number }> = {
  [UnitType.Peasant]: { hp: 40, attackDamage: 3, attackRange: 15, moveSpeed: 2, attackCooldown: 1000, radius: 8 },
  [UnitType.Militia]: { hp: 100, attackDamage: 8, attackRange: 15, moveSpeed: 2.2, attackCooldown: 1000, radius: 10 },
  [UnitType.Archer]: { hp: 60, attackDamage: 6, attackRange: 160, moveSpeed: 2.5, attackCooldown: 1500, radius: 10 },
};

export const BUILDING_STATS: Record<BuildingType, { hp: number; radius: number }> = {
  [BuildingType.TownCenter]: { hp: 1500, radius: 40 },
  [BuildingType.Barracks]: { hp: 800, radius: 30 },
  [BuildingType.House]: { hp: 200, radius: 15 },
  [BuildingType.Farm]: { hp: 300, radius: 25 },
};

export const POPULATION_PER_HOUSE = 5;
export const BASE_POPULATION = 5;
export const GATHER_RATE = 10;
export const GATHER_COOLDOWN = 1000;
export const STARTING_RESOURCES = { wood: 200, food: 200 };

export const RESOURCE_STATS: Record<ResourceType, { maxAmount: number; color: string }> = {
  [ResourceType.Wood]: { maxAmount: 500, color: '#8B4513' },
  [ResourceType.Food]: { maxAmount: 500, color: '#228B22' },
};

// Farm specific
export const FARM_MAX_FOOD = 300;
export const FARM_GENERATION_RATE = 2; // Auto gen per second
export const FARM_GENERATION_INTERVAL = 1000;
export const FARM_WORKER_BOOST = 8; // Extra food per gather cycle when working

// Camera
export const EDGE_SCROLL_THRESHOLD = 20; // px
export const EDGE_SCROLL_SPEED = 10;