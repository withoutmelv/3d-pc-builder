import { createAdaptiveQuality, renderPixelRatio } from './render-quality.js';
import { keyedInstallationError } from '../../../shared/installation-feedback.js';
import { createAlignmentMarker } from './alignment-marker.js';
import {
  PACKAGES,
  PACKAGE_ITEMS,
  packageKey,
  packageNames,
  isPacked,
  packageItemOwner,
} from '../../../shared/packages.js';
import { createRetailPackaging } from './retail-packaging.js';
import { isStockAvailable } from '../../../shared/stock-catalogue.js';
import { checkPowerOn } from '../../../shared/power-check.js';
import { COVER_KEYS, getSlotCovers, gpuBayOpen } from '../../../shared/slot-covers.js';
import { STANDOFF_KEYS, getStandoffSlots } from '../../../shared/standoffs.js';
import { MOUNT_PARTS, getMounting, mountingSecure } from '../../../shared/cooler-mount.js';
import { CABLE_NAMES, getCableConnections } from '../../../shared/power-wiring.js';
import { createPowerCables } from './power-cables.js';
import * as THREE from 'three';
import { CART } from '../../../shared/workbench-layout';
import { createRoomFixtures, shelfX } from './room-fixtures';
import { createStockModel, stockPartKeys } from './stock-models';
import { createFirstPersonControls } from './first-person-controls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createAssembly,
  getPartPose,
  getMemorySlot,
  getSocketLeverOpen,
  getCooling,
  getCoolerFans,
  getFanConnections,
  getCoolerScrewDepths,
  getStorage,
  getStoragePressed,
  getGraphics,
  getPower,
  getStandoffs,
  getMemoryPart,
  validateTablePlacement,
  FLOOR_Y,
  TABLE_LIMITS,
} from '../../../shared/assembly.js';
import {
  createBoard,
  createCooler,
  createCoolerFan,
  createCoolerMount,
  createPasteTube,
  createCPU,
  createMemory,
  createCase,
  createSlotCover,
  createStandoff,
  createPanel,
  createIOShield,
  createDriver,
  createScrew,
  createWorkshop,
} from './workbench-models.js';

const SHAPES = {
  ...Object.fromEntries(
    Object.entries(PACKAGES).map(([category, box]) => [packageKey(category), box.size]),
  ),
  slotCover0: [12, 138, 40],
  slotCover1: [12, 138, 40],
  ...Object.fromEntries(STANDOFF_KEYS.map((key) => [key, [10, 27, 10]])),
  ioShield: [8, 44, 148],
  stockMount0: [68, 18, 16],
  stockMount1: [68, 18, 16],
  coolerMount0: [68, 26, 16],
  coolerMount1: [68, 26, 16],
  coolerFan0: [27, 120, 122],
  coolerFan1: [27, 120, 122],
  storage: [80, 8, 24],
  gpu: [346, 76, 154],
  psu: [164, 150, 88],
  cooler: [112, 154, 126],
  board: [244, 8, 305],
  cpu: [43, 10, 43],
  memory0: [8, 44, 135],
  memory1: [8, 44, 135],
  panel: [458, 8, 356],
  case: [476, 235, 494],
};
const SCREWS = [
  [-112, -146],
  [117, -146],
  [-112, 142],
  [117, 142],
];
const DEFAULT_STATE = createAssembly();
const PART_NAMES = {
  ...packageNames,
  slotCover0: '下方槽位挡板',
  slotCover1: '上方槽位挡板',
  ...Object.fromEntries(STANDOFF_KEYS.map((key) => [key, '铜柱'])),
  ioShield: 'I/O 挡板',
  coolerFan0: '前侧散热风扇',
  coolerFan1: '中间散热风扇',
  storage: '磁盘',
  gpu: '显卡',
  psu: '电源',
  cooler: '散热器',
  board: '主板',
  cpu: 'CPU',
  memory0: '第一根内存',
  memory1: '第二根内存',
  panel: '机箱侧板',
  case: '机箱',
};

