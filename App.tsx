import React, { useEffect, useState } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
import GameMap from './components/GameMap';
import HUD from './components/HUD';
import { UnitType, BuildingType, EntityType, Unit, Building, PlayerType, MAP_WIDTH, MAP_HEIGHT } from './types';
import { UNIT_COSTS, BUILDING_COSTS, BUILDING_STATS, FARM_MAX_FOOD } from './constants';

const App: React.FC = () => {
  const { gameState, setGameState, stateRef } = useGameEngine();
  const [commandMode, setCommandMode] = useState<'ATTACK' | null>(null);

  // --- CONTROLS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        
        // Actions
        if (key === 'h') { // Stop
             const newEntities = { ...stateRef.current.entities };
             stateRef.current.selectedEntityIds.forEach(id => {
                const u = newEntities[id] as Unit;
                if(u && u.entityType === EntityType.Unit) { u.state = 'IDLE'; u.targetId = null; u.moveTarget = null; }
             });
        }
        if (key === 'r') { // Attack Move Mode
            if (stateRef.current.selectedEntityIds.length > 0) setCommandMode('ATTACK');
        }
        if (key === 'escape') {
            setCommandMode(null);
            setGameState(prev => ({ ...prev, buildingToPlace: null }));
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelection = (idOrList: string, multi: boolean) => {
      setCommandMode(null);
      let ids: string[] = [];
      if (multi) {
          ids = idOrList.split(',').filter(s => s.length > 0);
      } else {
          ids = idOrList ? [idOrList] : [];
      }
      
      stateRef.current.selectedEntityIds = ids;
      setGameState({ ...stateRef.current });
  };

  const handleAttackMove = (coords: { x: number; y: number }, targetId?: string) => {
      setCommandMode(null);
      const newEntities = { ...stateRef.current.entities };
      
      stateRef.current.selectedEntityIds.forEach(id => {
          const entity = newEntities[id];
          if (entity && entity.owner === PlayerType.Human && entity.entityType === EntityType.Unit) {
              const unit = entity as Unit;
              if (targetId) {
                  unit.targetId = targetId;
                  unit.state = 'ATTACKING';
                  unit.moveTarget = null;
              } else {
                  unit.moveTarget = coords;
                  unit.state = 'ATTACK_MOVING';
                  unit.targetId = null;
              }
          }
      });
      setGameState({ ...stateRef.current }); 
  };

  const handleRightClick = (coords: { x: number; y: number }, targetId?: string) => {
    setCommandMode(null);
    if (gameState.buildingToPlace) {
        setGameState(prev => ({ ...prev, buildingToPlace: null }));
        return;
    }

    const { selectedEntityIds, entities } = stateRef.current;
    
    selectedEntityIds.forEach(id => {
        const entity = entities[id];
        if (entity && entity.owner === PlayerType.Human && entity.entityType === EntityType.Unit) {
            const unit = entity as Unit;
            unit.moveTarget = { x: coords.x, y: coords.y };
            unit.state = 'MOVING';
            unit.targetId = null;

            if (targetId) {
                const target = entities[targetId];
                if (target && target.id !== unit.id) {
                    unit.targetId = targetId;
                    if (target.owner !== PlayerType.Human && target.entityType !== EntityType.Resource) {
                        unit.state = 'ATTACKING';
                        unit.moveTarget = null;
                    } else if (target.entityType === EntityType.Resource && unit.unitType === UnitType.Peasant) {
                        unit.state = 'GATHERING';
                    } else if (target.entityType === EntityType.Building) {
                        const b = target as Building;
                        if (unit.unitType === UnitType.Peasant) {
                             if (!b.isBuilt || b.hp < b.maxHp) {
                                 unit.state = 'BUILDING';
                             } else if (b.buildingType === BuildingType.Farm) {
                                 if ((b.resourceAmount || 0) > 0) {
                                     unit.state = 'GATHERING'; // Work the farm
                                 } else {
                                     // Reseed Logic
                                     if (stateRef.current.players[PlayerType.Human].resources.wood >= 20) {
                                         stateRef.current.players[PlayerType.Human].resources.wood -= 20;
                                         b.resourceAmount = FARM_MAX_FOOD;
                                         unit.state = 'GATHERING';
                                     }
                                 }
                             }
                        }
                    }
                }
            }
        }
    });
    setGameState({ ...stateRef.current });
  };

  const handlePlaceBuilding = (coords: { x: number; y: number }) => {
     if (!gameState.buildingToPlace) return;
     const type = gameState.buildingToPlace;
     const cost = BUILDING_COSTS[type];
     
     const players = stateRef.current.players;
     players[PlayerType.Human].resources.wood -= cost.wood;
     players[PlayerType.Human].resources.food -= cost.food;

     const id = Math.random().toString(36).substr(2, 9);
     const newBuilding: Building = {
         id, entityType: EntityType.Building, buildingType: type, owner: PlayerType.Human,
         position: coords, hp: 1, maxHp: BUILDING_STATS[type].hp, radius: BUILDING_STATS[type].radius,
         constructionProgress: 0, isBuilt: false, productionQueue: []
     };
     
     if (type === BuildingType.Farm) {
         newBuilding.resourceAmount = FARM_MAX_FOOD;
         newBuilding.maxResourceAmount = FARM_MAX_FOOD;
         newBuilding.lastGenerationTime = 0;
     }

     stateRef.current.entities[id] = newBuilding;

     // Assign selected peasants
     stateRef.current.selectedEntityIds.forEach(uId => {
         const u = stateRef.current.entities[uId] as Unit;
         if (u && u.unitType === UnitType.Peasant) {
             u.targetId = id;
             u.state = 'BUILDING';
         }
     });
     
     stateRef.current.buildingToPlace = null;
     setGameState({ ...stateRef.current });
  };

  const handleAction = (action: string, payload: any) => {
      if (action === 'TRAIN') {
          const unitType = payload as UnitType;
          const selectedId = gameState.selectedEntityIds[0];
          const building = stateRef.current.entities[selectedId] as Building;
          const cost = UNIT_COSTS[unitType];

          if (building && building.productionQueue) {
              const p = stateRef.current.players[PlayerType.Human];
              p.resources.wood -= cost.wood;
              p.resources.food -= cost.food;
              building.productionQueue.push({ unitType, timeLeft: cost.time * 1000 });
              setGameState({ ...stateRef.current });
          }
      } else if (action === 'BUILD') {
          stateRef.current.buildingToPlace = payload;
          setGameState({ ...stateRef.current });
      }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-black text-white">
      <div className="flex-1 relative overflow-hidden">
         {gameState.gameOver && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
                 <div className="text-6xl font-bold text-white">
                     {gameState.winner === PlayerType.Human ? 'VICTORY' : 'DEFEAT'}
                 </div>
             </div>
         )}
         <GameMap 
            stateRef={stateRef}
            gameState={gameState} 
            commandMode={commandMode}
            onSelection={handleSelection} 
            onRightClick={handleRightClick}
            onPlaceBuilding={handlePlaceBuilding}
            onAttackMove={handleAttackMove}
        />
        {/* Helper Text */}
        <div className="absolute top-4 left-4 bg-black/50 p-2 text-xs rounded pointer-events-none select-none z-10">
            <div>WASD / Mouse Edge: Camera</div>
            <div>Left Click: Select | Drag: Box Select</div>
            <div>Right Click: Move / Gather / Attack / Work Farm</div>
            <div>Right Click Depleted Farm: Reseed (20 Wood)</div>
        </div>
      </div>
      <HUD gameState={gameState} onAction={handleAction} />
    </div>
  );
};

export default App;