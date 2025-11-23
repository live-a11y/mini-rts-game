import React from 'react';
import { GameState, PlayerType, EntityType, BuildingType, UnitType, Building } from '../types';
import { UNIT_COSTS, BUILDING_COSTS } from '../constants';
import { Trees, Wheat, Users, Home, Tent, Sprout, Sword, Zap } from 'lucide-react';

interface HUDProps {
  gameState: GameState;
  onAction: (action: string, payload?: any) => void;
}

const HUD: React.FC<HUDProps> = ({ gameState, onAction }) => {
  const player = gameState.players[PlayerType.Human];
  const selectedIds = gameState.selectedEntityIds;
  
  const firstSelected = selectedIds.length > 0 ? gameState.entities[selectedIds[0]] : null;

  const renderActionButtons = () => {
    if (!firstSelected || firstSelected.owner !== PlayerType.Human) return <div className="text-gray-400 text-sm">Select a unit or building</div>;

    if (firstSelected.entityType === EntityType.Building) {
        const b = firstSelected as Building;
        if (!b.isBuilt) return <div className="text-yellow-500">Under Construction ({Math.floor(b.constructionProgress)}%)</div>;

        if (b.buildingType === BuildingType.TownCenter) {
            const cost = UNIT_COSTS[UnitType.Peasant];
            const canAfford = player.resources.wood >= cost.wood && player.resources.food >= cost.food;
            return (
                <button 
                    disabled={!canAfford}
                    onClick={() => onAction('TRAIN', UnitType.Peasant)}
                    className={`flex flex-col items-center p-2 rounded border ${canAfford ? 'bg-blue-600 hover:bg-blue-500 border-blue-400' : 'bg-gray-700 border-gray-600 opacity-50'}`}
                >
                    <Users size={20} />
                    <span className="text-xs mt-1">Peasant</span>
                    <div className="text-[10px] flex gap-1">
                        <span className="text-green-300">{cost.food}F</span>
                    </div>
                </button>
            );
        }
        if (b.buildingType === BuildingType.Barracks) {
            return (
                <div className="flex gap-2">
                    {[UnitType.Militia, UnitType.Archer].map(uType => {
                        const cost = UNIT_COSTS[uType];
                        const canAfford = player.resources.wood >= cost.wood && player.resources.food >= cost.food;
                        return (
                            <button 
                                key={uType}
                                disabled={!canAfford}
                                onClick={() => onAction('TRAIN', uType)}
                                className={`flex flex-col items-center p-2 rounded border ${canAfford ? 'bg-red-600 hover:bg-red-500 border-red-400' : 'bg-gray-700 border-gray-600 opacity-50'}`}
                            >
                                {uType === UnitType.Militia && <Sword size={20} />}
                                {uType === UnitType.Archer && <Zap size={20} />}
                                <span className="text-xs mt-1 capitalize">{uType.toLowerCase()}</span>
                                <div className="text-[10px] flex gap-1">
                                    <span className="text-amber-600">{cost.wood}W</span>
                                    <span className="text-green-300">{cost.food}F</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            );
        }
    } else if (firstSelected.entityType === EntityType.Unit && (firstSelected as any).unitType === UnitType.Peasant) {
        return (
             <div className="flex gap-2">
                 {[BuildingType.House, BuildingType.Barracks, BuildingType.Farm].map(bType => {
                      const cost = BUILDING_COSTS[bType];
                      const canAfford = player.resources.wood >= cost.wood && player.resources.food >= cost.food;
                      let Icon = Home;
                      if (bType === BuildingType.Barracks) Icon = Tent;
                      if (bType === BuildingType.Farm) Icon = Sprout;

                      return (
                        <button 
                            key={bType}
                            disabled={!canAfford}
                            onClick={() => onAction('BUILD', bType)}
                            className={`flex flex-col items-center p-2 rounded border ${canAfford ? 'bg-green-700 hover:bg-green-600 border-green-500' : 'bg-gray-700 border-gray-600 opacity-50'}`}
                        >
                            <Icon size={20} />
                            <span className="text-xs mt-1 capitalize">{bType.toLowerCase().replace('_', ' ')}</span>
                            <div className="text-[10px] flex gap-1">
                                <span className="text-amber-600">{cost.wood}W</span>
                            </div>
                        </button>
                      );
                 })}
             </div>
        );
    }
    return <div className="text-gray-400 text-sm">Unit Ready</div>;
  };

  return (
    <div className="absolute bottom-0 left-0 w-full h-40 bg-gray-900 border-t-2 border-gray-700 flex text-white font-sans">
      {/* Info Panel */}
      <div className="w-48 border-r border-gray-700 p-4 flex flex-col gap-1 bg-gray-800">
         {firstSelected ? (
             <>
                <div className="font-bold text-lg capitalize">
                    { (firstSelected as any).unitType?.toLowerCase() || (firstSelected as any).buildingType?.toLowerCase().replace('_', ' ') }
                </div>
                <div className="text-sm text-gray-300">HP: {Math.floor(firstSelected.hp)} / {firstSelected.maxHp}</div>
                
                {firstSelected.entityType === EntityType.Building && (firstSelected as Building).buildingType === BuildingType.Farm && (
                     <div className={`text-xs ${(firstSelected as Building).resourceAmount! <= 0 ? 'text-red-500' : 'text-green-300'}`}>
                         Food Left: {Math.floor((firstSelected as Building).resourceAmount || 0)}
                         {(firstSelected as Building).resourceAmount! <= 0 && " (DEPLETED)"}
                     </div>
                )}

                {firstSelected.entityType === EntityType.Building && (firstSelected as Building).productionQueue.length > 0 && (
                     <div className="text-xs text-blue-300 animate-pulse">
                         Training... {(firstSelected as Building).productionQueue.length} queued
                     </div>
                )}
             </>
         ) : (
             <div className="text-gray-500 italic text-sm">No selection</div>
         )}
      </div>

      {/* Action Grid */}
      <div className="flex-1 p-4 flex items-center justify-start gap-4">
          {renderActionButtons()}
          {gameState.buildingToPlace && (
              <div className="ml-auto text-yellow-400 animate-pulse font-bold">
                  Placing {gameState.buildingToPlace}... (Right Click Cancel)
              </div>
          )}
      </div>

      {/* Resources Overlay */}
      <div className="absolute -top-10 right-4 flex gap-4 bg-gray-900/90 p-2 rounded-lg border border-gray-600 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2 text-amber-500 font-bold">
            <Trees size={18} />
            <span>{Math.floor(player.resources.wood)}</span>
        </div>
        <div className="flex items-center gap-2 text-green-500 font-bold">
            <Wheat size={18} />
            <span>{Math.floor(player.resources.food)}</span>
        </div>
        <div className="flex items-center gap-2 text-blue-300 font-bold border-l border-gray-600 pl-4">
            <Users size={18} />
            <span>{player.population} / {player.maxPopulation}</span>
        </div>
      </div>
    </div>
  );
};

export default HUD;