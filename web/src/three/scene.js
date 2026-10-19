import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPartModel } from './models';
import { placement } from './placement';
export function createScene(element, onSelect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1118');
  scene.fog = new THREE.Fog('#0d1118', 1400, 2900);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  element.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 5000);
  camera.position.set(560, 410, 870);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 230, 0);
  controls.enableDamping = true;
  controls.minDistance = 480;
  controls.maxDistance = 1800;
  controls.maxPolarAngle = Math.PI * 0.87;
  controls.enablePan = false;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room);
  scene.environment = env.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#d1e2ff', '#182032', 1.1));
  const light = new THREE.DirectionalLight('#e4efff', 2.8);
  light.position.set(200, 800, 500);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {
    left: -500,
    right: 500,
    top: 600,
    bottom: -600,
    near: 1,
    far: 2000,
  });
  light.shadow.bias = -0.0004;
  scene.add(light);
  const rim = new THREE.DirectionalLight('#6598ef', 2.5);
  rim.position.set(-500, 300, -200);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({
      color: '#050911',
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.1,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -23;
  floor.receiveShadow = true;
  scene.add(floor);
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(325, 335, 12, 96),
    new THREE.MeshStandardMaterial({
      color: '#101a28',
      roughness: 0.65,
      metalness: 0.25,
      envMapIntensity: 0.25,
    }),
  );
  plinth.position.y = -17;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  scene.add(plinth);
  const stageEdge = new THREE.Mesh(
    new THREE.TorusGeometry(326, 0.8, 6, 96),
    new THREE.MeshBasicMaterial({ color: '#7dabe7', transparent: true, opacity: 0.22 }),
  );
  stageEdge.rotation.x = -Math.PI / 2;
  stageEdge.position.y = -11;
  scene.add(stageEdge);
  const root = new THREE.Group();
  scene.add(root);
  const models = new Map();
  let rotors = [];
  let selected = '',
    sidePanel = false,
    disposed = false,
    frame = 0,
    targetPosition = null;
  function disposeModel(model) {
    model.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) o.material.dispose();
    });
  }
  function applyState() {
    models.forEach((model) =>
      model.traverse((o) => {
        if (o.userData.sidePanel) o.visible = sidePanel;
        if (o.material?.emissive && o.userData.baseEmissive) {
          o.material.emissive.copy(o.userData.baseEmissive);
          o.material.emissiveIntensity = o.userData.baseIntensity;
          if (
            model.userData.category === selected &&
            !o.userData.sidePanel &&
            o.userData.baseIntensity <= 1
          ) {
            o.material.emissive.set('#377cc0');
            o.material.emissiveIntensity = 0.15;
          }
        }
      }),
    );
  }
  function update(parts, category, glass) {
    selected = category;
    sidePanel = glass;
    for (const [key, model] of models)
      if (!parts[key] || parts[key].id !== model.userData.partId) {
        root.remove(model);
        disposeModel(model);
        models.delete(key);
      }
    for (const [key, part] of Object.entries(parts))
      if (!models.has(key)) {
        const model = createPartModel(part);
        model.userData.partId = part.id;
        model.position.set(...placement[key]);
        root.add(model);
        models.set(key, model);
      }
    rotors = [];
    models.forEach((model) =>
      model.traverse((object) => {
        if (object.userData.rotor) rotors.push(object.userData.rotor);
      }),
    );
    applyState();
  }
  const observer = new ResizeObserver(() => {
    const { width, height } = element.getBoundingClientRect();
    if (width && height) {
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(18)) / Math.min(camera.aspect / 0.95, 1)),
      );
      camera.updateProjectionMatrix();
    }
  });
  observer.observe(element);
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down;
  const onDown = (e) => {
    down = [e.clientX, e.clientY];
    targetPosition = null;
  };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hits = ray
      .intersectObjects(root.children, true)
      .filter((h) => h.object.visible && !h.object.userData.sidePanel);
    if (hits[0]) {
      let o = hits[0].object;
      while (o.parent && !o.userData.category) o = o.parent;
      if (o.userData.category) onSelect(o.userData.category);
    }
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previousTime = 0;
  function loop(time = 0) {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    if (targetPosition) {
      camera.position.lerp(targetPosition, reduced ? 1 : 0.09);
      if (camera.position.distanceTo(targetPosition) < 1) targetPosition = null;
    }
    const delta = Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (!reduced) for (const rotor of rotors) rotor.rotation.z += delta * 0.8;
    controls.update();
    renderer.render(scene, camera);
  }
  loop();
  return {
    update,
    view: (name) => {
      controls.target.set(0, 230, 0);
      targetPosition = new THREE.Vector3(
        ...{
          perspective: [560, 410, 870],
          side: [0, 255, 990],
          front: [990, 255, 0],
          top: [0, 1250, 1],
        }[name],
      );
    },
    screenshot: () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      root.children.forEach(disposeModel);
      floor.geometry.dispose();
      floor.material.dispose();
      plinth.geometry.dispose();
      plinth.material.dispose();
      stageEdge.geometry.dispose();
      stageEdge.material.dispose();
      env.dispose();
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
