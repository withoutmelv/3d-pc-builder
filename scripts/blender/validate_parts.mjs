// Asset acceptance: load the actual exported files using the project's Three.js.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Box3, Vector3, Raycaster } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fanCounts = { ram: 0, ssd: 0, gpu: 3, cooler: 2, psu: 1, case: 3 };
for (const [key, expectedFans] of Object.entries(fanCounts)) {
  const dir = path.join(root, 'assets', key);
  const bytes = fs.readFileSync(path.join(dir, `${key}.glb`));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  assert.equal(gltf.scenes.length, 1, `${key}: one scene`);
  assert.equal(gltf.scene.children.length, 1, `${key}: one asset root, no studio`);
  assert.equal(gltf.scene.children[0].name, `${key}_ROOT`);
  assert.equal(gltf.parser.json.images?.length ?? 0, 0, `${key}: no external reference photos used as textures`);
  gltf.scene.updateMatrixWorld(true);
  let meshes = 0, triangles = 0;
  const fans = [], rotors = [], anchors = [], clips = [], covers = [];
  gltf.scene.traverse(o => {
    if (o.userData.kind === 'fan') fans.push(o);
    if (o.userData.kind === 'rotor') rotors.push(o);
    if (o.name.includes('ANCHOR_') && !o.isMesh) anchors.push(o.name);
    if (o.userData.kind === 'spring_wire_clip') clips.push(o);
    if (o.userData.kind === 'removable_pcie_cover') covers.push(o);
    if (!o.isMesh) return;
    meshes++;
    const geom = o.geometry;
    for (const a of Object.values(geom.attributes)) assert(a.array.every(Number.isFinite), `${o.name}: finite attributes`);
    if (geom.index) assert(geom.index.array.every(i => i < geom.attributes.position.count), `${o.name}: valid indices`);
    triangles += (geom.index?.count ?? geom.attributes.position.count) / 3;
  });
  assert.equal(fans.length, expectedFans, `${key}: fan assemblies`);
  assert.equal(rotors.length, expectedFans, `${key}: independent rotors`);
  assert(anchors.length > 0, `${key}: assembly anchors`);
  assert(triangles < 60000, `${key}: bounded first-pass mesh budget`);
  if (key === 'cooler') {
    assert.equal(clips.length, 4);
    for (const fan of fans) {
      const axis = new Vector3(0, 1, 0).transformDirection(fan.matrixWorld);
      assert(Math.abs(axis.z) > .999, 'cooler fan axis horizontal in glTF, not upward');
    }
  }
  if (key === 'gpu') assert.deepEqual(rotors.map(o => o.userData.spin_sign).sort(), [-1, 1, 1]);
  if (key === 'case') assert.equal(covers.length, 7);
  const keyTests = {
    ram: { hole: [.0035 * 135/133, .1, .022 * 44/51.5], solid: [0, .1, .022 * 44/51.5] },
    ssd: { hole: [-.039, .1, 0], solid: [-.035, .1, 0] },
    gpu: { hole: [-.07, .1, .074], solid: [-.08, .1, .074] },
  };
  if (keyTests[key]) {
    const pcb = gltf.scene.getObjectByName(`${key}_${key === 'gpu' ? 'PCB' : 'Body'}_pcb`);
    assert(pcb);
    for (const [type, point] of Object.entries(keyTests[key])) {
      const hits = new Raycaster(new Vector3(...point), new Vector3(0, -1, 0)).intersectObject(pcb, false);
      assert.equal(hits.length > 0, type === 'solid', `${key}: true ${type} at keyed edge`);
    }
  }
  const bounds = new Box3().setFromObject(gltf.scene);
  const result = { status: 'passed', loader: 'Three.js GLTFLoader', meshes, triangles, fans: fans.length, independentRotors: rotors.length, anchors, clips: clips.length, slotCovers: covers.length, sizeMetres: bounds.getSize(new Vector3()).toArray(), keyGeometryRaycast: key in keyTests, noExternalTextures: true, websitePerformanceTested: false };
  fs.writeFileSync(path.join(dir, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`${key}: passed, ${meshes} meshes, ${triangles} triangles, ${fans.length} fans`);
}
