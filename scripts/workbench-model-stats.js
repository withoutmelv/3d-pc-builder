import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import {
  createBoard,
  createCooler,
  createPasteTube,
  createCPU,
  createMemory,
  createCase,
  createPanel,
  createDriver,
  createScrew,
  createWorkshop,
} from '../web/src/three/workbench-models.js';

// Structural measurements only: no browser, renderer, text pixels or GPU timing.
export function createModelFixture() {
  const scene = new THREE.Scene();
  const board = createBoard();
  const models = {
    cooler: createCooler(),
    pasteTube: createPasteTube(),
    workshop: createWorkshop(scene),
    board: board.group,
    cpu: createCPU(),
    memory0: createMemory(),
    memory1: createMemory(),
    case: createCase(),
    panel: createPanel(),
    driver: createDriver(),
    screws: new THREE.Group(),
  };
  for (let i = 0; i < 16; i++) models.screws.add(createScrew());
  for (const model of Object.values(models)) if (!model.parent) scene.add(model);
  return { scene, models, board };
}

export function modelStats(root) {
  let meshes = 0;
  let triangles = 0;
  let shadowCasters = 0;
  let labelTextures = 0;
  const materials = new Set();
  const geometries = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    if (object.castShadow) shadowCasters++;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (material.map) labelTextures++;
    }
  });
  const bounds = new THREE.Box3().setFromObject(root);
  return {
    meshes,
    materials: materials.size,
    geometries: geometries.size,
    triangles,
    shadowCasters,
    labelTextures,
    bounds: [bounds.min.toArray(), bounds.max.toArray()].map((point) =>
      point.map((value) => Number(value.toFixed(4))),
    ),
  };
}

export function disposeModelFixture(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (!object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = createModelFixture();
  console.log(
    JSON.stringify(
      {
        scope:
          'Workbench model factories, including all 16 screws; excludes hands, lights and interaction proxies',
        models: Object.fromEntries(
          Object.entries(fixture.models).map(([name, root]) => [name, modelStats(root)]),
        ),
        total: modelStats(fixture.scene),
      },
      null,
      2,
    ),
  );
  disposeModelFixture(fixture.scene);
}
