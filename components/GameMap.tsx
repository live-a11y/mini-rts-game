import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GameState, EntityType, UnitType, BuildingType, PlayerType, MAP_WIDTH, MAP_HEIGHT, ResourceType, GameEntity, Building, Unit, Projectile } from '../types';

interface GameMapProps {
  gameState: GameState;
  stateRef: React.MutableRefObject<GameState>;
  commandMode: 'ATTACK' | null;
  onSelection: (id: string, multi: boolean) => void;
  onRightClick: (coords: { x: number; y: number }, targetId?: string) => void;
  onPlaceBuilding: (coords: { x: number; y: number }) => void;
  onAttackMove: (coords: { x: number; y: number }, targetId?: string) => void;
}

const TEAM_COLORS = {
    [PlayerType.Human]: 0x2563EB, // Blue
    [PlayerType.AI]: 0xDC2626,    // Red
    [PlayerType.Neutral]: 0xA8A29E // Grey
};

// Reusable Geometries & Materials to reduce draw calls / memory
const GEOMETRIES = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 8, 8),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 8),
    plane: new THREE.PlaneGeometry(1, 1),
};

const MATERIALS = {
    selected: new THREE.MeshBasicMaterial({ color: 0x22C55E, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
    white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    wood: new THREE.MeshLambertMaterial({ color: 0x8B4513 }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x15803d }),
    stone: new THREE.MeshLambertMaterial({ color: 0x57534E }),
    skin: new THREE.MeshLambertMaterial({ color: 0xE2A478 }),
    gold: new THREE.MeshLambertMaterial({ color: 0xF59E0B }),
    iron: new THREE.MeshLambertMaterial({ color: 0x9CA3AF }),
    farmEarth: new THREE.MeshLambertMaterial({ color: 0x3F2C22 }),
    farmCrop: new THREE.MeshLambertMaterial({ color: 0x166534 }),
    farmDead: new THREE.MeshLambertMaterial({ color: 0xCA8A04 }),
};

const GameMap: React.FC<GameMapProps> = ({ stateRef, commandMode, onSelection, onRightClick, onPlaceBuilding, onAttackMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const meshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const groundRef = useRef<THREE.Mesh | null>(null);
  
  // Selection Box State
  const [selectionBox, setSelectionBox] = useState<{startX: number, startY: number, width: number, height: number} | null>(null);
  const dragStartRef = useRef<{x: number, y: number} | null>(null);

  // Ghost Building
  const ghostMeshRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- INIT THREE.JS ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c1917); // Dark background (Fog color)
    scene.fog = new THREE.Fog(0x1c1917, 500, 1800);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 10, 3000);
    camera.position.set(0, 600, 600); // High angle
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(500, 1000, 500);
    dirLight.castShadow = true;
    // Optimize shadow frustum for larger map
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 3000;
    dirLight.shadow.camera.left = -1500;
    dirLight.shadow.camera.right = 1500;
    dirLight.shadow.camera.top = 1500;
    dirLight.shadow.camera.bottom = -1500;
    scene.add(dirLight);

    // Ground Plane
    const groundGeo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x292524 }); // Earthy dark
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.set(MAP_WIDTH/2, 0, MAP_HEIGHT/2);
    scene.add(ground);
    groundRef.current = ground;

    // Grid Helper
    const grid = new THREE.GridHelper(MAP_WIDTH, 50, 0x555555, 0x333333);
    grid.position.set(MAP_WIDTH/2, 1, MAP_HEIGHT/2);
    scene.add(grid);

    // --- ANIMATION LOOP ---
    const clock = new THREE.Clock();

    const animate = () => {
        requestAnimationFrame(animate);
        const time = performance.now();
        const delta = clock.getDelta();
        const state = stateRef.current;

        // 1. Sync Camera
        const camTargetX = state.camera.x + window.innerWidth/2; 
        const camTargetZ = state.camera.y + window.innerHeight/2; 
        const camOffsetHeight = 500;
        const camOffsetZ = 400; 

        camera.position.set(state.camera.x + window.innerWidth/2, camOffsetHeight, state.camera.y + window.innerHeight/2 + camOffsetZ);
        camera.lookAt(state.camera.x + window.innerWidth/2, 0, state.camera.y + window.innerHeight/2);

        // 2. Sync Entities
        const entities = state.entities;
        const meshes = meshesRef.current;
        const activeIds = new Set<string>();

        // Update active entities
        Object.values(entities).forEach((entity: GameEntity) => {
            activeIds.add(entity.id);
            let meshGroup = meshes.get(entity.id);

            // Create if not exists
            if (!meshGroup) {
                meshGroup = createEntityMesh(entity);
                scene.add(meshGroup);
                meshes.set(entity.id, meshGroup);
            }

            // Sync Position
            if (!meshGroup.userData.isDying) {
                meshGroup.position.set(entity.position.x, 0, entity.position.y);
            }

            // Selection Ring
            const selectionRing = meshGroup.getObjectByName('selectionRing');
            if (selectionRing) {
                selectionRing.visible = state.selectedEntityIds.includes(entity.id);
            }

            // Update Unit Specifics
            if (entity.entityType === EntityType.Unit) {
                const u = entity as Unit;
                const model = meshGroup.getObjectByName('model');
                
                // Rotation
                if (u.moveTarget && (u.state === 'MOVING' || u.state === 'ATTACK_MOVING')) {
                    const angle = Math.atan2(u.moveTarget.y - u.position.y, u.moveTarget.x - u.position.x);
                    if (model) model.rotation.y = -angle + Math.PI/2; 
                } else if (u.targetId) {
                    const t = entities[u.targetId];
                    if (t) {
                        const angle = Math.atan2(t.position.y - u.position.y, t.position.x - u.position.x);
                        if (model) model.rotation.y = -angle + Math.PI/2;
                    }
                }

                // Bobbing Animation
                if (model && (u.state === 'MOVING' || u.state === 'ATTACK_MOVING')) {
                    model.position.y = Math.abs(Math.sin(time * 0.01)) * 2;
                } else if (model) {
                    model.position.y = 0;
                }
                
                // Arm Animation
                const arm = meshGroup.getObjectByName('arm');
                if (arm) {
                    if (u.state === 'ATTACKING' || u.state === 'GATHERING' || u.state === 'BUILDING') {
                        arm.rotation.x = Math.sin(time * 0.015) * 1.5;
                    } else {
                        arm.rotation.x = 0;
                    }
                }
            }

            // Update Building State
            if (entity.entityType === EntityType.Building) {
                const b = entity as Building;
                const scaffolding = meshGroup.getObjectByName('scaffolding');
                const completed = meshGroup.getObjectByName('completed');
                
                if (b.isBuilt) {
                    if (scaffolding) scaffolding.visible = false;
                    if (completed) completed.visible = true;
                    
                    if (b.buildingType === BuildingType.Farm) {
                        const crops = meshGroup.getObjectByName('crops');
                        if (crops) {
                            const isDepleted = (b.resourceAmount || 0) <= 0;
                            crops.children.forEach((c: any) => {
                                c.material = isDepleted ? MATERIALS.farmDead : MATERIALS.farmCrop;
                            });
                        }
                    }
                } else {
                    if (scaffolding) scaffolding.visible = true;
                    if (completed) completed.visible = false;
                }
            }
        });

        // Handle Death Animations & Removal
        meshes.forEach((mesh, id) => {
            if (!activeIds.has(id)) {
                // Trigger death if not already dying
                if (!mesh.userData.isDying) {
                    mesh.userData.isDying = true;
                    mesh.userData.deathStart = time;
                }
            }

            if (mesh.userData.isDying) {
                const deathDuration = 500;
                const elapsed = time - mesh.userData.deathStart;
                
                if (elapsed >= deathDuration) {
                    scene.remove(mesh);
                    meshes.delete(id);
                } else {
                    const progress = elapsed / deathDuration;
                    // Sink and Shrink
                    mesh.position.y = -progress * 20;
                    mesh.scale.setScalar(1 - progress * 0.5);
                    // Fade opacity if material supports it? 
                    // Lambert materials don't support opacity change easily without transparent=true.
                    // Sinking is enough visual feedback.
                }
            }
        });

        // 3. Ghost Building
        if (state.buildingToPlace) {
             if (!ghostMeshRef.current) {
                 const g = new THREE.Group();
                 const type = state.buildingToPlace;
                 const size = type === BuildingType.TownCenter ? 40 : type === BuildingType.Barracks ? 30 : 20;
                 const m = new THREE.Mesh(GEOMETRIES.box, MATERIALS.selected);
                 m.scale.set(size*2, 20, size*2);
                 m.position.y = 10;
                 g.add(m);
                 scene.add(g);
                 ghostMeshRef.current = g;
             }
        } else {
            if (ghostMeshRef.current) {
                scene.remove(ghostMeshRef.current);
                ghostMeshRef.current = null;
            }
        }

        renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        if (containerRef.current && renderer.domElement) {
             containerRef.current.removeChild(renderer.domElement);
        }
    };
  }, []);

  // --- MESH FACTORY ---
  const createEntityMesh = (entity: GameEntity): THREE.Group => {
      const group = new THREE.Group();
      
      // Selection Ring
      const ringGeo = new THREE.RingGeometry(entity.radius, entity.radius + 2, 32);
      const ring = new THREE.Mesh(ringGeo, MATERIALS.selected);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1;
      ring.name = 'selectionRing';
      ring.visible = false;
      group.add(ring);

      // Model Group
      const model = new THREE.Group();
      model.name = 'model';
      group.add(model);

      if (entity.entityType === EntityType.Unit) {
          const u = entity as Unit;
          const color = TEAM_COLORS[u.owner];
          const matTeam = new THREE.MeshLambertMaterial({ color });
          
          if (u.unitType === UnitType.Peasant) {
              const body = new THREE.Mesh(GEOMETRIES.cylinder, matTeam);
              body.scale.set(4, 10, 4);
              body.position.y = 5;
              body.castShadow = true;
              model.add(body);
              const head = new THREE.Mesh(GEOMETRIES.sphere, MATERIALS.skin);
              head.scale.set(4, 4, 4);
              head.position.y = 12;
              model.add(head);
              const hat = new THREE.Mesh(GEOMETRIES.cone, MATERIALS.wood);
              hat.scale.set(8, 3, 8);
              hat.position.y = 15;
              model.add(hat);
              const arm = new THREE.Group();
              arm.name = 'arm';
              arm.position.set(4, 8, 0);
              const armMesh = new THREE.Mesh(GEOMETRIES.box, MATERIALS.skin);
              armMesh.scale.set(2, 6, 2);
              armMesh.position.y = -3;
              arm.add(armMesh);
              const tool = new THREE.Mesh(GEOMETRIES.box, MATERIALS.iron);
              tool.scale.set(1, 8, 1);
              tool.position.set(0, -6, 2);
              tool.rotation.x = Math.PI/2;
              arm.add(tool);
              model.add(arm);

          } else if (u.unitType === UnitType.Militia) {
               const body = new THREE.Mesh(GEOMETRIES.box, MATERIALS.iron); 
               body.scale.set(6, 12, 6);
               body.position.y = 6;
               body.castShadow = true;
               model.add(body);
               const head = new THREE.Mesh(GEOMETRIES.sphere, MATERIALS.iron);
               head.scale.set(4.5, 4.5, 4.5);
               head.position.y = 14;
               model.add(head);
               const shield = new THREE.Mesh(GEOMETRIES.cylinder, matTeam);
               shield.scale.set(6, 1, 6);
               shield.rotation.x = Math.PI/2;
               shield.rotation.z = Math.PI/2;
               shield.position.set(-5, 8, 2);
               model.add(shield);
               const arm = new THREE.Group();
               arm.name = 'arm';
               arm.position.set(5, 8, 0);
               const sword = new THREE.Mesh(GEOMETRIES.box, MATERIALS.white);
               sword.scale.set(1, 10, 1);
               sword.position.set(0, 3, 4);
               sword.rotation.x = Math.PI/2;
               arm.add(sword);
               model.add(arm);
          } else if (u.unitType === UnitType.Archer) {
              const body = new THREE.Mesh(GEOMETRIES.cylinder, matTeam);
              body.scale.set(3, 11, 3);
              body.position.y = 5.5;
              body.castShadow = true;
              model.add(body);
              const head = new THREE.Mesh(GEOMETRIES.sphere, MATERIALS.skin);
              head.position.y = 12;
              head.scale.set(3.5, 3.5, 3.5);
              model.add(head);
              const arm = new THREE.Group();
              arm.name = 'arm';
              arm.position.set(3, 8, 0);
              const bow = new THREE.Mesh(GEOMETRIES.cone, MATERIALS.wood);
              bow.scale.set(1, 10, 1);
              bow.rotation.z = Math.PI/4;
              arm.add(bow);
              model.add(arm);
          }

      } else if (entity.entityType === EntityType.Building) {
          const b = entity as Building;
          const color = TEAM_COLORS[b.owner];
          const matTeam = new THREE.MeshLambertMaterial({ color });
          const matRoof = new THREE.MeshLambertMaterial({ color: b.owner === PlayerType.AI ? 0x7F1D1D : 0x1E3A8A });

          const scaffolding = new THREE.Group();
          scaffolding.name = 'scaffolding';
          const poles = new THREE.Mesh(GEOMETRIES.box, MATERIALS.wood);
          poles.scale.set(b.radius*1.5, b.radius, b.radius*1.5);
          poles.position.y = b.radius/2;
          scaffolding.add(poles);
          group.add(scaffolding);

          const completed = new THREE.Group();
          completed.name = 'completed';
          group.add(completed);

          if (b.buildingType === BuildingType.TownCenter) {
              const base = new THREE.Mesh(GEOMETRIES.box, matTeam);
              base.scale.set(60, 40, 60);
              base.position.y = 20;
              base.castShadow = true;
              base.receiveShadow = true;
              completed.add(base);
              const roof = new THREE.Mesh(GEOMETRIES.cone, matRoof);
              roof.scale.set(50, 30, 50);
              roof.position.y = 55;
              roof.rotation.y = Math.PI/4;
              completed.add(roof);
          } else if (b.buildingType === BuildingType.Barracks) {
              const base = new THREE.Mesh(GEOMETRIES.box, matTeam);
              base.scale.set(60, 25, 40);
              base.position.y = 12.5;
              base.castShadow = true;
              completed.add(base);
              const roof = new THREE.Mesh(GEOMETRIES.cone, matRoof);
              roof.scale.set(45, 20, 45);
              roof.position.y = 35;
              completed.add(roof);
          } else if (b.buildingType === BuildingType.House) {
              const base = new THREE.Mesh(GEOMETRIES.box, matTeam);
              base.scale.set(25, 20, 25);
              base.position.y = 10;
              base.castShadow = true;
              completed.add(base);
              const roof = new THREE.Mesh(GEOMETRIES.cone, matRoof);
              roof.scale.set(20, 15, 20);
              roof.position.y = 27;
              completed.add(roof);
          } else if (b.buildingType === BuildingType.Farm) {
              const patch = new THREE.Mesh(GEOMETRIES.box, MATERIALS.farmEarth);
              patch.scale.set(50, 2, 50);
              patch.position.y = 1;
              patch.receiveShadow = true;
              completed.add(patch);
              const crops = new THREE.Group();
              crops.name = 'crops';
              for(let i=0; i<3; i++) {
                  const row = new THREE.Mesh(GEOMETRIES.box, MATERIALS.farmCrop);
                  row.scale.set(40, 4, 8);
                  row.position.set(0, 4, -15 + (i*15));
                  crops.add(row);
              }
              completed.add(crops);
          }

      } else if (entity.entityType === EntityType.Resource) {
          const res = entity as any;
          if (res.resourceType === ResourceType.Wood) {
              const trunk = new THREE.Mesh(GEOMETRIES.cylinder, MATERIALS.wood);
              trunk.scale.set(3, 10, 3);
              trunk.position.y = 5;
              trunk.castShadow = true;
              model.add(trunk);
              const leaves = new THREE.Mesh(GEOMETRIES.cone, MATERIALS.leaf);
              leaves.scale.set(10, 20, 10);
              leaves.position.y = 15;
              leaves.castShadow = true;
              model.add(leaves);
          } else {
              const bush = new THREE.Mesh(GEOMETRIES.sphere, MATERIALS.leaf);
              bush.scale.set(10, 8, 10);
              bush.position.y = 4;
              model.add(bush);
          }
      } else if (entity.entityType === EntityType.Projectile) {
          const p = new THREE.Mesh(GEOMETRIES.sphere, MATERIALS.white);
          p.scale.set(3, 3, 3); // Make projectiles visible
          p.position.y = 15; // Fly higher
          model.add(p);
      }

      return group;
  };

  // --- INPUT HANDLING ---
  
  const getGroundIntersection = (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !cameraRef.current || !groundRef.current) return null;

      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera({ x, y }, cameraRef.current);
      const intersects = raycasterRef.current.intersectObject(groundRef.current);
      
      if (intersects.length > 0) {
          return intersects[0].point;
      }
      return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      const point = getGroundIntersection(e.clientX, e.clientY);
      if (!point) return;

      dragStartRef.current = { x: e.clientX, y: e.clientY };

      if (e.button === 0) { // Left
           if (commandMode === 'ATTACK') {
               onAttackMove({ x: point.x, y: point.z });
               return;
           }
           if (stateRef.current.buildingToPlace) {
               onPlaceBuilding({ x: point.x, y: point.z });
               return;
           }
           setSelectionBox({ startX: e.clientX, startY: e.clientY, width: 0, height: 0 });
      } else if (e.button === 2) { // Right
           const worldX = point.x;
           const worldZ = point.z;
           
           const clickedEntity = (Object.values(stateRef.current.entities) as GameEntity[]).find((ent) => {
               const dist = Math.sqrt(Math.pow(ent.position.x - worldX, 2) + Math.pow(ent.position.y - worldZ, 2));
               return dist < ent.radius + 15;
           });

           onRightClick({ x: worldX, y: worldZ }, clickedEntity?.id);
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const point = getGroundIntersection(e.clientX, e.clientY);
      
      // Update Ghost Position
      if (ghostMeshRef.current && point) {
          ghostMeshRef.current.position.set(point.x, 0, point.z);
      }

      // Update Selection Box
      if (dragStartRef.current && selectionBox) {
          const width = e.clientX - dragStartRef.current.x;
          const height = e.clientY - dragStartRef.current.y;
          setSelectionBox({ ...selectionBox, width, height });
      }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      if (e.button === 0 && selectionBox && dragStartRef.current) {
          // If box is small, treat as single click
          if (Math.abs(selectionBox.width) < 5 && Math.abs(selectionBox.height) < 5) {
              const point = getGroundIntersection(e.clientX, e.clientY);
              if (point) {
                   const clickedEntity = (Object.values(stateRef.current.entities) as GameEntity[]).find((ent) => {
                       const dist = Math.sqrt(Math.pow(ent.position.x - point.x, 2) + Math.pow(ent.position.y - point.z, 2));
                       return dist < ent.radius + 15;
                   });
                   onSelection(clickedEntity?.id || '', false);
              }
          } else {
              const ids: string[] = [];
              const startX = Math.min(dragStartRef.current.x, e.clientX);
              const endX = Math.max(dragStartRef.current.x, e.clientX);
              const startY = Math.min(dragStartRef.current.y, e.clientY);
              const endY = Math.max(dragStartRef.current.y, e.clientY);

              (Object.values(stateRef.current.entities) as GameEntity[]).forEach((ent) => {
                  if (ent.owner === PlayerType.Human && ent.entityType === EntityType.Unit) {
                      // Project to screen
                      const vec = new THREE.Vector3(ent.position.x, 0, ent.position.y);
                      if (cameraRef.current) {
                          vec.project(cameraRef.current);
                          const screenX = (vec.x + 1) * window.innerWidth / 2;
                          const screenY = -(vec.y - 1) * window.innerHeight / 2;
                          
                          if (screenX >= startX && screenX <= endX && screenY >= startY && screenY <= endY) {
                              ids.push(ent.id);
                          }
                      }
                  }
              });
              
              if (ids.length > 0) onSelection(ids.join(','), true);
              else onSelection('', false);
          }
      }

      dragStartRef.current = null;
      setSelectionBox(null);
  };

  return (
    <div ref={containerRef} 
        className="w-full h-full relative" 
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={e => e.preventDefault()}
    >
      {selectionBox && (
          <div style={{
              position: 'absolute',
              left: Math.min(selectionBox.startX, selectionBox.startX + selectionBox.width),
              top: Math.min(selectionBox.startY, selectionBox.startY + selectionBox.height),
              width: Math.abs(selectionBox.width),
              height: Math.abs(selectionBox.height),
              border: '2px solid #22C55E',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              pointerEvents: 'none'
          }} />
      )}
      <div className="absolute top-0 right-0 p-4 text-white text-right pointer-events-none select-none z-10">
          <div className="font-bold text-lg">3D View</div>
          <div className="text-xs opacity-70">WASD / Mouse Edge to Pan</div>
      </div>
    </div>
  );
};

export default GameMap;