/** A physical, assisted assembly surface. Domain validation remains in the shared state machine. */
export function createWorkbench(element, onInteraction, catalogue = []) {
  let inventory = [];
  let socketHasCover = true;
  const names = {
    stockMount0: '上方原卡座',
    stockMount1: '下方原卡座',
    coolerMount0: '上方散热支架',
    coolerMount1: '下方散热支架',
    ...PART_NAMES,
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#151e19');
  scene.fog = new THREE.Fog('#151e19', 2600, 6200);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  let needsRender = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.domElement.setAttribute(
    'aria-label',
    '角色装机视角。点击进入鼠标视角控制，WASD 移动，Shift 加速，Q/E 下降/上升，左键拿放或操作，按住左键拧螺丝，R 旋转，Esc 释放鼠标。',
  );
  renderer.domElement.style.touchAction = 'none';
  element.appendChild(renderer.domElement);
  function restoreContext() {
    needsRender = true;
    renderer.shadowMap.needsUpdate = true;
  }
  renderer.domElement.addEventListener('webglcontextrestored', restoreContext);
  const camera = new THREE.PerspectiveCamera(62, 1, 2, 14000);
  camera.position.set(0, 640, 990);
  camera.lookAt(0, 20, -100);
  scene.add(camera);
  const controls = createFirstPersonControls(camera, renderer.domElement, {
    onLook: (status) => {
      needsRender = true;
      emit({ type: 'look', ...status });
    },
    onInteract: interact,
    onUseEnd: cancelScrew,
    onHeight: (delta) => emit({ type: 'height', delta }),
    onChange: () => {
      cameraDestination = null;
      manualCarriedPose = false;
      cameraNoticePending = true;
      needsRender = true;
    },
  });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.45;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#d7dfc6', '#182b20', 2.0));
  const key = new THREE.DirectionalLight('#fff0d2', 3.5);
  key.position.set(-420, 1100, 200);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -1100,
    right: 1100,
    top: 1000,
    bottom: -900,
    near: 10,
    far: 2500,
  });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.8;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#b9d4c4', 1.1);
  fill.position.set(750, 550, -550);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12000, 12000),
    new THREE.MeshStandardMaterial({ color: '#121d16', roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);
  createWorkshop(scene);
  const chassis = createCase({ standoffs: false, slotCovers: false });
  chassis.position.set(460, 0, -70);
  scene.add(chassis);
  const powerButton = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 10, 4, 16),
    new THREE.MeshStandardMaterial({ color: '#344339', emissive: '#000000', roughness: 0.5 }),
  );
  powerButton.position.set(195, 219, -242);
  powerButton.rotation.x = Math.PI / 2;
  chassis.add(powerButton);
  const diagnosticLights = ['cpu', 'dram', 'vga', 'cooling'].map((stage, i) => {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(5, 3, 5),
      new THREE.MeshBasicMaterial({ color: '#39453c' }),
    );
    light.userData.stage = stage;
    light.position.set(115, 6, 70 + i * 10);
    return light;
  });
  let powerCheck = null;
  function displayPowerCheck(report) {
    powerCheck = report;
    powerButton.material.emissive.set(report?.powered ? '#469c60' : report ? '#9b572b' : '#000000');
    powerButton.material.emissiveIntensity = report ? 0.9 : 0;
    for (const light of diagnosticLights)
      light.material.color.set(report?.stage === light.userData.stage ? '#e7a148' : '#39453c');
    needsRender = true;
  }

  const panel = createPanel();
  scene.add(panel);
  const board = createBoard();
  const boardMoving = new Set([board.cover, board.lever, board.gpuLatch, ...board.latches.flat()]);
  const boardVisual = new THREE.Group();
  for (const child of [...board.group.children])
    if (!boardMoving.has(child)) boardVisual.add(child);
  board.group.add(boardVisual);
  board.group.userData.visual = boardVisual;
  const wrapVisual = (visual) => {
    const group = new THREE.Group();
    group.userData.visual = visual;
    group.add(visual);
    return group;
  };
  scene.add(board.group);
  board.group.add(...diagnosticLights);
  const cpu = wrapVisual(createCPU());
  const memory = [wrapVisual(createMemory()), wrapVisual(createMemory())];
  scene.add(cpu, ...memory);
  const cooler = wrapVisual(createCooler(false));
  const coolerFans = [createCoolerFan(0), createCoolerFan(1)];
  scene.add(...coolerFans);
  scene.add(cooler);
  const ioShield = createIOShield();
  scene.add(ioShield);
  const models = {
    ioShield,
    coolerFan0: coolerFans[0],
    coolerFan1: coolerFans[1],
    cooler,
    board: board.group,
    cpu,
    memory0: memory[0],
    memory1: memory[1],
    panel,
    case: chassis,
  };
  const slotCoverScrews = COVER_KEYS.map((key, index) => {
    models[key] = createSlotCover(index);
    scene.add(models[key]);
    const screw = createScrew();
    screw.position.set(-4, 134, 0);
    screw.rotation.z = Math.PI / 2;
    models[key].add(screw);
    return screw;
  });
  for (const [key, part] of Object.entries(MOUNT_PARTS)) {
    models[key] = createCoolerMount(part.kind === 'stock');
    scene.add(models[key]);
  }
  const extras = ['storage', 'gpu', 'psu']
    .map((category) => catalogue.find((p) => p.category === category))
    .filter(Boolean);
  for (const part of extras) {
    models[part.category] = new THREE.Group();
    models[part.category].userData.visual = createStockModel(part);
    models[part.category].add(models[part.category].userData.visual);
    scene.add(models[part.category]);
  }
  const supplyCables = createPowerCables(chassis, board.group);
  const driver = createDriver();
  scene.add(driver);
  const pasteTube = createPasteTube();
  pasteTube.position.set(765, 10, -130);
  pasteTube.rotation.x = Math.PI / 2;
  scene.add(pasteTube);
  const paste = new THREE.Mesh(
    new THREE.CircleGeometry(7, 16),
    new THREE.MeshStandardMaterial({ color: '#b9b8af', roughness: 0.9 }),
  );
  paste.rotation.x = -Math.PI / 2;
  paste.position.set(0, 3.98, 0);
  cpu.add(paste);
  const fanHeaders = [0, 1].map((i) => {
    const header = new THREE.Mesh(
      new THREE.BoxGeometry(13, 8, 12),
      new THREE.MeshStandardMaterial({ color: '#76927f' }),
    );
    header.position.set(74 + i * 17, 8, -142);
    board.group.add(header);
    const fanCable = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(i === 0 ? 75 : 7, i === 0 ? 69 : 47, -122),
          new THREE.Vector3(74 + i * 17, 45, -150),
          new THREE.Vector3(74 + i * 17, 13, -142),
        ]),
        16,
        1.8,
        5,
        false,
      ),
      new THREE.MeshStandardMaterial({ color: '#222e27' }),
    );
    board.group.add(fanCable);
    return { header, fanCable };
  });
  const psuScrews = [
    [42, 137],
    [180, 137],
    [42, 215],
    [180, 215],
  ].map(([y, z]) => {
    const screw = createScrew();
    screw.position.set(-229, y, z);
    screw.rotation.z = Math.PI / 2;
    chassis.add(screw);
    return screw;
  });
  const gpuScrew = createScrew();
  gpuScrew.position.set(-120, 159, 30);
  board.group.add(gpuScrew);
  const storageScrew = createScrew();
  storageScrew.position.set(-64, 12, 7);
  board.group.add(storageScrew);
  const coolerScrews = [-43, 43].map((z) => {
    const screw = createScrew();
    screw.position.set(0, 10, z);
    cooler.add(screw);
    return screw;
  });
  const coolerFilm = new THREE.Group();
  const filmMaterial = new THREE.MeshStandardMaterial({
    color: '#5fbac9',
    transparent: true,
    opacity: 0.65,
    roughness: 0.3,
    side: THREE.DoubleSide,
  });
  const filmSheet = new THREE.Mesh(new THREE.BoxGeometry(52, 0.5, 52), filmMaterial);
  filmSheet.position.y = -0.3;
  coolerFilm.add(filmSheet);
  const filmTab = new THREE.Mesh(new THREE.BoxGeometry(17, 0.6, 22), filmMaterial);
  filmTab.position.set(0, 1, 35);
  filmTab.rotation.x = -0.16;
  coolerFilm.add(filmTab);
  cooler.add(coolerFilm);
  const installedScrews = SCREWS.map(([x, z]) => {
    const screw = createScrew();
    screw.position.set(x, 0, z);
    board.group.add(screw);
    return screw;
  });
  const screwMarkers = SCREWS.map(([x, z]) => {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(10, 1.4, 6, 32),
      new THREE.MeshBasicMaterial({ color: '#94c9bf', transparent: true, opacity: 0.8 }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 5, z);
    board.group.add(marker);
    return marker;
  });
  const looseScrews = SCREWS.map((_, i) => {
    const screw = createScrew();
    screw.position.set(683 + (i % 2) * 49, 22, 318 + Math.floor(i / 2) * 25);
    screw.rotation.z = 0.24;
    scene.add(screw);
    return screw;
  });
  const standoffs = SCREWS.map(([x, z]) => {
    const support = createStandoff();
    support.position.set(x - 104, 32, z - 63);
    chassis.add(support);
    return support;
  });
  standoffs.forEach((model, i) => {
    models[STANDOFF_KEYS[i]] = model;
  });
  const standoffHoles = SCREWS.map(([x, z]) => {
    const hole = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 1, 6, 12),
      new THREE.MeshStandardMaterial({ color: '#3a3025' }),
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x - 104, 16, z - 63);
    chassis.add(hole);
    return hole;
  });
  const targets = [];
  function target(parent, size, position, keyName, event, active, priority = 0) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
        visible: false,
      }),
    );
    mesh.position.set(...position);
    parent.add(mesh);
    const entry = { mesh, key: keyName, event, active, priority };
    targets.push(entry);
    return entry;
  }
  let state = DEFAULT_STATE;
  let held = null;
  let tool = 'hand';
  let cable = null;
  const toolPositions = {
    driver: new THREE.Vector3(765, 20, 94),
    paste: new THREE.Vector3(765, 10, -130),
  };
  let disposed = false;
  let frame = 0;
  let cameraDestination = null;
  const moves = new Map();
  const angles = new Map();
  const insertions = new Map();
  const emit = (event) => onInteraction?.(event);
  const handsFree = () => !held && !cable && tool === 'hand';
  const boardAccessible = () => state.board !== 'case' || state.panelRemoved;
  const boardFree = () => handsFree() && boardAccessible();
  const attachmentsSecure = () =>
    mountingSecure(state) &&
    state.cpu !== 'seated' &&
    !state.memory.includes('seated') &&
    (!getCooling(state).placed || getCooling(state).screws.every(Boolean)) &&
    (!getCooling(state).placed || !getCoolerFans(state).includes('seated')) &&
    getStorage(state) !== 'seated' &&
    (!getGraphics(state).placed || !getGraphics(state).latchOpen);
  const fixtures = createRoomFixtures(scene, catalogue, element);
  for (const part of catalogue.filter(isStockAvailable)) {
    const key = packageKey(part.category),
      size = PACKAGES[part.category].size;
    const model = createRetailPackaging(part, fixtures.packagingAtlas, size);
    models[key] = model;
    model.visible = false;
    scene.add(model);
    target(model, size, [0, size[1] / 2, 0], key, () => ({ type: 'pick', part: key }), handsFree);
    target(
      model,
      [size[0] - 10, 12, size[2] - 10],
      [0, size[1] + 2, 0],
      `${key}-open`,
      () => ({ type: 'package-open', category: part.category }),
      () => handsFree() && state.packages?.[part.category] === 'closed',
      2,
    );
  }
  for (const stock of fixtures.stocks)
    target(
      scene,
      [490, 260, 220],
      stock.position,
      `stock-${stock.part.id}`,
      () => ({ type: 'stock', part: stock.part }),
      handsFree,
      0,
    );
  let selectedPart = 'board';
  let carriedPose = null;
  let currentPlacement = null;
  let manualCarriedPose = false;
  let cameraNoticePending = false;
  let placementError = '';
  let lastAim = '';

  for (const part of extras) {
    const key = part.category;
    target(
      models[key],
      key === 'storage' ? [80, 28, 24] : SHAPES[key],
      [0, key === 'storage' ? 14 : SHAPES[key][1] / 2, 0],
      key,
      () => ({ type: 'pick', part: key }),
      () =>
        handsFree() &&
        Boolean(state.layout?.[key]) &&
        (key !== 'storage' ||
          (getStorage(state) !== 'locked' &&
            (getStorage(state) === 'tray' || boardAccessible()))) &&
        (key !== 'gpu' || !getGraphics(state).placed) &&
        (key !== 'psu' ||
          !getPower(state).placed ||
          (state.panelRemoved && !getPower(state).screws.some(Boolean))),
      2,
    );
  }
  target(
    board.group,
    [244, 4, 305],
    [0, 1, 0],
    'board',
    () => ({ type: 'pick', part: 'board' }),
    () =>
      boardFree() &&
      !state.screws.some(Boolean) &&
      !getGraphics(state).screwed &&
      attachmentsSecure(),
    0,
  );
  target(
    cpu,
    [54, 13, 54],
    [0, 7, 0],
    'cpu',
    () => ({ type: 'pick', part: 'cpu' }),
    () => handsFree() && state.cpu === 'tray',
    1,
  );
  memory.forEach((ram, index) => {
    target(
      ram,
      [14, 10, 128],
      [0, 43, 0],
      `ram-press${index}`,
      () => ({
        type: 'action',
        action: { type: 'memory-press', index: getMemorySlot(state, index) },
      }),
      () => boardFree() && state.memory[index] === 'seated',
      3,
    );
    target(
      ram,
      [14, 46, 136],
      [0, 18, 0],
      `ram${index}`,
      () => ({ type: 'pick', part: `memory${index}` }),
      () => handsFree() && state.memory[index] === 'tray',
      1,
    );
    target(
      ram,
      [14, 46, 136],
      [0, 18, 0],
      `ram-remove${index}`,
      () => ({ type: 'pick', part: `memory${index}` }),
      () =>
        boardFree() &&
        state.memory[index] === 'seated' &&
        state.memoryOpen[getMemorySlot(state, index)],
      1,
    );
  });
  target(
    cpu,
    [44, 10, 44],
    [0, 6, 0],
    'cpu-remove',
    () => ({ type: 'pick', part: 'cpu' }),
    () => boardFree() && state.cpu === 'seated' && state.socketOpen,
    1,
  );
  target(
    board.lever,
    [20, 14, 68],
    [4, 0, 30],
    'socket-latch',
    () => ({
      type: 'action',
      action: {
        type: socketHasCover
          ? getSocketLeverOpen(state)
            ? 'socket-lever-lock'
            : 'socket-lever-open'
          : getSocketLeverOpen(state)
            ? 'cpu-lock'
            : 'socket-open',
      },
    }),
    () => boardFree() && !getCooling(state).placed,
    3,
  );
  // Lever and cover have separate physical targets; the PCB is never a socket button.
  target(
    board.group,
    [58, 8, 58],
    [7, 8, -62],
    'socket-cover',
    () => ({ type: 'action', action: { type: 'socket-cover-open' } }),
    () => socketHasCover && boardFree() && !state.socketOpen && !getCooling(state).placed,
    2,
  );
  target(
    board.cover,
    [65, 16, 63],
    [0, 0, 27],
    'socket-close',
    () => ({ type: 'action', action: { type: 'socket-cover-close' } }),
    () => boardFree() && state.socketOpen,
    3,
  );
  board.latches.forEach((pair, index) => {
    pair.forEach((latch, side) =>
      target(
        latch,
        [12, 25, 20],
        [0, 4, 0],
        `latch${index}-${side}`,
        () => ({
          type: 'action',
          action: { type: state.memoryOpen[index] ? 'memory-lock' : 'memory-open', index },
        }),
        () => boardFree() && (!state.memoryOpen[index] || getMemoryPart(state, index) === -1),
        3,
      ),
    );
  });
  target(
    panel,
    [458, 15, 356],
    [0, 0, 0],
    'panel',
    () => ({ type: 'pick', part: 'panel' }),
    () => handsFree() && !state.panelRemoved,
    1,
  );
  target(
    panel,
    [458, 15, 356],
    [0, 0, 0],
    'panel-loose',
    () => ({ type: 'pick', part: 'panel' }),
    () => handsFree() && state.panelRemoved,
    1,
  );
  target(
    chassis,
    [476, 235, 494],
    [0, 117.5, 0],
    'case',
    () => ({ type: 'pick', part: 'case' }),
    () =>
      handsFree() &&
      (state.board !== 'case' || (state.screws.every(Boolean) && attachmentsSecure())) &&
      (!getPower(state).placed || getPower(state).screws.every(Boolean)),
    -1,
  );
  target(
    driver,
    [28, 140, 28],
    [0, 30, 0],
    'driver',
    () => ({ type: 'tool', tool: 'driver' }),
    handsFree,
    1,
  );
  target(
    ioShield,
    SHAPES.ioShield,
    [0, 22, 0],
    'ioShield',
    () => ({ type: 'pick', part: 'ioShield' }),
    () => handsFree() && ioShield.visible,
    5,
  );
  target(
    cooler,
    [112, 154, 126],
    [0, 113, 0],
    'cooler',
    () => ({ type: 'pick', part: 'cooler' }),
    () =>
      handsFree() &&
      !getCoolerFans(state).includes('seated') &&
      (!getCooling(state).placed ||
        (boardAccessible() &&
          !getCoolerScrewDepths(state).some(Boolean) &&
          !getCooling(state).fanConnected)),
    2,
  );
  for (const [key, part] of Object.entries(MOUNT_PARTS)) {
    const mounted = () => getMounting(state)[part.kind][part.index];
    const accessible = () => !getCooling(state).placed && boardAccessible();
    const screws = () => getMounting(state)[part.kind === 'stock' ? 'stockScrews' : 'railScrews'];
    target(
      models[key],
      SHAPES[key],
      [0, 10, 0],
      key,
      () => ({ type: 'pick', part: key }),
      () =>
        handsFree() &&
        models[key].visible &&
        (!mounted() ||
          (accessible() &&
            !screws()
              .slice(part.index * 2, part.index * 2 + 2)
              .some(Boolean))),
      4,
    );
    models[key].userData.screws.forEach((screw, index) => {
      target(
        screw,
        [20, 20, 20],
        [0, 6, 0],
        `mount-screw-${key}-${index}`,
        () => ({
          type: 'action',
          action: {
            type: screws()[part.index * 2 + index] ? 'mount-unscrew' : 'mount-screw',
            part: key,
            index,
          },
        }),
        () => !held && tool === 'driver' && models[key].visible && mounted() && accessible(),
        6,
      );
    });
  }
  coolerFans.forEach((fan, index) => {
    const accessible = () => handsFree() && (!getCooling(state).placed || boardAccessible());
    target(
      fan,
      [27, 120, 122],
      [0, 60, 0],
      `coolerFan${index}`,
      () => ({ type: 'pick', part: `coolerFan${index}` }),
      () => accessible() && getCoolerFans(state)[index] !== 'locked',
      4,
    );
    target(
      fan,
      [36, 18, 142],
      [0, 113, 0],
      `fan-clip${index}`,
      () => ({
        type: 'action',
        action: {
          type: getCoolerFans(state)[index] === 'locked' ? 'cooler-fan-unclip' : 'cooler-fan-clip',
          index,
        },
      }),
      () => accessible() && getCoolerFans(state)[index] !== 'tray',
      5,
    );
  });
  target(
    pasteTube,
    [28, 90, 24],
    [0, 32, 0],
    'paste-tool',
    () => ({ type: 'tool', tool: 'paste' }),
    handsFree,
    2,
  );
  target(
    board.group,
    [46, 15, 46],
    [7, 12, -62],
    'paste-apply',
    () => ({ type: 'action', action: { type: 'paste-apply' } }),
    () => !held && tool === 'paste' && boardAccessible() && !getCooling(state).placed,
    5,
  );
  fanHeaders.forEach(({ header }, index) =>
    target(
      header,
      [20, 22, 24],
      [0, 0, 0],
      `fan-header${index}`,
      () => ({
        type: 'action',
        action: { type: getFanConnections(state)[index] ? 'fan-disconnect' : 'fan-connect', index },
      }),
      () => handsFree() && boardAccessible() && getCooling(state).placed,
      5,
    ),
  );
  target(
    coolerFilm,
    [23, 15, 25],
    [0, 2, 36],
    'cooler-film',
    () => ({ type: 'action', action: { type: 'cooler-film-remove' } }),
    () => handsFree() && state.coolerFilm === true && !getCooling(state).placed,
    6,
  );
  coolerScrews.forEach((screw, index) =>
    target(
      screw,
      [25, 24, 25],
      [0, 6, 0],
      `cooler-screw${index}`,
      () => ({
        type: 'action',
        action: {
          type:
            getCooling(state).screws[index] || reverseCoolerScrew === index
              ? 'cooler-unscrew'
              : 'cooler-screw-step',
          index,
        },
      }),
      () => !held && tool === 'driver' && getCooling(state).placed && boardAccessible(),
      5,
    ),
  );
  target(
    board.group,
    [28, 26, 28],
    [-56, 14, 7],
    'storage-press',
    () => ({
      type: 'action',
      action: { type: getStoragePressed(state) ? 'storage-lift' : 'storage-press' },
    }),
    () => handsFree() && getStorage(state) === 'seated' && boardAccessible(),
    6,
  );
  target(
    storageScrew,
    [22, 24, 24],
    [0, 5, 0],
    'storage-screw',
    () => ({
      type: 'action',
      action: { type: getStorage(state) === 'locked' ? 'storage-unscrew' : 'storage-screw' },
    }),
    () => !held && tool === 'driver' && getStorage(state) !== 'tray' && boardAccessible(),
    5,
  );
  target(
    board.gpuLatch,
    [27, 24, 26],
    [7, 6, 0],
    'gpu-latch',
    () => ({
      type: 'action',
      action: { type: getGraphics(state).latchOpen ? 'gpu-close' : 'gpu-open' },
    }),
    () => boardFree() && !getGraphics(state).screwed,
    6,
  );
  target(
    board.group,
    [346, 154, 78],
    [48, 81, 61],
    'gpu-installed',
    () => ({ type: 'pick', part: 'gpu' }),
    () =>
      boardFree() &&
      getGraphics(state).placed &&
      getGraphics(state).latchOpen &&
      !getGraphics(state).screwed,
    2,
  );
  target(
    gpuScrew,
    [26, 24, 26],
    [0, 5, 0],
    'gpu-screw',
    () => ({
      type: 'action',
      action: { type: getGraphics(state).screwed ? 'gpu-unscrew' : 'gpu-screw' },
    }),
    () =>
      !held &&
      tool === 'driver' &&
      boardAccessible() &&
      state.board === 'case' &&
      getGraphics(state).placed,
    5,
  );
  psuScrews.forEach((screw, index) =>
    target(
      screw,
      [24, 20, 24],
      [0, 5, 0],
      'psu-screw' + index,
      () => ({
        type: 'action',
        action: { type: getPower(state).screws[index] ? 'psu-unscrew' : 'psu-screw', index },
      }),
      () => !held && tool === 'driver' && getPower(state).placed,
      5,
    ),
  );
  for (const kind of Object.keys(CABLE_NAMES)) {
    target(
      supplyCables.plugs[kind],
      kind === 'board' ? [22, 22, 58] : [30, 22, 24],
      [0, 4, 0],
      'cable-pick-' + kind,
      () => ({ type: 'cable-pick', cable: kind }),
      () =>
        handsFree() &&
        (kind === 'frontPower' ? Boolean(state.layout?.case) : getPower(state).placed) &&
        state.panelRemoved &&
        !getCableConnections(state)[kind],
      7,
    );
    target(
      supplyCables.ports[kind],
      kind === 'board' ? [24, 24, 62] : [34, 24, 28],
      [0, 5, 0],
      'cable-port-' + kind,
      () => ({ type: 'cable-port', target: kind }),
      () =>
        !held &&
        tool === 'hand' &&
        state.panelRemoved &&
        (Boolean(cable) || getCableConnections(state)[kind]),
      7,
    );
  }
  target(
    powerButton,
    [30, 16, 30],
    [0, 0, 0],
    'power-button',
    () => ({ type: 'power-button' }),
    () => handsFree() && chassis.visible,
    8,
  );
  const placements = {};
  for (const [key, part] of Object.entries(MOUNT_PARTS)) {
    placements[key] = target(
      board.group,
      [70, 22, 18],
      [7, 11, part.index === 0 ? -110 : -14],
      `place-${key}`,
      () => placementEvent(key),
      () =>
        held?.part === key && boardAccessible() && (!state.room || Boolean(state.layout?.board)),
      6,
    );
  }
  coolerFans.forEach((fan, index) => {
    const key = `coolerFan${index}`;
    placements[key] = target(
      cooler,
      [30, 125, 126],
      [index === 0 ? 68 : 0, index === 0 ? 113 : 91, 0],
      `place-${key}`,
      () => placementEvent(key),
      () => held?.part === key && (!getCooling(state).placed || boardAccessible()),
      6,
    );
  });
  placements.ioShield = target(
    chassis,
    [24, 48, 152],
    [-229, 64, -144],
    'place-ioShield',
    () => placementEvent('ioShield'),
    () => held?.part === 'ioShield' && chassis.visible,
    6,
  );
  placements.psu = target(
    chassis,
    [166, 155, 90],
    [-145, 110, 176],
    'place-psu',
    () => placementEvent('psu'),
    () => held?.part === 'psu',
    5,
  );
  placements.gpu = target(
    board.group,
    [155, 26, 24],
    [12, 12, 30],
    'place-gpu',
    () => placementEvent('gpu'),
    () => held?.part === 'gpu' && boardAccessible(),
    5,
  );
  placements.storage = target(
    board.group,
    [90, 25, 32],
    [-24, 8, 7],
    'place-storage',
    () => placementEvent('storage'),
    () => held?.part === 'storage' && boardAccessible(),
    5,
  );
  placements.cooler = target(
    board.group,
    [114, 85, 114],
    [7, 80, -62],
    'place-cooler',
    () => placementEvent('cooler'),
    () => held?.part === 'cooler' && boardAccessible(),
    4,
  );
  placements.socket = target(
    board.group,
    [65, 20, 65],
    [7, 12, -62],
    'place-cpu',
    () => placementEvent('socket'),
    () => held?.part === 'cpu' && boardAccessible(),
    2,
  );
  memory.forEach((_, index) => {
    placements[`memory${index}`] = target(
      board.group,
      [14, 32, 146],
      [75 + index * 20, 20, -62],
      `place-memory${index}`,
      () => placementEvent(`memory${index}`),
      () => held?.part.startsWith('memory') && boardAccessible(),
      2,
    );
  });
  placements.case = target(
    chassis,
    [260, 180, 323],
    [-104, 115, -63],
    'place-case',
    () => placementEvent('case'),
    () => held?.part === 'board',
    1,
  );
  placements.panel = target(
    chassis,
    [458, 24, 356],
    [0, 232, -57],
    'place-panel',
    () => placementEvent('panel'),
    () => held?.part === 'panel',
    1,
  );
  standoffs.forEach((model, index) =>
    target(
      model,
      [24, 30, 24],
      [0, -4, 0],
      STANDOFF_KEYS[index],
      () => ({ type: 'pick', part: STANDOFF_KEYS[index] }),
      () =>
        handsFree() &&
        model.visible &&
        (getStandoffSlots(state)[index] === null || (state.panelRemoved && state.board !== 'case')),
      5,
    ),
  );
  SCREWS.forEach(([x, z], index) => {
    placements[STANDOFF_KEYS[index]] = target(
      chassis,
      [28, 30, 28],
      [x - 104, 29, z - 63],
      `place-standoff${index}`,
      () => placementEvent(STANDOFF_KEYS[index]),
      () => STANDOFF_KEYS.includes(held?.part) && chassis.visible,
      5,
    );
  });
  COVER_KEYS.forEach((key, index) => {
    target(
      models[key],
      SHAPES[key],
      [0, 69, 0],
      key,
      () => ({ type: 'pick', part: key }),
      () =>
        handsFree() &&
        models[key].visible &&
        (getSlotCovers(state)[index] === 'tray' || state.panelRemoved),
      5,
    );
    target(
      models[key],
      [22, 20, 22],
      [-4, 134, 0],
      `slot-cover-screw${index}`,
      () => ({
        type: 'action',
        action: {
          type:
            getSlotCovers(state)[index] === 'locked' ? 'slot-cover-unscrew' : 'slot-cover-screw',
          index,
        },
      }),
      () =>
        !held &&
        tool === 'driver' &&
        state.slotCovers !== undefined &&
        getSlotCovers(state)[index] !== 'tray' &&
        state.panelRemoved,
      7,
    );
    placements[key] = target(
      chassis,
      [24, 138, 40],
      [-229, 111, 80.5 - index * 41],
      `place-${key}`,
      () => placementEvent(key),
      () => held?.part === key && chassis.visible,
      5,
    );
  });
  const screwTargets = installedScrews.map((screw, index) =>
    target(
      screw,
      [31, 18, 31],
      [0, 8, 0],
      `screw${index}`,
      () => ({
        type: 'action',
        action: { type: state.screws[index] ? 'unscrew' : 'screw', index },
      }),
      () => !held && tool === 'driver' && state.board === 'case' && state.panelRemoved,
      4,
    ),
  );

  const ghost = new THREE.Group();
  const ghostMaterial = new THREE.LineBasicMaterial({
    color: '#a3ddbb',
    transparent: true,
    opacity: 0.85,
  });
  const ghostFillMaterial = new THREE.MeshBasicMaterial({
    color: '#a3ddbb',
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
  });
  let ghostShape = null;
  let ghostFill = null;
  let ghostKind = null;
  scene.add(ghost);
  ghost.visible = false;
  const hoverHighlight = new THREE.Group();
  const hoverGeometry = new THREE.BoxGeometry(1, 1, 1);
  hoverHighlight.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(hoverGeometry),
      new THREE.LineBasicMaterial({
        color: '#b0f4cf',
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    ),
    new THREE.Mesh(
      hoverGeometry,
      new THREE.MeshBasicMaterial({
        color: '#8de7b4',
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
    ),
  );
  hoverHighlight.visible = false;
  scene.add(hoverHighlight);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(11, 14, 48),
    new THREE.MeshBasicMaterial({
      color: '#cfe6b9',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.renderOrder = 20;
  halo.visible = false;
  scene.add(halo);
  const progress = new THREE.Mesh(
    new THREE.TorusGeometry(17, 2, 5, 64),
    new THREE.MeshBasicMaterial({ color: '#c6f3c8', depthTest: false }),
  );
  progress.rotation.x = -Math.PI / 2;
  progress.renderOrder = 21;
  progress.visible = false;
  scene.add(progress);

  function setMotion(object, position, rotation = null, immediate = false) {
    const dest = new THREE.Vector3(...position);
    if (immediate || reducedMotion) object.position.copy(dest);
    else moves.set(object, dest);
    if (rotation !== null) {
      if (immediate || reducedMotion) object.rotation.set(...rotation);
      else angles.set(object, new THREE.Euler(...rotation));
    }
  }
  function parentAt(object, parent, position, rotation, immediate) {
    if (object.parent !== parent) parent.attach(object);
    setMotion(object, position, [0, THREE.MathUtils.degToRad(rotation), 0], immediate);
  }
  function surfaceHeight(x, z) {
    if (x >= -760 && x <= -384 && z >= -316 && z <= 216) return 21;
    if (x >= -314 && x <= 184 && z >= -285 && z <= 270) return 7;
    return 1;
  }
  function tableHeight(part, pose) {
    const support =
      pose.y === CART.y
        ? CART.y + 1
        : pose.y === FLOOR_Y
          ? FLOOR_Y + 1
          : surfaceHeight(pose.x, pose.z);
    if (STANDOFF_KEYS.includes(part)) return support + 17;
    if (part === 'case') return support + 5;
    return support + (part === 'board' || part === 'panel' ? 5 : 2);
  }
  function placeModel(part, immediate) {
    const pose = getPartPose(state, part);
    parentAt(
      models[part],
      scene,
      [pose.x, tableHeight(part, pose), pose.z],
      pose.rotation,
      immediate,
    );
  }
  function update(
    nextState,
    nextHeld = null,
    nextTool = 'hand',
    nextInventory = inventory,
    nextCable = null,
  ) {
    if (inventory !== nextInventory) {
      inventory = nextInventory;
      socketHasCover = inventory.find((p) => p.category === 'motherboard')?.specs.socket !== 'AM4';
      board.cover.visible = socketHasCover;
      Object.assign(names, PART_NAMES);
      for (const part of inventory) names[stockPartKeys[part.category]] = part.name;
      const chosenRam = inventory.find((p) => p.category === 'memory');
      if (chosenRam) names.memory1 = `${chosenRam.name} · 第二根`;
      const replaceVisual = (model, visual, partId) => {
        const old = model.userData.visual;
        old.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
        model.remove(old);
        model.userData.visual = visual;
        model.userData.partId = partId;
        model.add(visual);
      };
      for (const part of inventory) {
        const keys =
          part.category === 'memory' ? ['memory0', 'memory1'] : [stockPartKeys[part.category]];
        for (const key of keys) {
          const model = models[key];
          if (!model?.userData.visual || model.userData.partId === part.id) continue;
          let visual;
          if (part.category === 'motherboard') {
            const next = createBoard(part);
            // Retain existing hinges: interaction targets and animation tracks reference them.
            for (const hinge of [next.cover, next.lever, next.gpuLatch, ...next.latches.flat()]) {
              next.group.remove(hinge);
              hinge.traverse((o) => {
                o.geometry?.dispose();
                o.material?.dispose();
              });
            }
            visual = next.group;
          } else if (part.category === 'cooler') visual = createCooler(false, part);
          else visual = createStockModel(part);
          replaceVisual(model, visual, part.id);
        }
      }
      fixtures.select(inventory);
    }
    needsRender = true;
    renderer.shadowMap.needsUpdate = true;
    if (powerCheck && (state !== nextState || nextHeld || nextTool !== 'hand' || nextCable))
      displayPowerCheck(null);
    const first = state === DEFAULT_STATE;
    const changingHeld = held?.part !== nextHeld?.part;
    const releasedPart = held && !nextHeld ? held.part : null;
    const previousLayout = state.layout;
    const previousMemory = state.memory;
    state = nextState;
    for (const [part, model] of Object.entries(models)) {
      if (part.startsWith('coolerFan') || MOUNT_PARTS[part]) continue;
      model.visible = !state.room || Boolean(state.layout?.[part]);
      if (state.room && state.layout?.[part] && !previousLayout?.[part]) placeModel(part, true);
    }
    held = nextHeld;
    cable = nextCable;
    tool = nextTool;
    if (screwHold) cancelScrew();
    reverseCoolerScrew = null;
    for (const part of extras) {
      const key = part.category;
      models[key].visible = Boolean(state.layout?.[key]);
      if (models[key].visible && held?.part !== key) {
        if (key === 'psu' && getPower(state).placed)
          parentAt(models[key], chassis, [-145, 35, 176], 0, first);
        else if (key === 'gpu' && getGraphics(state).placed)
          parentAt(models[key], board.group, [48, 6, 23.5], 0, first);
        else if (key === 'storage' && getStorage(state) !== 'tray')
          parentAt(models[key], board.group, [-24, 3.8, 7], 0, first);
        else placeModel(key, first);
      }
    }
    const power = getPower(state);
    psuScrews.forEach((screw, index) => {
      screw.visible = power.placed;
      screw.position.x = power.screws[index] ? -229 : -237;
    });
    const graphics = getGraphics(state);
    gpuScrew.visible = graphics.placed && state.board === 'case';
    gpuScrew.position.y = graphics.screwed ? 159 : 166;
    setMotion(board.gpuLatch, [70, 4, 30], [0, 0, graphics.latchOpen ? -0.9 : 0], first);
    if (models.gpu) {
      const installed = graphics.placed && held?.part !== 'gpu';
      models.gpu.userData.visual.rotation.x = installed ? Math.PI / 2 : 0;
      models.gpu.userData.visual.position.y = installed ? 77 : 0;
    }
    storageScrew.position.y = getStorage(state) === 'locked' ? 11 : 18;
    const cooling = getCooling(state);
    coolerFilm.visible = state.coolerFilm === true;
    paste.visible = cooling.paste && !cooling.placed;
    fanHeaders.forEach(({ header, fanCable }, i) => {
      const connected = getFanConnections(state)[i];
      fanCable.visible = connected;
      header.material.color.set(connected ? '#b5d9a8' : '#76927f');
    });
    coolerScrews.forEach((screw, i) => {
      setMotion(
        screw,
        [0, 22 - (getCoolerScrewDepths(state)[i] * 7) / 3, i === 0 ? -43 : 43],
        null,
        first,
      );
    });
    if (held?.part !== 'cooler') {
      if (cooling.placed) parentAt(cooler, board.group, [7, 8.51, -62], 0, first);
      else placeModel('cooler', first);
    }
    for (const [key, part] of Object.entries(MOUNT_PARTS)) {
      const m = getMounting(state);
      const model = models[key];
      model.visible = state.mounting
        ? Boolean(state.layout?.[key])
        : part.kind === 'rails' &&
          (!state.room || Boolean(state.layout?.cooler && state.layout?.board));
      const screws = m[part.kind === 'stock' ? 'stockScrews' : 'railScrews'];
      model.userData.screws.forEach((screw, index) => {
        screw.position.y =
          (part.kind === 'stock' ? 7 : 14) + (screws[part.index * 2 + index] ? 0 : 8);
      });
      if (!model.visible || held?.part === key) continue;
      if (m[part.kind][part.index])
        parentAt(model, board.group, [7, 3, part.index === 0 ? -110 : -14], 0, first);
      else placeModel(key, first);
    }
    coolerFans.forEach((fan, i) => {
      const key = `coolerFan${i}`;
      const status = getCoolerFans(state)[i];
      fan.visible = !state.room || Boolean(state.layout?.cooler);
      fan.userData.clips.visible = status !== 'tray';
      fan.userData.clips.scale.x = 1;
      for (const hinge of fan.userData.clips.children) {
        setMotion(
          hinge,
          [0, 0, hinge.position.z],
          [0, status === 'locked' ? 0 : (-Math.sign(hinge.position.z) * Math.PI) / 3, 0],
          first,
        );
      }
      if (held?.part === key || !fan.visible) return;
      if (status === 'tray') placeModel(key, first);
      else parentAt(fan, cooler, [i === 0 ? 68 : 0, i === 0 ? 53 : 31, 0], 0, first);
    });
    COVER_KEYS.forEach((key, i) => {
      models[key].visible = state.slotCovers !== undefined && Boolean(state.layout?.case);
      slotCoverScrews[i].visible = getSlotCovers(state)[i] === 'locked';
      if (!models[key].visible || held?.part === key) return;
      if (getSlotCovers(state)[i] === 'tray') placeModel(key, first);
      else parentAt(models[key], chassis, [-229, 42, 80.5 - i * 41], 0, first);
    });
    ioShield.visible = state.ioShield !== undefined && Boolean(state.layout?.ioShield);
    if (ioShield.visible && held?.part !== 'ioShield') {
      if (state.ioShield === 'installed') parentAt(ioShield, chassis, [-229, 42, -144], 0, first);
      else placeModel('ioShield', first);
    }
    if (held?.part !== 'case') placeModel('case', first);
    if (held?.part !== 'board') {
      if (state.board === 'case') parentAt(board.group, chassis, [-104, 43, -63], 0, first);
      else placeModel('board', first);
    }
    if (held?.part !== 'cpu') {
      if (state.cpu === 'tray') placeModel('cpu', first);
      else parentAt(cpu, board.group, [7, 4.6, -62], 0, first);
    }
    memory.forEach((ram, index) => {
      if (held?.part === `memory${index}`) return;
      if (previousMemory[index] !== state.memory[index]) insertions.delete(ram);
      if (state.memory[index] === 'tray') placeModel(`memory${index}`, first);
      else
        parentAt(
          ram,
          board.group,
          [75 + getMemorySlot(state, index) * 20, state.memory[index] === 'seated' ? 15 : 7, -62],
          0,
          first,
        );
    });
    if (held?.part !== 'panel') {
      if (state.panelRemoved) placeModel('panel', first);
      else parentAt(panel, chassis, [0, 232, -55], 0, first);
    }
    if (held) {
      const model = models[held.part];
      if (model.parent !== scene) scene.attach(model);
      insertions.delete(model);
      moves.delete(model);
      angles.delete(model);
      if (changingHeld) {
        selectedPart = held.part;
        carriedPose = null;
        manualCarriedPose = false;
      }
      updateHeldModel();
    } else {
      carriedPose = null;
      currentPlacement = null;
    }
    setMotion(board.cover, [7, 5, -96], [state.socketOpen ? -1.9 : 0, 0, 0], first);
    setMotion(board.lever, [38, 4, -95], [getSocketLeverOpen(state) ? -1.1 : 0, 0, 0], first);
    board.latches.forEach((pair, index) =>
      pair.forEach((latch, side) => {
        angles.set(latch, new THREE.Euler(state.memoryOpen[index] ? 0.49 : 0, 0, 0));
      }),
    );
    standoffs.forEach((support, i) => {
      support.visible = Boolean(state.layout?.case);
      standoffHoles[i].visible = !getStandoffs(state)[i];
      if (!support.visible || held?.part === STANDOFF_KEYS[i]) return;
      const slot = getStandoffSlots(state)[i];
      if (slot === null) placeModel(STANDOFF_KEYS[i], first);
      else parentAt(support, chassis, [SCREWS[slot][0] - 104, 32, SCREWS[slot][1] - 63], 0, first);
    });
    installedScrews.forEach((screw, i) => {
      screw.visible = state.board === 'case';
      screw.children.forEach((child) => {
        child.visible = state.screws[i];
      });
      screwTargets[i].mesh.visible = true;
      looseScrews[i].visible = !state.screws[i];
      screwMarkers[i].visible = state.board === 'case' && state.panelRemoved;
      screwMarkers[i].material.opacity = state.screws[i] ? 0.22 : 0.9;
    });
    setMotion(driver, toolPositions.driver.toArray(), [Math.PI / 2, 0, -0.22], first);
    driver.traverse((object) => {
      if (object.material?.emissive) {
        object.material.emissive.set(tool === 'driver' ? '#406e45' : '#000000');
        object.material.emissiveIntensity = tool === 'driver' ? 0.3 : 0;
      }
    });
    if (releasedPart && !reducedMotion) {
      const mountPart = MOUNT_PARTS[releasedPart];
      const installed = mountPart
        ? getMounting(state)[mountPart.kind][mountPart.index]
        : releasedPart.startsWith('coolerFan')
          ? getCoolerFans(state)[Number(releasedPart.at(-1))] !== 'tray'
          : releasedPart === 'psu'
            ? power.placed
            : releasedPart === 'gpu'
              ? graphics.placed
              : releasedPart === 'storage'
                ? getStorage(state) !== 'tray'
                : releasedPart === 'cooler'
                  ? cooling.placed
                  : releasedPart === 'cpu'
                    ? state.cpu !== 'tray'
                    : releasedPart.startsWith('memory')
                      ? state.memory[Number(releasedPart.at(-1))] !== 'tray'
                      : releasedPart === 'board'
                        ? state.board === 'case'
                        : releasedPart === 'panel' && !state.panelRemoved;
      const model = models[releasedPart];
      if (installed && moves.has(model)) {
        insertions.set(model, {
          start: model.position.clone(),
          end: moves.get(model).clone(),
          time: performance.now(),
        });
        moves.delete(model);
      }
    }
    for (const [part, model] of Object.entries(models)) {
      if (isPacked(state, part)) model.visible = held?.part === packageItemOwner(part);
      if (!part.startsWith('package-')) continue;
      const status = state.packages?.[part.slice(8)];
      model.visible = Boolean(status);
      if (!status) continue;
      if (held?.part !== part) placeModel(part, first);
      model.userData.lid.rotation.x = status === 'closed' ? 0 : -Math.PI * 0.7;
      model.userData.insert.visible = status !== 'empty';
      if (status === 'open' && !model.userData.previews) {
        const product = inventory.find((p) => p.category === part.slice(8));
        if (product) {
          const keys = PACKAGE_ITEMS[product.category].filter((key) => state.layout?.[key]);
          const box = PACKAGES[product.category].size;
          const columns = product.category === 'memory' ? 1 : Math.min(keys.length, 2),
            rows = Math.ceil(keys.length / columns);
          const cellWidth = (box[0] - 20) / columns,
            cellDepth = (box[2] - 16) / rows;
          model.userData.previews = {};
          keys.forEach((key, index) => {
            const cell = new THREE.Group();
            cell.position.set(
              ((index % columns) - (columns - 1) / 2) * cellWidth,
              box[1] - 22,
              (Math.floor(index / columns) - (rows - 1) / 2) * cellDepth,
            );
            const preview = key.startsWith('coolerFan')
              ? createCoolerFan()
              : key.startsWith('coolerMount')
                ? createCoolerMount(false)
                : key === 'ioShield'
                  ? createIOShield()
                  : key === 'cooler'
                    ? createCooler(false, product)
                    : createStockModel(product);
            if (product.category === 'memory') preview.rotation.y = Math.PI / 2;
            const bounds = new THREE.Box3().setFromObject(preview);
            const size = bounds.getSize(new THREE.Vector3()),
              center = bounds.getCenter(new THREE.Vector3());
            const scale = Math.min(
              1,
              (cellWidth - 8) / size.x,
              (cellDepth - 8) / size.z,
              45 / size.y,
            );
            preview.scale.setScalar(scale);
            preview.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
            cell.add(preview);
            model.add(cell);
            model.userData.previews[key] = cell;
            target(
              cell,
              [cellWidth - 4, 48, cellDepth - 4],
              [0, 20, 0],
              `${part}-item-${key}`,
              () => ({ type: 'package-pick', category: product.category, part: key }),
              () =>
                handsFree() &&
                state.packages?.[product.category] === 'open' &&
                isPacked(state, key),
              2,
            );
          });
        }
      }
      for (const [key, preview] of Object.entries(model.userData.previews ?? {})) {
        preview.visible = status === 'open' && isPacked(state, key) && held?.part !== key;
      }
    }
    ghost.visible = false;
    halo.visible = false;
    renderer.domElement.style.cursor = controls.active ? 'none' : 'default';
    supplyCables.update(state, cable, camera, held?.part);
    refreshPointer(false);
  }

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  const cursorWorld = new THREE.Vector3();
  let hovered = null;
  let screwHold = null;
  let reverseCoolerScrew = null;
  function getHit(kind) {
    const hits = [];
    let gpuDistance = Infinity;
    if (getGraphics(state).placed && held?.part !== 'gpu' && models.gpu?.visible) {
      const visual = models.gpu.userData.visual;
      visual.updateWorldMatrix(true, true);
      gpuDistance = ray.intersectObject(visual, true)[0]?.distance ?? Infinity;
    }
    for (const item of targets) {
      if (!item.active()) continue;
      let parent = item.mesh;
      while (parent && parent.visible) parent = parent.parent;
      if (parent) continue;
      const event = item.event();
      if (kind === 'interact' && event.type === 'place') continue;
      if (kind === 'place' && event.type !== 'place') continue;
      // Only the target and its ancestors need current matrices for picking.
      item.mesh.updateWorldMatrix(true, false);
      const hit = ray.intersectObject(item.mesh, false)[0];
      if (
        hit &&
        hit.distance <= 2400 &&
        (item.key === 'gpu-installed' || hit.distance <= gpuDistance + 3)
      )
        hits.push({ item, distance: hit.distance, point: hit.point });
    }
    hits.sort((a, b) => b.item.priority - a.item.priority || a.distance - b.distance);
    return hits[0] || null;
  }
  function heldRotation() {
    return held?.rotation ?? 0;
  }
  function updateHeldModel() {
    if (!held) return;
    const distance =
      held.part === 'package-case'
        ? 950
        : held.part.startsWith('package-')
          ? 550
          : held.part === 'case'
            ? 600
            : held.part === 'panel'
              ? 460
              : held.part === 'board'
                ? 420
                : 360;
    const lift = ((held.height ?? 100) - 100) * 0.15;
    const position = new THREE.Vector3(
      0,
      (held.part === 'package-case'
        ? -350
        : held.part.startsWith('package-')
          ? -180
          : held.part === 'case'
            ? -180
            : -100) + lift,
      -distance,
    );
    camera.updateMatrixWorld();
    camera.localToWorld(position);
    models[held.part].position.copy(position);
    models[held.part].rotation.set(0.22, THREE.MathUtils.degToRad(held.rotation), 0, 'YXZ');
  }
  function surfaceUnderAim() {
    const cart = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CART.y);
    if (
      ray.ray.intersectPlane(cart, cursorWorld) &&
      Math.abs(cursorWorld.x - CART.x) <= CART.width / 2 &&
      Math.abs(cursorWorld.z - CART.z) <= CART.depth / 2 &&
      camera.position.distanceTo(cursorWorld) <= 2400
    )
      return { x: cursorWorld.x, z: cursorWorld.z, y: CART.y, rotation: heldRotation() };
    const table = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (
      ray.ray.intersectPlane(table, cursorWorld) &&
      Math.abs(cursorWorld.x) <= TABLE_LIMITS.x &&
      Math.abs(cursorWorld.z) <= TABLE_LIMITS.z &&
      camera.position.distanceTo(cursorWorld) <= 2400
    )
      return { x: cursorWorld.x, z: cursorWorld.z, y: 0, rotation: heldRotation() };
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y);
    if (
      ray.ray.intersectPlane(ground, cursorWorld) &&
      camera.position.distanceTo(cursorWorld) <= 2400
    )
      return { x: cursorWorld.x, z: cursorWorld.z, y: FLOOR_Y, rotation: heldRotation() };
    return null;
  }
  function rotationDifference(rotation, targetRotation) {
    return ((rotation - targetRotation + 540) % 360) - 180;
  }
  function destinationPose(name) {
    const vector = new THREE.Vector3();
    if (MOUNT_PARTS[name])
      board.group.localToWorld(vector.set(7, 3, MOUNT_PARTS[name].index === 0 ? -110 : -14));
    else if (name.startsWith('coolerFan'))
      cooler.localToWorld(vector.set(name.endsWith('0') ? 68 : 0, name.endsWith('0') ? 53 : 31, 0));
    else if (STANDOFF_KEYS.includes(name)) {
      const [x, z] = SCREWS[STANDOFF_KEYS.indexOf(name)];
      chassis.localToWorld(vector.set(x - 104, 32, z - 63));
    } else if (COVER_KEYS.includes(name))
      chassis.localToWorld(vector.set(-229, 42, 80.5 - COVER_KEYS.indexOf(name) * 41));
    else if (name === 'ioShield') chassis.localToWorld(vector.set(-229, 42, -144));
    else if (name === 'psu') chassis.localToWorld(vector.set(-145, 35, 176));
    else if (name === 'gpu') board.group.localToWorld(vector.set(48, 6, 23.5));
    else if (name === 'storage') board.group.localToWorld(vector.set(-24, 3.8, 7));
    else if (name === 'cooler') board.group.localToWorld(vector.set(7, 8.51, -62));
    else if (name === 'socket') board.group.localToWorld(vector.set(7, 4.6, -62));
    else if (name === 'panel') chassis.localToWorld(vector.set(0, 232, -55));
    else if (name === 'case') chassis.localToWorld(vector.set(-104, 43, -63));
    else if (name.startsWith('memory'))
      board.group.localToWorld(vector.set(75 + Number(name.at(-1)) * 20, 7, -62));
    else placements[name].mesh.getWorldPosition(vector);
    const rotation = getPartPose(
      state,
      name.startsWith('coolerFan') && !getCooling(state).placed
        ? 'cooler'
        : ['case', 'panel', 'psu', 'ioShield', ...STANDOFF_KEYS, ...COVER_KEYS].includes(name)
          ? 'case'
          : 'board',
    ).rotation;
    return { x: vector.x, y: vector.y, z: vector.z, rotation };
  }
  function placementEvent(name) {
    const pose = destinationPose(name);
    return {
      type: 'place',
      target: name,
      rotation: rotationDifference(heldRotation(), pose.rotation),
    };
  }
  function keyedError(name) {
    return held
      ? keyedInstallationError(
          state,
          held.part,
          name,
          heldRotation(),
          destinationPose(name).rotation,
          Object.fromEntries(inventory.map((part) => [part.category, part])),
        )
      : null;
  }
  function validPlacement(name) {
    if (!held) return false;
    const keyed = keyedError(name);
    if (keyed !== null) return !keyed;
    if (STANDOFF_KEYS.includes(name))
      return (
        state.panelRemoved &&
        state.board !== 'case' &&
        (!getStandoffs(state)[STANDOFF_KEYS.indexOf(name)] ||
          getStandoffSlots(state)[STANDOFF_KEYS.indexOf(held.part)] === STANDOFF_KEYS.indexOf(name))
      );
    // Quarter turns keep the chosen facing; small offsets align to the socket, including old layouts.
    if (Math.abs(rotationDifference(heldRotation(), destinationPose(name).rotation)) > 45)
      return false;
    if (MOUNT_PARTS[name]) {
      const { kind, index } = MOUNT_PARTS[name];
      return (
        boardAccessible() &&
        !getCooling(state).placed &&
        !getMounting(state)[kind === 'stock' ? 'rails' : 'stock'][index]
      );
    }
    if (COVER_KEYS.includes(name))
      return state.panelRemoved && (state.board !== 'case' || !getGraphics(state).placed);
    if (name === 'case' && getGraphics(state).placed && !gpuBayOpen(state)) return false;
    if (name === 'ioShield') return state.panelRemoved && state.board !== 'case';
    if (name === 'psu') return state.panelRemoved && !getPower(state).screws.some(Boolean);
    if (name.startsWith('coolerFan'))
      return (
        !getFanConnections(state)[Number(name.at(-1))] &&
        getCoolerFans(state)[Number(name.at(-1))] !== 'locked'
      );
    if (name === 'gpu')
      return (
        boardAccessible() &&
        getGraphics(state).latchOpen &&
        !getGraphics(state).screwed &&
        (state.board !== 'case' || gpuBayOpen(state))
      );
    if (name === 'storage') return boardAccessible() && getStorage(state) !== 'locked';
    if (name === 'cooler')
      return (
        boardAccessible() &&
        state.cpu === 'locked' &&
        getCooling(state).paste &&
        getMounting(state).railScrews.every(Boolean)
      );
    if (name === 'socket') return boardAccessible() && state.socketOpen && state.cpu !== 'locked';
    if (name.startsWith('memory')) {
      const index = Number(name.at(-1));
      const occupant = getMemoryPart(state, index);
      return (
        boardAccessible() &&
        state.memoryOpen[index] &&
        (occupant === -1 || occupant === Number(held.part.at(-1)))
      );
    }
    if (name === 'panel') return true;
    return state.panelRemoved && !state.screws.some(Boolean) && getStandoffs(state).every(Boolean);
  }
  const alignmentTarget = new THREE.Group();
  const cpuAlignment = createAlignmentMarker('cpu', '#b4e7c0');
  const memoryAlignment = createAlignmentMarker('memory', '#b4e7c0');
  alignmentTarget.add(cpuAlignment, memoryAlignment);
  alignmentTarget.visible = false;
  scene.add(alignmentTarget);
  let carriedAlignment = null;
  function showGhost(name, valid) {
    if (!held || !carriedPose) return;
    if (ghostKind !== held.part) {
      ghost.traverse((object) => object.geometry?.dispose());
      carriedAlignment?.material.dispose();
      carriedAlignment = null;
      ghost.clear();
      const geometry = new THREE.BoxGeometry(...SHAPES[held.part]);
      ghostShape = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), ghostMaterial);
      const detailed =
        held.part === 'cpu' ||
        held.part === 'gpu' ||
        held.part === 'psu' ||
        held.part === 'storage' ||
        held.part.startsWith('memory');
      if (detailed) {
        ghostFill =
          held.part === 'cpu'
            ? createCPU(inventory.find((p) => p.category === 'cpu'))
            : held.part === 'psu' || held.part === 'storage' || held.part === 'gpu'
              ? createStockModel(inventory.find((p) => p.category === held.part))
              : createMemory(inventory.find((p) => p.category === 'memory'));
        ghostFill.traverse((object) => {
          if (!object.isMesh) return;
          object.material.dispose();
          object.material = ghostFillMaterial;
          object.castShadow = false;
          object.receiveShadow = false;
        });
        ghostShape.position.y = SHAPES[held.part][1] / 2;
        geometry.dispose();
      } else ghostFill = new THREE.Mesh(geometry, ghostFillMaterial);
      ghost.add(ghostShape, ghostFill);
      if (held.part === 'cpu' || held.part.startsWith('memory')) {
        carriedAlignment = createAlignmentMarker(held.part === 'cpu' ? 'cpu' : 'memory');
        ghost.add(carriedAlignment);
      }
      ghostKind = held.part;
    }
    const pose =
      name === 'table'
        ? { ...carriedPose, y: tableHeight(held.part, carriedPose) }
        : destinationPose(name);
    const detailed =
      held.part === 'cpu' ||
      held.part === 'gpu' ||
      held.part === 'psu' ||
      held.part === 'storage' ||
      held.part.startsWith('memory');
    ghost.position.set(pose.x, pose.y + (detailed ? 0 : SHAPES[held.part][1] / 2), pose.z);
    ghost.rotation.y = THREE.MathUtils.degToRad(
      name === 'table' || !valid ? carriedPose.rotation : pose.rotation,
    );
    if (held.part === 'gpu') {
      ghostFill.rotation.x = name === 'gpu' ? Math.PI / 2 : 0;
      ghostFill.position.y = name === 'gpu' ? 77 : 0;
      ghostShape.visible = name !== 'gpu';
    }
    ghostMaterial.color.set(valid ? '#b4e7c0' : '#f2be73');
    ghostFillMaterial.color.copy(ghostMaterial.color);
    ghostMaterial.opacity = 0.9;
    ghostFillMaterial.opacity = detailed ? 0.28 : 0.07;
    ghost.visible = true;
    const keyedTarget = name === 'socket' || /^memory[01]$/.test(name);
    if (keyedTarget && carriedAlignment) {
      const destination = destinationPose(name);
      alignmentTarget.position.set(destination.x, destination.y, destination.z);
      alignmentTarget.rotation.y = THREE.MathUtils.degToRad(destination.rotation);
      cpuAlignment.visible = name === 'socket';
      memoryAlignment.visible = name !== 'socket';
      alignmentTarget.visible = true;
      carriedAlignment.visible = true;
      carriedAlignment.material.color.set(valid ? '#b4e7c0' : '#f4cd72');
    } else if (carriedAlignment) carriedAlignment.visible = false;
  }
  function sendAim(active, label = '') {
    const next = `${active}:${label}`;
    if (next === lastAim) return;
    lastAim = next;
    emit({ type: 'aim', active, label });
  }
  function describeInteraction(item) {
    const cableEvent = item.event();
    if (cableEvent.type === 'cable-pick') return `拿起${CABLE_NAMES[cableEvent.cable]}线`;
    if (cableEvent.type === 'cable-port')
      return cable
        ? cable === cableEvent.target
          ? `连接${CABLE_NAMES[cable]}线`
          : `接口不匹配 · 此处是${CABLE_NAMES[cableEvent.target]}`
        : `拔下${CABLE_NAMES[cableEvent.target]}线`;
    const event = item.event();
    if (event.type === 'power-button')
      return powerCheck
        ? `${powerCheck.message}${powerCheck.warnings.length ? ' · ' + powerCheck.warnings.join('；') : ''} · 左键重新检查`
        : '左键按下开机键 · 基础装配自检';
    if (event.type === 'package-open') return '左键打开包装盒 · 对准盒身可搬运';
    if (event.type === 'package-pick') return `左键从盒内拿起${names[event.part]}`;
    if (event.type === 'stock') return `查看 ${event.part.name}`;
    if (event.type === 'pick') return `拿起${names[event.part]}`;
    if (event.type === 'tool')
      return event.tool === 'hand'
        ? '放回工具'
        : event.tool === 'paste'
          ? '拿起硅脂管'
          : '拿起螺丝刀';
    return (
      {
        'standoff-install': '左键将铜柱旋入此固定孔',
        'io-shield-install': '扣入 I/O 挡板',
        'psu-screw': '按住左键固定电源',
        'psu-unscrew': '按住左键松开电源螺丝',
        'gpu-open': '打开 PCIe 卡扣',
        'gpu-close': '关闭 PCIe 卡扣',
        'gpu-screw': '按住左键固定显卡挡板',
        'gpu-unscrew': '按住左键松开显卡挡板螺丝',
        'slot-cover-screw': '按住左键固定槽位挡板',
        'slot-cover-unscrew': '按住左键松开槽位挡板螺丝',
        'storage-press': '左键压平 M.2 末端 · 对准磁盘另一端可拿起',
        'storage-lift': '左键抬起 M.2 末端 · 对准磁盘另一端可拿起',
        'storage-screw': getStoragePressed(state)
          ? '按住左键固定 M.2 磁盘'
          : '请先放下螺丝刀，用手压平 M.2 末端',
        'storage-unscrew': '按住左键松开 M.2 螺丝',
        'paste-apply': '在 CPU 上涂硅脂',
        'fan-connect': `连接${event.action?.index === 0 ? '前侧风扇 → CPU_FAN' : '中间风扇 → CPU_OPT'}`,
        'cooler-fan-clip': '扣紧风扇钢丝扣',
        'cooler-fan-unclip': '松开风扇钢丝扣',
        'fan-disconnect': `拔下${event.action?.index === 0 ? '左侧' : '右侧'}风扇线`,
        'mount-screw': '按住左键固定支架',
        'mount-unscrew': '按住左键松开支架螺丝',
        'cooler-screw': '按住左键固定散热器',
        'cooler-film-remove': '撕下底座保护膜',
        'cooler-screw-step': `按住左键拧入螺丝 · ${getCoolerScrewDepths(state)[event.action?.index]}/3${getCoolerScrewDepths(state)[event.action?.index] > 0 ? ' · R 切换旋出' : ''} · 建议两侧交替`,
        'cooler-unscrew': `按住左键松开散热器螺丝${reverseCoolerScrew !== null ? ' · R 切换拧入' : ''}`,
        'socket-open': '释放 CPU 压杆',
        'socket-lever-open': '释放 CPU 压杆',
        'socket-cover-open': getSocketLeverOpen(state)
          ? '打开 CPU 压盖'
          : '请先释放旁边的 CPU 压杆',
        'socket-cover-close': '合上 CPU 压盖',
        'socket-lever-lock': state.socketOpen ? '请先合上 CPU 压盖' : '锁住 CPU 压杆',
        'cpu-lock': '锁住 CPU 压杆',
        'memory-open': '打开内存卡扣',
        'memory-press': '按下内存，卡扣将自动闭合',
        'memory-lock': '关闭内存卡扣',
        screw: '按住左键拧紧螺丝',
        unscrew: '按住左键松开螺丝',
      }[event.action?.type] || ''
    );
  }
  function showHover(item) {
    const { width, height, depth } = item.mesh.geometry.parameters;
    item.mesh.matrixWorld.decompose(
      hoverHighlight.position,
      hoverHighlight.quaternion,
      hoverHighlight.scale,
    );
    hoverHighlight.scale.multiply(new THREE.Vector3(width + 3, height + 3, depth + 3));
    const event = item.event();
    const mismatch = cable && event.type === 'cable-port' && event.target !== cable;
    hoverHighlight.children.forEach((child) =>
      child.material.color.set(mismatch ? '#f2be73' : '#b0f4cf'),
    );
    hoverHighlight.visible = true;
  }
  function refreshPointer() {
    if (disposed) return;
    alignmentTarget.visible = false;
    camera.updateMatrixWorld();
    ray.setFromCamera(pointer, camera);
    ghost.visible = false;
    halo.visible = false;
    hoverHighlight.visible = false;
    if (held) {
      updateHeldModel();
      if (!manualCarriedPose) carriedPose = surfaceUnderAim();
      else if (carriedPose) carriedPose.rotation = heldRotation();
      const hit = !manualCarriedPose ? getHit('place') : null;
      const placementName =
        hit && Object.keys(placements).find((name) => placements[name] === hit.item);
      currentPlacement = placementName || 'table';
      if (placementName && !carriedPose) {
        const destination = destinationPose(placementName);
        carriedPose = { x: destination.x, z: destination.z, rotation: heldRotation(), y: 0 };
      }
      placementError = '';
      if (!carriedPose) placementError = '看向附近的桌面或地面';
      else if (currentPlacement === 'table') {
        try {
          validateTablePlacement(state, held.part, carriedPose);
        } catch (error) {
          placementError = error.message;
        }
      } else if (!validPlacement(currentPlacement)) {
        if (keyedError(currentPlacement)) placementError = keyedError(currentPlacement);
        else if (STANDOFF_KEYS.includes(currentPlacement))
          placementError = !state.panelRemoved
            ? '请先打开机箱侧板'
            : state.board === 'case'
              ? '主板遮挡铜柱，请先取出主板'
              : '此孔位已装有铜柱';
        else if (
          Math.abs(rotationDifference(heldRotation(), destinationPose(currentPlacement).rotation)) >
          45
        )
          placementError = '方向未对齐 · 按 R 旋转，对齐角标、缺口或安装孔';
        else if (MOUNT_PARTS[currentPlacement])
          placementError = getCooling(state).placed
            ? '请先取下散热塔'
            : '请先拿走占用此位置的卡座或支架';
        else if (COVER_KEYS.includes(currentPlacement))
          placementError = !state.panelRemoved ? '请先打开机箱侧板' : '显卡占用开口，请先取出显卡';
        else if ((currentPlacement === 'gpu' || currentPlacement === 'case') && !gpuBayOpen(state))
          placementError = '请先取下两块槽位挡板，腾出显卡开口';
        else if (currentPlacement === 'ioShield')
          placementError =
            state.board === 'case' ? '主板接口挡住了挡板，请先取出主板' : '请先打开机箱侧板';
        else if (held.part === 'board' && !getStandoffs(state).every(Boolean))
          placementError = '主板下方缺少铜柱支撑，请补齐四个固定孔的铜柱';
        else if (currentPlacement === 'psu') placementError = '请先打开机箱侧板';
        else if (
          STANDOFF_KEYS.includes(currentPlacement)
            ? '左键将铜柱旋入此固定孔'
            : currentPlacement.startsWith('coolerFan')
        )
          placementError = '请先拔下风扇线并松开钢丝扣';
        else if (currentPlacement === 'gpu') placementError = '请先打开 PCIe 卡扣';
        else if (currentPlacement === 'cooler')
          placementError =
            state.cpu !== 'locked'
              ? '请先安装并锁定 CPU'
              : !getCooling(state).paste
                ? '请先在 CPU 上涂硅脂'
                : '请先拆下原卡座并固定两侧散热支架';
        else if (currentPlacement.startsWith('memory')) {
          const index = Number(currentPlacement.at(-1));
          const slotName = index === 0 ? 'A2' : 'B2';
          const occupant = getMemoryPart(state, index);
          placementError =
            occupant !== -1 && occupant !== Number(held.part.at(-1))
              ? `${slotName} 插槽已被另一根内存占用`
              : `请先打开 ${slotName} 内存卡扣`;
        } else placementError = '打开对应扣具或侧板后再安装';
      }
      if (carriedPose) showGhost(currentPlacement, !placementError);
      sendAim(
        controls.active && !placementError,
        controls.active
          ? placementError ||
              (COVER_KEYS.includes(currentPlacement)
                ? '左键放回槽位挡板，再用螺丝刀固定'
                : STANDOFF_KEYS.includes(currentPlacement)
                  ? '左键将铜柱旋入此固定孔'
                  : currentPlacement.startsWith('coolerFan')
                    ? `贴到散热塔${currentPlacement.endsWith('0') ? '左' : '右'}侧`
                    : MOUNT_PARTS[currentPlacement]
                      ? `安装${names[currentPlacement]}`
                      : currentPlacement.startsWith('memory')
                        ? `缺口已对齐 · 左键插入 ${currentPlacement === 'memory0' ? 'A2' : 'B2'} 插槽，再按下锁紧`
                        : currentPlacement === 'socket'
                          ? '角标已对齐 · 左键放入 CPU，再合盖锁杆'
                          : currentPlacement === 'psu'
                            ? '装入机箱电源位'
                            : currentPlacement === 'gpu'
                              ? '插入 PCIe 插槽'
                              : currentPlacement === 'storage'
                                ? '插入 M.2 插槽'
                                : currentPlacement === 'ioShield'
                                  ? '扣入 I/O 挡板'
                                  : `放下${names[held.part]}`)
          : '',
      );
    } else {
      const previousHover = hovered;
      hovered = getHit('interact')?.item || null;
      if (hovered !== previousHover) reverseCoolerScrew = null;
      if (controls.active && hovered) showHover(hovered);
      const droppingTool = tool !== 'hand' && !hovered;
      const dropSurface = droppingTool ? surfaceUnderAim() : null;
      sendAim(
        controls.active &&
          (!!hovered || !!dropSurface) &&
          !(cable && hovered?.event().type === 'cable-port' && hovered.event().target !== cable),
        controls.active
          ? hovered
            ? describeInteraction(hovered)
            : droppingTool
              ? dropSurface
                ? `放下${tool === 'driver' ? '螺丝刀' : '硅脂管'}`
                : '看向附近的桌面或地面放下工具'
              : cable
                ? `拿着${CABLE_NAMES[cable]} · 对准接口连接，空白处左键放回`
                : ''
          : '',
      );
      if (controls.active && hovered?.key.includes('screw')) {
        hovered.mesh.getWorldPosition(halo.position);
        halo.position.y += 13;
        halo.visible = true;
      }
      if (screwHold && hovered !== screwHold.target) cancelScrew();
    }
  }
  function moveHeld(dx, dz) {
    if (!held || !carriedPose) return;
    carriedPose.x += dx;
    carriedPose.z += dz;
    manualCarriedPose = true;
    needsRender = true;
    refreshPointer(false);
  }
  function placeHeld() {
    if (!held) return;
    refreshPointer();
    if (placementError || !carriedPose) {
      emit({ type: 'hint', message: placementError || '请看向可放置的表面' });
      return;
    }
    if (currentPlacement !== 'table') emit(placementEvent(currentPlacement));
    else
      emit({ type: 'place', target: 'table', pose: { ...carriedPose, rotation: heldRotation() } });
  }
  function interact() {
    if (held) {
      placeHeld();
      return;
    }
    refreshPointer();
    if (!hovered) {
      if (cable) {
        emit({ type: 'cable-cancel' });
        return;
      }
      if (tool !== 'hand') {
        const pose = surfaceUnderAim();
        if (!pose) {
          emit({ type: 'hint', message: '请看向附近的桌面或地面放下工具' });
          return;
        }
        const support =
          pose.y === CART.y
            ? CART.y + 1
            : pose.y === FLOOR_Y
              ? FLOOR_Y + 1
              : surfaceHeight(pose.x, pose.z);
        toolPositions[tool].set(pose.x, support + (tool === 'driver' ? 12 : 8), pose.z);
        emit({ type: 'tool', tool: 'hand' });
      }
      return;
    }
    if (hovered.key.includes('screw')) {
      startScrew(hovered);
      return;
    }
    const interaction = hovered.event();
    if (interaction.type === 'power-button') {
      const report = checkPowerOn(state);
      displayPowerCheck(report);
      emit({ type: 'power-check', report });
      refreshPointer(false);
      return;
    }

    if (interaction.type === 'stock') controls.exitLook();
    else if (interaction.part) selectedPart = interaction.part;
    emit(interaction);
  }
  function cancelScrew() {
    if (screwHold) {
      needsRender = true;
      renderer.shadowMap.needsUpdate = true;
      if (screwHold.target.key.startsWith('screw')) {
        const index = Number(screwHold.target.key.at(-1));
        installedScrews[index].children.forEach((child) => {
          child.visible = state.screws[index];
        });
        screwTargets[index].mesh.visible = true;
        looseScrews[index].visible = !state.screws[index];
      }
    }
    screwHold = null;
    progress.visible = false;
  }
  function toggleScrewDirection() {
    if (!controls.active || held || tool !== 'driver' || !hovered?.key.startsWith('cooler-screw'))
      return;
    const index = Number(hovered.key.at(-1));
    const depth = getCoolerScrewDepths(state)[index];
    if (depth === 0 || depth === 3) return;
    cancelScrew();
    reverseCoolerScrew = reverseCoolerScrew === index ? null : index;
    needsRender = true;
  }
  function startScrew(target) {
    if (screwHold) return;
    needsRender = true;
    renderer.shadowMap.needsUpdate = true;
    screwHold = { target, started: performance.now() };
    if (target.key.startsWith('screw')) {
      const index = Number(target.key.at(-1));
      installedScrews[index].children.forEach((child) => {
        child.visible = true;
      });
      looseScrews[index].visible = false;
    }
    target.mesh.getWorldPosition(progress.position);
    if (target.key.startsWith('psu-screw')) {
      const orientation = target.mesh.getWorldQuaternion(new THREE.Quaternion());
      progress.position.addScaledVector(
        new THREE.Vector3(0, 1, 0).applyQuaternion(orientation),
        17,
      );
      progress.quaternion
        .copy(orientation)
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    } else {
      progress.position.y += 17;
      progress.rotation.set(-Math.PI / 2, 0, 0);
    }
    progress.visible = true;
  }
  const quality = createAdaptiveQuality();
  let viewportWidth = 1,
    viewportHeight = 1;
  function applyQuality() {
    renderer.setPixelRatio(
      renderPixelRatio(viewportWidth, viewportHeight, window.devicePixelRatio, quality.profile),
    );
    renderer.domElement.dataset.renderQuality = quality.profile.name;
    if (renderer.shadowMap.enabled !== quality.profile.shadows) {
      renderer.shadowMap.enabled = quality.profile.shadows;
      renderer.shadowMap.needsUpdate = true;
      scene.traverse((object) => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material) material.needsUpdate = true;
      });
    }
    needsRender = true;
  }
  const observer = new ResizeObserver(resize);
  function resize() {
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height) return;
    viewportWidth = width;
    viewportHeight = height;
    applyQuality();
    renderer.setSize(width, height);
    needsRender = true;
    camera.aspect = width / height;
    camera.fov = width < 700 ? 76 : 62;
    camera.updateProjectionMatrix();
  }
  observer.observe(element);
  resize();
  const cameraStep = (direction) => controls.cameraStep(direction);
  function view(name) {
    scene.updateMatrixWorld(true);
    const boardPosition = board.group.getWorldPosition(new THREE.Vector3());
    const casePosition = chassis.getWorldPosition(new THREE.Vector3());
    const poses = {
      cart: { camera: [CART.x, 650, CART.z + 1100], target: [CART.x, CART.y, CART.z] },
      shelves: { camera: [shelfX('cpu'), 420, -950], target: [shelfX('cpu'), 270, -1880] },
      overview: { camera: [0, 640, 990], target: [0, 20, -100] },
      bench: {
        camera: [boardPosition.x, boardPosition.y + 460, boardPosition.z + 650],
        target: boardPosition.toArray(),
      },
      case: {
        camera: [casePosition.x + 210, casePosition.y + 490, casePosition.z + 680],
        target: [casePosition.x, casePosition.y + 70, casePosition.z],
      },
    };
    if (name.startsWith('shelf:')) {
      const x = shelfX(name.slice(6));
      poses[name] = { camera: [x, 420, -950], target: [x, 270, -1880] };
    }
    if (name === 'focus') {
      const part = selectedPart;
      const center = models[part].getWorldPosition(new THREE.Vector3());
      const distance = part === 'case' || part === 'panel' ? 800 : part === 'board' ? 550 : 350;
      poses.focus = {
        camera: center
          .clone()
          .add(new THREE.Vector3(0, distance * 0.6, distance * 0.85))
          .toArray(),
        target: center.toArray(),
      };
    }
    if (!poses[name]) return;
    needsRender = true;
    const destination = new THREE.Vector3(...poses[name].camera);
    const target = new THREE.Vector3(...poses[name].target);
    const virtual = camera.clone();
    virtual.position.copy(destination);
    virtual.lookAt(target);
    cameraDestination = { position: destination, quaternion: virtual.quaternion.clone() };
    if (reducedMotion) {
      camera.position.copy(destination);
      camera.quaternion.copy(virtual.quaternion);
      cameraDestination = null;
    }
    manualCarriedPose = false;
  }
  let previousTime = 0;
  function loop(time = 0) {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    const delta = Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (document.hidden) {
      quality.sample(time, false);
      return;
    }
    controls.update(delta);
    const animatingParts = moves.size > 0 || angles.size > 0 || insertions.size > 0;
    if (!needsRender && !cameraDestination && !animatingParts && !screwHold) {
      quality.sample(time, false);
      return;
    }
    if (quality.sample(time, true)) applyQuality();
    needsRender = false;
    if (animatingParts || held || tool === 'driver' || tool === 'paste' || screwHold)
      renderer.shadowMap.needsUpdate = true;
    if (cameraNoticePending) {
      cameraNoticePending = false;
      emit({ type: 'camera' });
    }
    if (cameraDestination) {
      camera.position.lerp(cameraDestination.position, 0.09);
      camera.quaternion.slerp(cameraDestination.quaternion, 0.09);
      if (camera.position.distanceTo(cameraDestination.position) < 0.2) {
        camera.position.copy(cameraDestination.position);
        camera.quaternion.copy(cameraDestination.quaternion);
        cameraDestination = null;
      }
    }
    for (const [object, motion] of insertions) {
      const t = THREE.MathUtils.clamp((time - motion.time) / 320, 0, 1);
      const approach = motion.end.clone().add(new THREE.Vector3(0, 22, 0));
      if (t < 0.55) object.position.lerpVectors(motion.start, approach, 1 - (1 - t / 0.55) ** 3);
      else object.position.lerpVectors(approach, motion.end, (t - 0.55) / 0.45);
      if (t >= 1) insertions.delete(object);
    }
    for (const [object, destination] of moves) {
      object.position.lerp(destination, reducedMotion ? 1 : 1 - Math.exp(-delta / 0.06));
      if (object.position.distanceTo(destination) < 0.1) {
        object.position.copy(destination);
        moves.delete(object);
      }
    }
    for (const [object, rotation] of angles) {
      const alpha = reducedMotion ? 1 : 1 - Math.exp(-delta / 0.06);
      object.rotation.x = THREE.MathUtils.lerp(object.rotation.x, rotation.x, alpha);
      const yawDelta = Math.atan2(
        Math.sin(rotation.y - object.rotation.y),
        Math.cos(rotation.y - object.rotation.y),
      );
      object.rotation.y += yawDelta * alpha;
      object.rotation.z = THREE.MathUtils.lerp(object.rotation.z, rotation.z, alpha);
      if (
        Math.abs(object.rotation.x - rotation.x) +
          Math.abs(yawDelta) +
          Math.abs(object.rotation.z - rotation.z) <
        0.003
      ) {
        object.rotation.copy(rotation);
        angles.delete(object);
      }
    }
    supplyCables.update(state, cable, camera, held?.part);
    refreshPointer();
    if (screwHold) {
      const ratio = Math.min((time - screwHold.started) / 720, 1);
      progress.geometry.setDrawRange(
        0,
        Math.floor((ratio * progress.geometry.index.count) / 3) * 3,
      );
      progress.getWorldPosition(driver.position);
      if (screwHold.target.key.startsWith('psu-screw')) {
        const orientation = screwHold.target.mesh.getWorldQuaternion(new THREE.Quaternion());
        driver.position.addScaledVector(
          new THREE.Vector3(0, 1, 0).applyQuaternion(orientation),
          65,
        );
        driver.quaternion
          .copy(orientation)
          .multiply(
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, reducedMotion ? 0 : ratio * Math.PI * 5, 0),
            ),
          );
      } else {
        driver.position.y += 65;
        const direction = screwHold.target.event().action?.type === 'cooler-unscrew' ? -1 : 1;
        driver.rotation.set(0, reducedMotion ? 0 : direction * ratio * Math.PI * 5, 0);
      }
      if (ratio >= 1) {
        const completed = screwHold.target.event();
        cancelScrew();
        emit(completed);
      }
    }
    if (!screwHold) {
      if (tool === 'driver') {
        moves.delete(driver);
        angles.delete(driver);
        const grip = new THREE.Vector3(115, -130, -360);
        camera.localToWorld(grip);
        driver.position.copy(grip);
        driver.quaternion
          .copy(camera.quaternion)
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.15)));
      } else if (!moves.has(driver) && driver.position.distanceTo(toolPositions.driver) > 1) {
        setMotion(driver, toolPositions.driver.toArray(), [Math.PI / 2, 0, -0.22]);
      }
    }
    if (tool === 'paste') {
      const grip = new THREE.Vector3(110, -120, -340);
      camera.localToWorld(grip);
      pasteTube.position.copy(grip);
      pasteTube.quaternion.copy(camera.quaternion);
    } else {
      pasteTube.position.copy(toolPositions.paste);
      pasteTube.rotation.set(Math.PI / 2, 0, 0);
    }
    if (models.storage) {
      const visual = models.storage.userData.visual;
      const tilt =
        held?.part !== 'storage' && getStorage(state) === 'seated' && !getStoragePressed(state)
          ? 0.15
          : 0;
      visual.rotation.z = -tilt;
      visual.position.set(40 - 40 * Math.cos(tilt), 40 * Math.sin(tilt), 0);
    }
    fixtures.project(camera, viewportWidth, viewportHeight);
    renderer.render(scene, camera);
  }
  update(DEFAULT_STATE);
  loop();
  return {
    update,
    view,
    cameraStep,
    moveHeld,
    placeHeld,
    interact,
    toggleScrewDirection,
    enterLook: controls.enterLook,
    exitLook: controls.exitLook,
    screenshot() {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
    dispose() {
      disposed = true;
      fixtures.dispose();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextrestored', restoreContext);
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) {
          const list = Array.isArray(object.material) ? object.material : [object.material];
          for (const mat of list) {
            materials.add(mat);
            if (mat.map) textures.add(mat.map);
          }
        }
      });
      ghostMaterial.dispose();
      ghostFillMaterial.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      textures.forEach((texture) => texture.dispose());
      environment.dispose();
      key.shadow.dispose();
      insertions.clear();
      moves.clear();
      angles.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
