export enum PlayerType {
  Human = 'HUMAN',
  AI = 'AI',
  Neutral = 'NEUTRAL'
}

export enum EntityType {
  Unit = 'UNIT',
  Building = 'BUILDING',
  Resource = 'RESOURCE',
  Projectile = 'PROJECTILE'
}

export enum UnitType {
  Peasant = 'PEASANT',
  Militia = 'MILITIA',
  Archer = 'ARCHER'
}

export enum BuildingType {
  TownCenter = 'TOWN_CENTER',
  Barracks = 'BARRACKS',
  House = 'HOUSE',
  Farm = 'FARM'
}

export enum ResourceType {
  Wood = 'WOOD',
  Food = 'FOOD'
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface BaseEntity {
  id: string;
  position: Vector2D;
  radius: number;
  owner: PlayerType;
  hp: number;
  maxHp: number;
  entityType: EntityType;
}

export interface Unit extends BaseEntity {
  entityType: EntityType.Unit;
  unitType: UnitType;
  targetId: string | null;
  moveTarget: Vector2D | null;
  state: 'IDLE' | 'MOVING' | 'ATTACKING' | 'GATHERING' | 'BUILDING' | 'ATTACK_MOVING';
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  lastAttackTime: number;
  moveSpeed: number;
  gatherType?: ResourceType | null;
  carriedResources: number;
}

export interface Building extends BaseEntity {
  entityType: EntityType.Building;
  buildingType: BuildingType;
  constructionProgress: number; // 0 to 100
  isBuilt: boolean;
  productionQueue: { unitType: UnitType; timeLeft: number }[];
  // Farm Specifics
  resourceAmount?: number;
  maxResourceAmount?: number;
  lastGenerationTime?: number;
}

export interface Resource extends BaseEntity {
  entityType: EntityType.Resource;
  resourceType: ResourceType;
  amount: number;
}

export interface Projectile extends BaseEntity {
  entityType: EntityType.Projectile;
  targetId: string;
  damage: number;
  speed: number;
}

export type GameEntity = Unit | Building | Resource | Projectile;

export interface PlayerState {
  resources: {
    wood: number;
    food: number;
  };
  population: number;
  maxPopulation: number;
}

export interface Camera {
  x: number;
  y: number;
}

export interface GameState {
  entities: Record<string, GameEntity>;
  players: Record<PlayerType, PlayerState>;
  selectedEntityIds: string[];
  gameTime: number;
  gameOver: boolean;
  winner: PlayerType | null;
  buildingToPlace: BuildingType | null;
  camera: Camera;
}

export const MAP_WIDTH = 2000;
export const MAP_HEIGHT = 2000; // Squared for better minimap