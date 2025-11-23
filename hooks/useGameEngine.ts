import { useState, useEffect, useRef } from 'react';
import {
  GameState,
  PlayerType,
  EntityType,
  UnitType,
  BuildingType,
  Unit,
  Building,
  GameEntity,
  Vector2D,
  ResourceType,
  Resource,
  Projectile,
  MAP_WIDTH,
  MAP_HEIGHT,
} from '../types';
import {
  UNIT_COSTS,
  BUILDING_COSTS,
  UNIT_STATS,
  BUILDING_STATS,
  STARTING_RESOURCES,
  POPULATION_PER_HOUSE,
  BASE_POPULATION,
  GATHER_RATE,
  GATHER_COOLDOWN,
  FARM_MAX_FOOD,
  FARM_GENERATION_RATE,
  FARM_GENERATION_INTERVAL,
  FARM_WORKER_BOOST,
  EDGE_SCROLL_THRESHOLD,
  EDGE_SCROLL_SPEED
} from '../constants';

export const useGameEngine = () => {
  const [gameState, setGameState] = useState<GameState>({
    entities: {},
    players: {
      [PlayerType.Human]: { resources: { ...STARTING_RESOURCES }, population: 0, maxPopulation: BASE_POPULATION },
      [PlayerType.AI]: { resources: { ...STARTING_RESOURCES }, population: 0, maxPopulation: BASE_POPULATION },
      [PlayerType.Neutral]: { resources: { wood: 0, food: 0 }, population: 0, maxPopulation: 0 },
    },
    selectedEntityIds: [],
    gameTime: 0,
    gameOver: false,
    winner: null,
    buildingToPlace: null,
    // Start centered on Player Base (300, 300)
    camera: { 
        x: 300 - window.innerWidth / 2, 
        y: 300 - window.innerHeight / 2 
    }
  });

  const stateRef = useRef(gameState);
  
  // Track inputs for camera
  const mouseRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
  const lastAiUpdateRef = useRef(0);
  const aiStateRef = useRef({ state: 'ECONOMY', nextBuildTime: 0 }); // ECONOMY, ARMY, ATTACK

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const getDistance = (p1: Vector2D, p2: Vector2D) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    const initialState: GameState = { ...gameState };
    
    // Reset camera just in case window size changed during init
    initialState.camera = {
        x: 300 - window.innerWidth / 2, 
        y: 300 - window.innerHeight / 2 
    };

    const spawnEntity = (entity: GameEntity) => {
      initialState.entities[entity.id] = entity;
    };

    // Bases
    const humanTC: Building = {
      id: generateId(), entityType: EntityType.Building, buildingType: BuildingType.TownCenter, owner: PlayerType.Human,
      position: { x: 300, y: 300 }, hp: 1500, maxHp: 1500, radius: 40, constructionProgress: 100, isBuilt: true, productionQueue: []
    };
    spawnEntity(humanTC);

    const aiTC: Building = {
      id: generateId(), entityType: EntityType.Building, buildingType: BuildingType.TownCenter, owner: PlayerType.AI,
      position: { x: MAP_WIDTH - 300, y: MAP_HEIGHT - 300 }, hp: 1500, maxHp: 1500, radius: 40, constructionProgress: 100, isBuilt: true, productionQueue: []
    };
    spawnEntity(aiTC);

    // Initial Peasants
    [0, 1, 2].forEach(i => {
      spawnEntity({
        id: generateId(), entityType: EntityType.Unit, unitType: UnitType.Peasant, owner: PlayerType.Human,
        position: { x: 300 + (i * 20), y: 400 }, ...UNIT_STATS[UnitType.Peasant], maxHp: UNIT_STATS[UnitType.Peasant].hp,
        state: 'IDLE', targetId: null, moveTarget: null, lastAttackTime: 0, carriedResources: 0
      } as Unit);
      
      spawnEntity({
        id: generateId(), entityType: EntityType.Unit, unitType: UnitType.Peasant, owner: PlayerType.AI,
        position: { x: MAP_WIDTH - 300 - (i * 20), y: MAP_HEIGHT - 400 }, ...UNIT_STATS[UnitType.Peasant], maxHp: UNIT_STATS[UnitType.Peasant].hp,
        state: 'IDLE', targetId: null, moveTarget: null, lastAttackTime: 0, carriedResources: 0
      } as Unit);
    });

    // Resources - Clusters
    const createCluster = (x: number, y: number, type: ResourceType, count: number) => {
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 80;
            spawnEntity({
                id: generateId(), entityType: EntityType.Resource, resourceType: type, owner: PlayerType.Neutral,
                position: { x: x + Math.cos(angle)*dist, y: y + Math.sin(angle)*dist },
                radius: 15, hp: 500, maxHp: 500, amount: 500
            } as Resource);
        }
    };

    // Human Resources
    createCluster(300, 150, ResourceType.Wood, 10);
    createCluster(150, 300, ResourceType.Food, 8);

    // AI Resources
    createCluster(MAP_WIDTH - 300, MAP_HEIGHT - 150, ResourceType.Wood, 10);
    createCluster(MAP_WIDTH - 150, MAP_HEIGHT - 300, ResourceType.Food, 8);

    // Mid Map Resources
    for(let i=0; i<20; i++) {
        const x = Math.random() * (MAP_WIDTH - 400) + 200;
        const y = Math.random() * (MAP_HEIGHT - 400) + 200;
        spawnEntity({
            id: generateId(), entityType: EntityType.Resource, resourceType: Math.random() > 0.5 ? ResourceType.Wood : ResourceType.Food,
            owner: PlayerType.Neutral, position: { x, y }, radius: 15, hp: 500, maxHp: 500, amount: 500
        } as Resource);
    }

    stateRef.current = initialState;
    setGameState(initialState);
  }, []);

  // --- SYNC LOOP ---
  // Keeps the UI (React State) in sync with the Simulation (Ref)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      setGameState({ ...stateRef.current });
    }, 100);
    return () => clearInterval(syncInterval);
  }, []);

  // --- AI LOGIC ---
  const updateAI = (state: GameState, dt: number) => {
      const ai = state.players[PlayerType.AI];
      const entities = Object.values(state.entities) as GameEntity[];
      const myEntities = entities.filter(e => e.owner === PlayerType.AI);
      const myUnits = myEntities.filter(e => e.entityType === EntityType.Unit) as Unit[];
      const peasants = myUnits.filter(u => u.unitType === UnitType.Peasant);
      const army = myUnits.filter(u => u.unitType !== UnitType.Peasant);
      const myBuildings = myEntities.filter(e => e.entityType === EntityType.Building) as Building[];
      const tc = myBuildings.find(b => b.buildingType === BuildingType.TownCenter);
      const barracks = myBuildings.filter(b => b.buildingType === BuildingType.Barracks);
      
      const enemyTC = entities.find(e => e.owner === PlayerType.Human && e.entityType === EntityType.Building && (e as Building).buildingType === BuildingType.TownCenter);

      // 1. Worker Management (Always keep busy)
      peasants.forEach(p => {
          if (p.state === 'IDLE') {
              // Reseed depleted farms?
              const depletedFarm = myBuildings.find(b => b.buildingType === BuildingType.Farm && b.isBuilt && (b.resourceAmount || 0) <= 0);
              if (depletedFarm && ai.resources.wood >= 20) {
                  // Reseed logic simulated by "Building" it again
                  ai.resources.wood -= 20;
                  depletedFarm.resourceAmount = FARM_MAX_FOOD;
                  depletedFarm.constructionProgress = 100; // instant reseed for AI simplicity
                  return;
              }

              // Priority: Build -> Gather
              // Check wood vs food balance. Target: 200W, 200F
              const needWood = ai.resources.wood < 200;
              
              if (needWood) {
                  // Find nearest Wood
                  const res = entities.filter(e => e.entityType === EntityType.Resource && (e as Resource).resourceType === ResourceType.Wood);
                  const target = res.sort((a,b) => getDistance(p.position, a.position) - getDistance(p.position, b.position))[0];
                  if (target) { p.state = 'GATHERING'; p.targetId = target.id; }
              } else {
                  // Find nearest Food (Berry or Farm)
                  const berries = entities.filter(e => e.entityType === EntityType.Resource && (e as Resource).resourceType === ResourceType.Food);
                  const farms = myBuildings.filter(b => b.buildingType === BuildingType.Farm && b.isBuilt && (b.resourceAmount || 0) > 0);
                  
                  const allFood = [...berries, ...farms];
                  const target = allFood.sort((a,b) => getDistance(p.position, a.position) - getDistance(p.position, b.position))[0];
                  
                  if (target) { p.state = 'GATHERING'; p.targetId = target.id; }
              }
          }
      });

      // 2. Economy Expansion
      // Train Peasants if < 12
      if (tc && peasants.length < 12 && tc.productionQueue.length === 0) {
          if (ai.resources.food >= UNIT_COSTS[UnitType.Peasant].food && ai.population < ai.maxPopulation) {
              ai.resources.food -= UNIT_COSTS[UnitType.Peasant].food;
              tc.productionQueue.push({ unitType: UnitType.Peasant, timeLeft: UNIT_COSTS[UnitType.Peasant].time * 1000 });
          }
      }

      // Build House if pop capped
      if (ai.population >= ai.maxPopulation - 2) {
          const houseCost = BUILDING_COSTS[BuildingType.House];
          if (ai.resources.wood >= houseCost.wood) {
              const builder = peasants.find(p => p.state !== 'BUILDING');
              if (builder) {
                  ai.resources.wood -= houseCost.wood;
                  const bx = tc ? tc.position.x + (Math.random()*200 - 100) : builder.position.x;
                  const by = tc ? tc.position.y + (Math.random()*200 - 100) : builder.position.y;
                  const id = generateId();
                  state.entities[id] = {
                      id, entityType: EntityType.Building, buildingType: BuildingType.House, owner: PlayerType.AI,
                      position: { x: bx, y: by }, hp: 1, maxHp: 200, radius: 15, constructionProgress: 0, isBuilt: false, productionQueue: []
                  } as Building;
                  builder.targetId = id;
                  builder.state = 'BUILDING';
              }
          }
      }

      // Build Farms if food sources are far or low
      if (ai.resources.wood > 150 && myBuildings.filter(b => b.buildingType === BuildingType.Farm).length < 6) {
           const builder = peasants.find(p => p.state !== 'BUILDING');
           if (builder) {
               ai.resources.wood -= BUILDING_COSTS[BuildingType.Farm].wood;
               const bx = tc ? tc.position.x + (Math.random()*300 - 150) : builder.position.x;
               const by = tc ? tc.position.y + (Math.random()*300 - 150) : builder.position.y;
               const id = generateId();
               state.entities[id] = {
                   id, entityType: EntityType.Building, buildingType: BuildingType.Farm, owner: PlayerType.AI,
                   position: { x: bx, y: by }, hp: 1, maxHp: 300, radius: 25, 
                   constructionProgress: 0, isBuilt: false, productionQueue: [],
                   resourceAmount: FARM_MAX_FOOD, maxResourceAmount: FARM_MAX_FOOD, lastGenerationTime: 0
               } as Building;
               builder.targetId = id;
               builder.state = 'BUILDING';
           }
      }

      // 3. Military Expansion
      // Build Barracks
      if (barracks.length < 2) {
          const cost = BUILDING_COSTS[BuildingType.Barracks];
          if (ai.resources.wood >= cost.wood) {
               const builder = peasants.find(p => p.state !== 'BUILDING');
               if (builder) {
                  ai.resources.wood -= cost.wood;
                  const bx = tc ? tc.position.x + (Math.random()*300 - 150) : builder.position.x;
                  const by = tc ? tc.position.y + (Math.random()*300 - 150) : builder.position.y;
                  const id = generateId();
                  state.entities[id] = {
                      id, entityType: EntityType.Building, buildingType: BuildingType.Barracks, owner: PlayerType.AI,
                      position: { x: bx, y: by }, hp: 1, maxHp: 800, radius: 30, constructionProgress: 0, isBuilt: false, productionQueue: []
                  } as Building;
                  builder.targetId = id;
                  builder.state = 'BUILDING';
               }
          }
      }

      // Train Units
      barracks.forEach(b => {
          if (b.isBuilt && b.productionQueue.length === 0) {
              const type = Math.random() > 0.5 ? UnitType.Militia : UnitType.Archer;
              const cost = UNIT_COSTS[type];
              if (ai.resources.wood >= cost.wood && ai.resources.food >= cost.food && ai.population < ai.maxPopulation) {
                  ai.resources.wood -= cost.wood;
                  ai.resources.food -= cost.food;
                  b.productionQueue.push({ unitType: type, timeLeft: cost.time * 1000 });
              }
          }
      });

      // 4. Attack Logic
      // If Army > 8, Attack Human TC
      if (army.length > 8 && enemyTC) {
          army.forEach(u => {
              if (u.state === 'IDLE' || u.state === 'GATHERING') {
                  u.state = 'ATTACK_MOVING';
                  u.moveTarget = { ...enemyTC.position };
              }
          });
      }
      
      // Defend if under attack
      const enemiesNearBase = entities.filter(e => e.owner === PlayerType.Human && e.entityType === EntityType.Unit && tc && getDistance(e.position, tc.position) < 400);
      if (enemiesNearBase.length > 0) {
          army.forEach(u => {
              if (u.state !== 'ATTACKING') {
                  u.state = 'ATTACK_MOVING';
                  u.moveTarget = { ...enemiesNearBase[0].position };
              }
          });
      }
  };

  // --- MAIN LOOP ---
  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    const loop = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      if (stateRef.current.gameOver) {
          setGameState({ ...stateRef.current }); 
          return;
      }

      const state = stateRef.current;
      const entities = Object.values(state.entities) as GameEntity[];

      // --- CAMERA MOVEMENT (Edge Scroll + Keyboard) ---
      const mouse = mouseRef.current;
      const keys = keysRef.current;
      const cam = state.camera;
      
      let dx = 0;
      let dy = 0;

      if (keys.has('KeyA') || keys.has('ArrowLeft') || mouse.x < EDGE_SCROLL_THRESHOLD) dx -= EDGE_SCROLL_SPEED;
      if (keys.has('KeyD') || keys.has('ArrowRight') || mouse.x > window.innerWidth - EDGE_SCROLL_THRESHOLD) dx += EDGE_SCROLL_SPEED;
      if (keys.has('KeyW') || keys.has('ArrowUp') || mouse.y < EDGE_SCROLL_THRESHOLD) dy -= EDGE_SCROLL_SPEED;
      if (keys.has('KeyS') || keys.has('ArrowDown') || mouse.y > window.innerHeight - EDGE_SCROLL_THRESHOLD) dy += EDGE_SCROLL_SPEED;

      cam.x += dx;
      cam.y += dy;
      
      // Clamp Camera
      // Allow the camera *center* to reach the edges of the map (0 to MAP_WIDTH).
      // Since cam.x + window.innerWidth/2 = CenterX,
      // Min CamX = 0 - window.innerWidth/2
      // Max CamX = MAP_WIDTH - window.innerWidth/2
      const minX = -window.innerWidth / 2;
      const maxX = MAP_WIDTH - window.innerWidth / 2;
      const minY = -window.innerHeight / 2;
      const maxY = MAP_HEIGHT - window.innerHeight / 2;

      cam.x = Math.max(minX, Math.min(maxX, cam.x));
      cam.y = Math.max(minY, Math.min(maxY, cam.y));


      // AI Update (Throttle to 1s)
      if (time - lastAiUpdateRef.current > 1000) {
          updateAI(state, dt);
          lastAiUpdateRef.current = time;
      }

      // Population & Win Check
      [PlayerType.Human, PlayerType.AI].forEach(p => {
          const myEnts = entities.filter(e => e.owner === p);
          const houses = myEnts.filter(e => e.entityType === EntityType.Building && (e as Building).buildingType === BuildingType.House && (e as Building).isBuilt).length;
          const tcs = myEnts.filter(e => e.entityType === EntityType.Building && (e as Building).buildingType === BuildingType.TownCenter).length;
          state.players[p].maxPopulation = BASE_POPULATION + (houses * POPULATION_PER_HOUSE) + (tcs * 5);
          state.players[p].population = myEnts.filter(e => e.entityType === EntityType.Unit).length;
          
          if (tcs === 0 && myEnts.length < 5) {
             state.gameOver = true;
             state.winner = p === PlayerType.Human ? PlayerType.AI : PlayerType.Human;
          }
      });

      const entitiesToRemove: string[] = [];

      entities.forEach(entity => {
          // --- BUILDINGS ---
          if (entity.entityType === EntityType.Building) {
              const b = entity as Building;
              
              // Production Queue
              if (b.productionQueue.length > 0) {
                  b.productionQueue[0].timeLeft -= dt;
                  if (b.productionQueue[0].timeLeft <= 0) {
                      const item = b.productionQueue.shift();
                      if (item) {
                          const angle = Math.random() * Math.PI * 2;
                          const spawnPos = { x: b.position.x + Math.cos(angle)*(b.radius+15), y: b.position.y + Math.sin(angle)*(b.radius+15) };
                          const id = generateId();
                          state.entities[id] = {
                              id, entityType: EntityType.Unit, unitType: item.unitType, owner: b.owner,
                              position: spawnPos, ...UNIT_STATS[item.unitType], maxHp: UNIT_STATS[item.unitType].hp,
                              state: 'IDLE', targetId: null, moveTarget: spawnPos, lastAttackTime: 0, carriedResources: 0
                          } as Unit;
                      }
                  }
              }

              // Farm Auto-Generation
              if (b.buildingType === BuildingType.Farm && b.isBuilt) {
                  if ((b.resourceAmount || 0) > 0) {
                      if (!b.lastGenerationTime) b.lastGenerationTime = time;
                      if (time - b.lastGenerationTime > FARM_GENERATION_INTERVAL) {
                          b.lastGenerationTime = time;
                          b.resourceAmount = (b.resourceAmount || 0) - FARM_GENERATION_RATE;
                          state.players[b.owner].resources.food += FARM_GENERATION_RATE;
                      }
                  }
              }
          }

          // --- PROJECTILES ---
          if (entity.entityType === EntityType.Projectile) {
              const p = entity as Projectile;
              const target = state.entities[p.targetId];
              if (target) {
                  const dist = getDistance(p.position, target.position);
                  if (dist < 10) {
                      target.hp -= p.damage;
                      if (target.hp <= 0) entitiesToRemove.push(target.id);
                      entitiesToRemove.push(p.id);
                  } else {
                      const angle = Math.atan2(target.position.y - p.position.y, target.position.x - p.position.x);
                      p.position.x += Math.cos(angle) * p.speed;
                      p.position.y += Math.sin(angle) * p.speed;
                  }
              } else {
                  entitiesToRemove.push(p.id);
              }
          }

          // --- UNITS ---
          if (entity.entityType === EntityType.Unit) {
              const unit = entity as Unit;
              
              // Separation
              let sepX = 0, sepY = 0;
              entities.forEach(other => {
                  if (other.id !== unit.id && other.entityType === EntityType.Unit) {
                      const d = getDistance(unit.position, other.position);
                      if (d < unit.radius + other.radius) {
                          const push = (unit.radius + other.radius - d) / 2;
                          const angle = Math.atan2(unit.position.y - other.position.y, unit.position.x - other.position.x);
                          sepX += Math.cos(angle) * push;
                          sepY += Math.sin(angle) * push;
                      }
                  }
              });
              unit.position.x += sepX * 0.1;
              unit.position.y += sepY * 0.1;

              // Auto-Acquire Targets
              if ((unit.state === 'IDLE' || unit.state === 'ATTACK_MOVING') && unit.owner !== PlayerType.Neutral) {
                  const range = unit.state === 'ATTACK_MOVING' ? 250 : 150;
                  const enemy = entities.find(e => 
                      e.owner !== unit.owner && e.owner !== PlayerType.Neutral && e.entityType !== EntityType.Resource &&
                      getDistance(unit.position, e.position) < range
                  );
                  if (enemy) {
                      const wasAttackMoving = unit.state === 'ATTACK_MOVING';
                      unit.targetId = enemy.id;
                      unit.state = 'ATTACKING';
                      if (!wasAttackMoving) unit.moveTarget = null;
                  }
              }

              let moveDest = unit.moveTarget;

              if (unit.state === 'ATTACKING' || unit.state === 'GATHERING' || unit.state === 'BUILDING') {
                  const target = state.entities[unit.targetId || ''];
                  if (!target) {
                      unit.state = 'IDLE'; 
                      unit.targetId = null;
                  } else {
                      let range = 10;
                      if (unit.state === 'ATTACKING') range = unit.attackRange;
                      if (unit.state === 'GATHERING') range = 5;
                      if (unit.state === 'BUILDING') range = 10;

                      const dist = getDistance(unit.position, target.position);
                      if (dist <= range + target.radius + unit.radius) {
                          moveDest = null;
                          if (time - unit.lastAttackTime > unit.attackCooldown) {
                              unit.lastAttackTime = time;
                              
                              if (unit.state === 'ATTACKING') {
                                  if (unit.unitType === UnitType.Archer) {
                                      const pid = generateId();
                                      state.entities[pid] = {
                                          id: pid, entityType: EntityType.Projectile, owner: unit.owner,
                                          position: { ...unit.position }, radius: 2, hp: 1, maxHp: 1,
                                          targetId: target.id, damage: unit.attackDamage, speed: 8
                                      } as Projectile;
                                  } else {
                                      target.hp -= unit.attackDamage;
                                      if (target.hp <= 0) entitiesToRemove.push(target.id);
                                  }
                              } else if (unit.state === 'GATHERING') {
                                  if (target.entityType === EntityType.Resource) {
                                      const res = target as Resource;
                                      if (res.amount > 0) {
                                          res.amount -= GATHER_RATE;
                                          const type = res.resourceType === ResourceType.Wood ? 'wood' : 'food';
                                          state.players[unit.owner].resources[type] += GATHER_RATE;
                                          if (res.amount <= 0) entitiesToRemove.push(res.id);
                                      }
                                  } else if (target.entityType === EntityType.Building && (target as Building).buildingType === BuildingType.Farm) {
                                      // Working a Farm
                                      const farm = target as Building;
                                      if (farm.isBuilt && (farm.resourceAmount || 0) > 0) {
                                          farm.resourceAmount = (farm.resourceAmount || 0) - FARM_WORKER_BOOST;
                                          state.players[unit.owner].resources.food += FARM_WORKER_BOOST;
                                      }
                                  }
                              } else if (unit.state === 'BUILDING' && target.entityType === EntityType.Building) {
                                  const b = target as Building;
                                  if (!b.isBuilt) {
                                      b.constructionProgress += 2;
                                      b.hp += 5;
                                      if (b.constructionProgress >= 100) {
                                          b.isBuilt = true;
                                          b.hp = b.maxHp;
                                          if (b.buildingType === BuildingType.Farm) {
                                              b.resourceAmount = FARM_MAX_FOOD;
                                              b.maxResourceAmount = FARM_MAX_FOOD;
                                          }
                                          unit.state = 'IDLE';
                                      }
                                  }
                              }
                          }
                      } else {
                          const angle = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
                          moveDest = { 
                              x: unit.position.x + Math.cos(angle) * 20, 
                              y: unit.position.y + Math.sin(angle) * 20 
                          };
                      }
                  }
              }

              if (moveDest) {
                  const dist = getDistance(unit.position, moveDest);
                  if (dist < unit.moveSpeed) {
                      unit.position.x = moveDest.x;
                      unit.position.y = moveDest.y;
                      if (!unit.targetId && unit.state === 'MOVING') unit.state = 'IDLE';
                  } else {
                      const angle = Math.atan2(moveDest.y - unit.position.y, moveDest.x - unit.position.x);
                      unit.position.x += Math.cos(angle) * unit.moveSpeed;
                      unit.position.y += Math.sin(angle) * unit.moveSpeed;
                  }
              }
          }
      });

      entitiesToRemove.forEach(id => delete state.entities[id]);
      state.gameTime += dt;
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return { gameState: stateRef.current, stateRef, setGameState };
};