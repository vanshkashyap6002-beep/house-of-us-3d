import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ============================================================
   HOUSE OF US — real Three.js scene
   Floating island in a slowly rotating starfield. Roof lifts
   away and interior lights up as the camera moves in; it
   settles back down as the camera pulls out. All geometry is
   procedural (boxes/cones/planes) — there is no external 3D
   model file, so this stays lightweight and dependency-free.
   ============================================================ */

const flowerHex = {
  marigold: 0xf4a531,
  rose: 0xd94f70,
  tulip: 0xb53a5c,
  daisy: 0xf4d35e
};

let scene, camera, renderer, controls;
let disposed=false,frameId=0,resizeHandler;
let roofGroup, wallsGroup, interiorGroup, island, skyDome, tvScreenMesh, activeVideo;
let hotspots = [];
let windElements = [];
let glowMeshes = [];
let raycaster, mouse;
let isZoomedIn = false;
let clock;
let onHotspotClick = null; // set by app.js

let sunLight, ambientLight, warmFillLight;
let sunMesh, moonMesh, starsMaterial;
let dayNightT = 0;      // 0 = day, 1 = night (current, smoothed)
let dayNightTarget = 0; // 0 = day, 1 = night (target)
let timeOfDay = 14;
let timeTarget = 14;
let previousNightState = false;
let nightElapsed = 0;
let shootingStarSeen = false;
let shootingStarGroup;
let shootingStarLine;
let shootingStarHead;
let cameraArrival = null;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SKY_DAY = new THREE.Color(0x6fb4e0);
const SKY_NIGHT = new THREE.Color(0x0a0e2e);
const SKY_TWILIGHT = new THREE.Color(0xc48672);
const SKY_HORIZON_DAY = new THREE.Color(0xe5d0af);
const SKY_HORIZON_NIGHT = new THREE.Color(0x253353);
const COLOR_SCRATCH = new THREE.Color();
const CAMERA_TARGET = new THREE.Vector3();

const CAMERA_FAR = 39;
const CAMERA_NEAR = 8;
const ZOOM_THRESHOLD = 17; // distance at which roof state flips

function initScene(container) {
  scene = new THREE.Scene();
  scene.background = SKY_NIGHT.clone();
  scene.fog = new THREE.FogExp2(SKY_DAY.getHex(), 0.009);

  camera = new THREE.PerspectiveCamera(
    38,
    container.clientWidth / container.clientHeight,
    0.1,
    200
  );
  camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(19))/Math.min(1,camera.aspect)));camera.updateProjectionMatrix();
  camera.position.set(0, 28, 39);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  const mobile = window.matchMedia("(max-width: 720px)").matches;
  const lowPower = mobile || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = reducedMotion ? 0.04 : 0.075;
  controls.minPolarAngle = 0.16;
  controls.minDistance = CAMERA_NEAR;
  controls.maxDistance = CAMERA_FAR;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.update();

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  clock = new THREE.Clock();

  buildLights();
  buildSkyDome();
  buildStarfield();
  buildCelestial();
  buildIsland();
  buildHouse();
  buildGarden();
  buildShootingStar();
  scene.traverse((obj) => {
    if (obj.isMesh && obj.material?.emissive && obj.userData.baseEmissive !== undefined) glowMeshes.push(obj);
  });
  applyDayNight();

  resizeHandler=()=>onResize(container);window.addEventListener("resize",resizeHandler);
  renderer.domElement.addEventListener("click", onClick);

  animate();
}

function onResize(container) {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(19))/Math.min(1,camera.aspect)));
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

/* ---------------- LIGHTS ---------------- */
function buildLights() {
  const ambient = new THREE.AmbientLight(0x8899cc, 0.55);
  scene.add(ambient);
  ambientLight = ambient;

  sunLight = new THREE.DirectionalLight(0xfff3d9, 1.15);
  sunLight.position.set(-10, 18, 8);
  sunLight.castShadow = true;
  const shadowSize = window.matchMedia("(max-width: 720px)").matches ? 512 : 1024;
  sunLight.shadow.mapSize.set(shadowSize, shadowSize);
  sunLight.shadow.camera.left = -14;
  sunLight.shadow.camera.right = 14;
  sunLight.shadow.camera.top = 14;
  sunLight.shadow.camera.bottom = -14;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const warmFill = new THREE.PointLight(0xffd8a0, 1.1, 20);
  warmFill.position.set(0, 6, 4);
  scene.add(warmFill);
  warmFillLight = warmFill;
}

function buildSkyDome() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x45677f) },
      horizon: { value: new THREE.Color(0xd8b58e) },
      nadir: { value: new THREE.Color(0x263849) }
    },
    vertexShader: `varying float skyY; void main(){ skyY=uv.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 nadir; varying float skyY; void main(){ float h=smoothstep(0.06,0.94,skyY); vec3 c=mix(nadir,horizon,smoothstep(0.0,0.55,h)); c=mix(c,zenith,smoothstep(0.38,1.0,h)); gl_FragColor=vec4(c,1.0); }`
  });
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 18), material);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -20;
  scene.add(skyDome);
}

/* ---------------- STARFIELD ---------------- */
function buildStarfield() {
  const starCount = window.matchMedia("(max-width: 720px)").matches ? 600 : 1400;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 76 + Math.random() * 52;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xf8edda, size: 0.15, transparent: true, opacity: 0, sizeAttenuation: true });
  const stars = new THREE.Points(geo, mat);
  stars.name = "starfield";
  scene.add(stars);
  starsMaterial = mat;

  // a few large, soft, drifting nebula-like planes for depth
  const nebulaColors = [0x7a5aa8, 0xff9a6c, 0x4c7a52];
  for (let i = 0; i < 3; i++) {
    const spriteMat = new THREE.SpriteMaterial({
      color: nebulaColors[i],
      transparent: true,
      opacity: 0.06,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(40, 40, 1);
    sprite.position.set((i - 1) * 20, 6 + i * 4, -30 - i * 10);
    scene.add(sprite);
  }
}

/* ---------------- SUN / MOON ---------------- */
function buildCelestial() {
  const sunMat = new THREE.SpriteMaterial({
    color: 0xfff2c4, transparent: true, opacity: 1, depthWrite: false
  });
  sunMesh = new THREE.Sprite(sunMat);
  sunMesh.scale.set(2.7, 2.7, 1);
  sunMesh.position.set(16, 14, -20);
  scene.add(sunMesh);

  const moonMat = new THREE.SpriteMaterial({
    color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false
  });
  moonMesh = new THREE.Sprite(moonMat);
  moonMesh.scale.set(2.1, 2.1, 1);
  moonMesh.position.set(-14, 15, -22);
  scene.add(moonMesh);
}

function buildShootingStar() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const material = new THREE.LineBasicMaterial({ color: 0xf6d9a2, transparent: true, opacity: 0, depthWrite: false });
  shootingStarLine = new THREE.Line(geometry, material);
  shootingStarLine.frustumCulled = false;
  scene.add(shootingStarLine);
  shootingStarHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffefcf, transparent: true, opacity: 0, depthWrite: false })
  );
  scene.add(shootingStarHead);
  shootingStarGroup = { active: false, elapsed: 0, duration: 1.15, start: new THREE.Vector3(-13, 14, -20), end: new THREE.Vector3(8, 5, -20) };
}

/* ---------------- FLOATING ISLAND ---------------- */
function buildIsland() {
  island = new THREE.Group();

  const rockGeo = new THREE.CylinderGeometry(7.2, 4.25, 3.5, 32, 5);
  // roughen the rock silhouette
  const posAttr = rockGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const radiusJitter = y < 0 ? 0.88 + Math.random() * 0.22 : 0.98 + Math.random() * 0.04;
    posAttr.setX(i, posAttr.getX(i) * radiusJitter);
    posAttr.setZ(i, posAttr.getZ(i) * radiusJitter);
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a3b52, roughness: 0.95 });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.position.y = -1.6;
  rock.receiveShadow = true;
  rock.castShadow = true;
  island.add(rock);

  // Layered stone below the turf gives the world a grounded, designed silhouette.
  const strataMat = new THREE.MeshStandardMaterial({ color: 0x5c5360, roughness: 0.96, flatShading: true });
  const lowerStrataMat = new THREE.MeshStandardMaterial({ color: 0x393946, roughness: 1, flatShading: true });
  const strata = new THREE.Mesh(new THREE.CylinderGeometry(5.65, 4.9, 0.8, 24, 1), strataMat);
  strata.position.y = -1.95;
  strata.castShadow = true;
  island.add(strata);
  const lowerStrata = new THREE.Mesh(new THREE.CylinderGeometry(4.9, 3.65, 1.25, 20, 1), lowerStrataMat);
  lowerStrata.position.y = -2.75;
  lowerStrata.castShadow = true;
  island.add(lowerStrata);
  const undersideTip = new THREE.Mesh(new THREE.ConeGeometry(3.65, 2.3, 20, 2), lowerStrataMat);
  undersideTip.position.y = -4.35;
  undersideTip.rotation.x = Math.PI;
  undersideTip.castShadow = true;
  island.add(undersideTip);

  // A few soft atmospheric wisps separate the island from the empty sky below.
  const mistMaterial = new THREE.MeshBasicMaterial({ color: 0xe7e9e9, transparent: true, opacity: 0.075, depthWrite: false });
  [[-7.5,-4.7,-2.8,4.8,0.58,2.6],[6.8,-5.4,1.2,5.6,0.72,2.5],[-1.5,-6.2,6.5,4.4,0.5,2.1]].forEach(([x,y,z,sx,sy,sz])=>{
    const mist = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mistMaterial);
    mist.position.set(x,y,z); mist.scale.set(sx,sy,sz); mist.renderOrder = -1; island.add(mist);
  });

  const grassGeo = new THREE.CylinderGeometry(7.35, 7.35, 0.36, 32);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4c7a52, roughness: 0.85 });
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.position.y = 0.04;
  grass.receiveShadow = true;
  island.add(grass);

  scene.add(island);
}

/* ---------------- HOUSE ---------------- */
function buildHouse() {
  const houseBase = 1.0; // top of island surface

  wallsGroup = new THREE.Group();
  wallsGroup.position.y = houseBase;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf6ecd9, roughness: 0.8, transparent: true, opacity: 1 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.7, transparent: true, opacity: 1 });

  const wallW = 7.4, wallH = 3.1, wallD = 5.8;
  const addWall = (width, height, depth, x, y, z, material = wallMat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; wallsGroup.add(mesh);
    return mesh;
  };
  const thickness = 0.16;
  // Open architectural shell: exterior walls stay connected, with a wide front opening for the cutaway view.
  addWall(wallW, wallH, thickness, 0, wallH / 2, -wallD / 2);
  addWall(thickness, wallH, wallD, -wallW / 2, wallH / 2, 0);
  addWall(thickness, wallH, wallD, wallW / 2, wallH / 2, 0);
  const frontWing = (wallW - 1.05) / 2;
  addWall(frontWing, wallH, thickness, -(1.05 / 2 + frontWing / 2), wallH / 2, wallD / 2);
  addWall(frontWing, wallH, thickness, 1.05 / 2 + frontWing / 2, wallH / 2, wallD / 2);
  // Short internal partitions create connected library, living, and kitchen zones without closing the plan.
  addWall(thickness, 2.45, 2.65, -1.35, 1.22, -1.52);
  addWall(2.5, 2.45, thickness, 2.28, 1.22, -0.28);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(wallW + 0.22, 0.18, wallD + 0.22), trimMat);
  plinth.position.y = 0.09;
  wallsGroup.add(plinth);

  // door
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4530, roughness: 0.6, transparent: true, opacity: 1 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.88, 0.12), doorMat);
  door.position.set(0, 0.98, wallD / 2 + 0.06);
  wallsGroup.add(door);

  // door frame trim
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.7, transparent: true, opacity: 1 });
  [[1.08,.08,0,1.91],[.08,1.84,-.5,.92],[.08,1.84,.5,.92]].forEach(([w,h,x,y])=>{
    const frame=new THREE.Mesh(new THREE.BoxGeometry(w,h,.07),frameMat);
    frame.position.set(x,y,wallD/2+.035); wallsGroup.add(frame);
  });

  // door handle
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xe8b64c, roughness: 0.35, metalness: 0.5 });
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), handleMat);
  handle.position.set(0.32, 1.0, wallD / 2 + 0.13);
  wallsGroup.add(handle);

  // small porch light above the door
  const porchLightMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c4, emissive: 0xe8b64c, emissiveIntensity: 0.8, transparent: true, opacity: 1
  });
  const porchLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), porchLightMat);
  porchLight.position.set(0, 2.35, wallD / 2 + 0.1);
  porchLight.name = "porch-light";
  porchLight.userData.baseEmissive = 0.8;
  wallsGroup.add(porchLight);
  const porchGlow = new THREE.PointLight(0xffcf80, 0.5, 3);
  porchGlow.position.copy(porchLight.position);
  porchGlow.name = "porch-glow";
  wallsGroup.add(porchGlow);

  // windows (emissive glow)
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c4,
    emissive: 0xe8b64c,
    emissiveIntensity: 0.16,
    roughness: 0.22,
    metalness: 0.08,
    transparent: true,
    opacity: 1
  });
  const windowGeo = new THREE.BoxGeometry(1.05, 1.12, 0.08);
  const shutterMat = new THREE.MeshStandardMaterial({ color: 0x796750, roughness: 0.72, transparent: true, opacity: 1 });
  const sillMat = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.7, transparent: true, opacity: 1 });
  [
    [-2.25, 1.85, -wallD / 2 - 0.06],
    [2.15, 1.85, -wallD / 2 - 0.06],
    [-wallW / 2 - 0.06, 1.8, 1.25],
    [-wallW / 2 - 0.06, 1.8, -1.15],
    [wallW / 2 + 0.06, 1.8, 1.1],
    [wallW / 2 + 0.06, 1.8, -1.3]
  ].forEach((pos) => {
    const facesSide = Math.abs(pos[0]) > wallW / 2;
    const w = new THREE.Mesh(windowGeo, windowMat);
    w.scale.set(facesSide ? 0.72 : 1, 1, facesSide ? 1 : 1);
    w.position.set(...pos);
    w.userData.baseEmissive = 0.9;
    if (facesSide) w.rotation.y = Math.PI / 2;
    wallsGroup.add(w);

    // sill
    const sill = new THREE.Mesh(new THREE.BoxGeometry(facesSide ? 0.1 : 1.18, 0.08, facesSide ? 0.9 : 0.1), sillMat);
    sill.position.set(pos[0], pos[1] - 0.42, pos[2] + (facesSide ? 0 : 0.05) * (pos[2] > 0 ? 1 : -1));
    if (facesSide) sill.position.x += pos[0] > 0 ? 0.05 : -0.05;
    wallsGroup.add(sill);

    // shutters either side of the window
    const shutterOffsets = facesSide ? [[0, 0, 0.4], [0, 0, -0.4]] : [[-0.58, 0, 0], [0.58, 0, 0]];
    shutterOffsets.forEach((off) => {
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(facesSide ? 0.08 : 0.14, 0.75, facesSide ? 0.14 : 0.08), shutterMat);
      shutter.position.set(pos[0] + off[0], pos[1], pos[2] + off[2]);
      wallsGroup.add(shutter);
    });
  });

  // window point-lights (subtle warm glow)
  const glow = new THREE.PointLight(0xffcf80, 0.6, 5);
  glow.position.set(0, 1.5, wallD / 2 + 1);
  wallsGroup.add(glow);

  island.add(wallsGroup);

  // roof — a real pyramid + chimney, in its own group so it can animate away
  roofGroup = new THREE.Group();
  roofGroup.position.y = houseBase + wallH;

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x53545a, roughness: 0.84, metalness: 0.04, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const roofGeo = new THREE.ConeGeometry(5.5, 1.65, 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.85;
  roof.castShadow = true;
  roofGroup.add(roof);

  // ridge cap along the roof peak for a more finished silhouette
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x42454b, roughness: 0.72, metalness: 0.12, transparent: true, opacity: 1 });
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.55, 6), ridgeMat);
  ridge.rotation.z = Math.PI / 2;
  ridge.position.y = 1.68;
  roofGroup.add(ridge);

  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x8f3f21, roughness: 0.8, transparent: true, opacity: 1 });
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), chimneyMat);
  chimney.position.set(1.1, 1.5, 0.3);
  roofGroup.add(chimney);

  // chimney cap trim
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), ridgeMat);
  chimneyCap.position.set(1.1, 2.06, 0.3);
  roofGroup.add(chimneyCap);

  island.add(roofGroup);
  roofGroup.userData.baseY = roofGroup.position.y;

  // interior contents — revealed once the roof lifts
  interiorGroup = new THREE.Group();
  interiorGroup.position.y = houseBase;
  interiorGroup.visible = false;

  // floor
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xb99266, roughness: 0.56 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(wallW - 0.2, 0.08, wallD - 0.2), floorMat);
  floor.position.y = 0.05;
  interiorGroup.add(floor);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x76553c, roughness: 0.63 });
  const fabricMat = new THREE.MeshStandardMaterial({ color: 0xc9bba8, roughness: 0.92 });
  const linenMat = new THREE.MeshStandardMaterial({ color: 0xe2d5c3, roughness: 0.96 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4d392c, roughness: 0.68 });
  const rugMat = new THREE.MeshStandardMaterial({ color: 0xc8b79f, roughness: 1 });
  const boxInRoom = (w,h,d,x,y,z,mat,shadow=true) => {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); mesh.position.set(x,y,z);
    mesh.castShadow=shadow; mesh.receiveShadow=true; interiorGroup.add(mesh); return mesh;
  };
  // The open living hall is furnished as a room, not a single decorative cube.
  boxInRoom(3.5,.035,2.35,.05,.105,.95,rugMat,false);
  boxInRoom(2.7,.42,.88,.05,.39,1.82,fabricMat);
  boxInRoom(2.65,.76,.2,.05,.83,2.15,fabricMat);
  boxInRoom(.2,.53,.88,-1.3,.49,1.82,fabricMat);
  boxInRoom(.2,.53,.88,1.4,.49,1.82,fabricMat);
  [-1.08,1.15].forEach(x=>[-1,1].forEach(z=>boxInRoom(.08,.28,.08,x,.15,1.82+z*.24,darkWoodMat)));
  const stoneMat=new THREE.MeshStandardMaterial({color:0xd5c8b5,roughness:.46});
  boxInRoom(1.35,.12,.72,.05,.46,.45,stoneMat);
  [[-.48,-.22],[.48,-.22],[-.48,.22],[.48,.22]].forEach(([x,z])=>boxInRoom(.045,.4,.045,.05+x,.22,.45+z,ridgeMat,false));

  // bookshelf
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x6b4530, roughness: 0.7 });
  const bookshelf = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.1, 0.42), shelfMat);
  bookshelf.position.set(-2.48, 1.12, -2.48);
  bookshelf.userData.type = "bookshelf";
  bookshelf.name = "hotspot-bookshelf";
  bookshelf.castShadow = true;
  interiorGroup.add(bookshelf);
  addBookStripes(bookshelf);
  hotspots.push(bookshelf);
  boxInRoom(.8,.55,.75,-2.55,.35,-1.1,fabricMat);
  boxInRoom(.08,.45,.08,-2.85,.18,-1.35,woodMat,false);
  boxInRoom(.08,.45,.08,-2.25,.18,-1.35,woodMat,false);
  boxInRoom(.44,.06,.38,-1.92,.34,-1.15,woodMat);
  const readingLamp=new THREE.PointLight(0xffd9a0,.45,2.6); readingLamp.position.set(-1.92,.8,-1.15); interiorGroup.add(readingLamp);

  // TV
  const tvStandMat = new THREE.MeshStandardMaterial({ color: 0x6b4530, roughness: 0.7 });
  const tvStand = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 2.0), tvStandMat);
  tvStand.position.set(3.1, 0.34, 0.25);
  interiorGroup.add(tvStand);

  const tvScreenMat = new THREE.MeshStandardMaterial({
    color: 0x0c0a1a,
    emissive: 0x2c2440,
    emissiveIntensity: 0.6
  });
  const tvScreen = new THREE.Mesh(new THREE.BoxGeometry(1.72, 1.02, 0.09), tvScreenMat);
  tvScreen.rotation.y = -Math.PI / 2;
  tvScreen.position.set(3.48, 1.12, 0.25);
  tvScreen.castShadow = true;
  tvScreenMesh = tvScreen;
  tvScreen.userData.type = "tv";
  tvScreen.name = "hotspot-tv";
  interiorGroup.add(tvScreen);
  hotspots.push(tvScreen);

  boxInRoom(1.85,.035,1.4,2.15,.11,1.1,rugMat,false);
  boxInRoom(1.8,.36,.72,1.95,.34,1.72,fabricMat);
  boxInRoom(1.74,.62,.16,1.95,.76,2.0,fabricMat);

  // A compact kitchen run sits beyond the connected dining/living hall.
  const counterMat=new THREE.MeshStandardMaterial({color:0xd6d0c4,roughness:.35});
  const cabinetMat=new THREE.MeshStandardMaterial({color:0x8a765f,roughness:.72});
  boxInRoom(2.05,.78,.58,2.5,.45,-1.95,cabinetMat);
  boxInRoom(2.12,.12,.65,2.5,.9,-1.95,counterMat);
  boxInRoom(1.55,.9,.6,1.65,.48,.95,cabinetMat);
  boxInRoom(1.62,.12,.67,1.65,.99,.95,counterMat);

  // Eight timber treads connect the ground floor to the upper sleeping rooms.
  for(let i=0;i<8;i++) boxInRoom(.78,.13,.32,-.48,.12+i*.17,.92-i*.31,woodMat);
  const upperFloorGroup=new THREE.Group();
  const upperDeck=new THREE.Mesh(new THREE.BoxGeometry(5.5,.14,2.18),floorMat);
  upperDeck.position.set(.55,2.0,-1.72); upperDeck.receiveShadow=true; upperFloorGroup.add(upperDeck);
  const upperPartition=new THREE.Mesh(new THREE.BoxGeometry(.12,1.32,2.05),wallMat);
  upperPartition.position.set(.55,2.72,-1.72); upperFloorGroup.add(upperPartition);
  [[-1.0,-1.78],[2.1,-1.78]].forEach(([x,z])=>{
    const bed=new THREE.Mesh(new THREE.BoxGeometry(1.38,.28,1.62),fabricMat); bed.position.set(x,2.22,z); bed.castShadow=true; upperFloorGroup.add(bed);
    const mattress=new THREE.Mesh(new THREE.BoxGeometry(1.28,.16,1.35),linenMat); mattress.position.set(x,2.43,z+.05); upperFloorGroup.add(mattress);
    const pillow=new THREE.Mesh(new THREE.BoxGeometry(.65,.14,.34),linenMat); pillow.position.set(x,2.56,z-.48); upperFloorGroup.add(pillow);
  });
  island.add(upperFloorGroup);

  // small indoor plant near garden hotspot theme
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8f6a4a });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 10), potMat);
  pot.position.set(0, 0.15, 1.6);
  pot.userData.type = "garden";
  pot.name = "hotspot-garden-indoor";
  interiorGroup.add(pot);
  hotspots.push(pot);

  island.add(interiorGroup);
}

function addBookStripes(bookshelf) {
  const colors = [0xd94f4f, 0xe8b64c, 0x4c7a52, 0x5a7bd9, 0xb53a5c];
  colors.forEach((c, i) => {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.9, 0.32),
      new THREE.MeshStandardMaterial({ color: c })
    );
    stripe.position.set(bookshelf.position.x - 0.72 + i * 0.22, 1.1, bookshelf.position.z + 0.23);
    interiorGroup.add(stripe);
  });
}

/* ---------------- GARDEN ---------------- */
let gardenFlowers = [];

function buildGarden() {
  // trees
  [[-4.6, 0.6, 2.2], [4.5, 0.6, -1.8]].forEach((pos) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4530 })
    );
    trunk.position.y = 0.55;
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x4c7a52, roughness: 0.9 })
    );
    leaves.position.y = 1.3;
    tree.add(trunk, leaves);
    windElements.push({ object: leaves, amount: 0.035, speed: 0.7, phase: Math.random() * 6.28 });
    tree.position.set(...pos);
    tree.castShadow = true;
    island.add(tree);
  });

  // stepping-stone path from the door out toward the garden
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcbb98f, roughness: 0.85 });
  const pathPoints = [
    [0, 0.32, 2.6], [0.05, 0.32, 3.1], [-0.15, 0.32, 3.6],
    [-0.55, 0.32, 4.05], [-1.1, 0.32, 4.35]
  ];
  pathPoints.forEach((pos) => {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 8), stoneMat);
    stone.position.set(...pos);
    stone.receiveShadow = true;
    island.add(stone);
  });

  // garden bench near the flower bed
  const benchMat = new THREE.MeshStandardMaterial({ color: 0xf6ecd9, roughness: 0.6 });
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.4), benchMat);
  seat.position.y = 0.38;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.06), benchMat);
  back.position.set(0, 0.6, -0.17);
  bench.add(seat, back);
  [[-0.48, 0.19, 0.15], [0.48, 0.19, 0.15], [-0.48, 0.19, -0.15], [0.48, 0.19, -0.15]].forEach((p) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.06), benchMat);
    leg.position.set(...p);
    bench.add(leg);
  });
  bench.position.set(-1.7, 0, 3.5);
  bench.rotation.y = Math.PI / 6;
  bench.castShadow = true;
  island.add(bench);

  // low hedges bordering the garden bed
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x355a3a, roughness: 0.9 });
  const hedgePositions = [
    [-3.6, 0.22, 2.1], [-3.35, 0.22, 2.55], [-3.1, 0.22, 3.0],
    [-2.0, 0.22, 3.25], [-1.6, 0.22, 3.05]
  ];
  hedgePositions.forEach((pos) => {
    const hedge = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), hedgeMat);
    hedge.position.set(...pos);
    hedge.scale.y = 0.65;
    hedge.castShadow = true;
    island.add(hedge);
  });

  // garden lanterns — glow warmer at night (handled in animate via userData.isLantern)
  const lanternPositions = [[-2.9, 0, 1.9], [-0.9, 0, 4.5]];
  window.gardenLanterns = [];
  lanternPositions.forEach((pos) => {
    const lantern = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c2440 })
    );
    post.position.y = 0.28;
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff2c4, emissive: 0xe8b64c, emissiveIntensity: 0.5, transparent: true, opacity: 1
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), lampMat);
    lamp.position.y = 0.58;
    lamp.userData.baseEmissive = 0.5;
    const lampLight = new THREE.PointLight(0xffcf80, 0.25, 2.4);
    lampLight.position.y = 0.58;
    lantern.add(post, lamp, lampLight);
    lantern.position.set(...pos);
    lantern.userData.lampMat = lampMat;
    lantern.userData.lampLight = lampLight;
    island.add(lantern);
    window.gardenLanterns.push(lantern);
  });

  // garden hotspot: cluster of flowers, clickable as a group proxy
  const gardenProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x355a3a, transparent: true, opacity: 0.001 })
  );
  gardenProxy.position.set(-2.6, 0.32, 2.6);
  gardenProxy.userData.type = "garden";
  gardenProxy.name = "hotspot-garden-outdoor";
  island.add(gardenProxy);
  hotspots.push(gardenProxy);

  renderFlowers(window.houseData ? window.houseData.favoriteFlower : "marigold");
}

function renderFlowers(flowerKey) {
  gardenFlowers.forEach((f) => {island.remove(f);f.traverse(obj=>{obj.geometry?.dispose();if(obj.material)obj.material.dispose()})});
  windElements = windElements.filter((entry) => !gardenFlowers.includes(entry.object));
  gardenFlowers = [];

  const color = flowerHex[flowerKey] || flowerHex.marigold;
  const positions = [
    [-2.9, 0.35, 2.3], [-2.6, 0.35, 2.9], [-2.3, 0.35, 2.4],
    [-2.9, 0.35, 2.8], [-2.3, 0.35, 2.9],
    [-1.9, 0.35, 3.3], [-1.5, 0.35, 3.6], [-1.2, 0.35, 3.9]
  ];
  positions.forEach((pos) => {
    const flower = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.27, 5), new THREE.MeshStandardMaterial({ color: 0x426b43, roughness: 0.9 }));
    stem.position.y = 0.11;
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.7 }));
    bloom.position.y = 0.28;
    flower.add(stem, bloom);
    flower.position.set(pos[0], pos[1] - 0.1, pos[2]);
    island.add(flower);
    gardenFlowers.push(flower);
    windElements.push({ object: flower, amount: 0.06, speed: 1.1, phase: Math.random() * 6.28 });
  });
}

/* ---------------- CAMERA-DRIVEN ROOF / INTERIOR ---------------- */
function updateZoomState() {
  const dist = camera.position.distanceTo(controls.target);
  const shouldBeZoomedIn = dist < ZOOM_THRESHOLD;
  if (shouldBeZoomedIn !== isZoomedIn) {
    isZoomedIn = shouldBeZoomedIn;
    if (window.onZoomStateChange) window.onZoomStateChange(isZoomedIn);
  }
}

function animate() {
  if(disposed)return;frameId=requestAnimationFrame(animate);if(document.hidden){clock.getDelta();return;}
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  // Smooth clock changes and let the sun follow the selected local time.
  timeOfDay += (timeTarget - timeOfDay) * Math.min(1, dt * 1.25);
  updateCelestialPositions();
  const night = dayNightTarget > 0.5;
  if (night && !previousNightState) { nightElapsed = 0; shootingStarSeen = false; }
  if (night) nightElapsed += dt;
  previousNightState = night;
  if (night && !shootingStarSeen && nightElapsed > 13 && !reducedMotion) startShootingStar();
  updateShootingStar(dt);
  dayNightT += (dayNightTarget - dayNightT) * Math.min(1, dt * 0.8);
  applyDayNight();

  // island gentle float + rotation
  island.position.y = Math.sin(t * 0.6) * 0.18;
  if (!reducedMotion) island.rotation.y += dt * 0.008;
  if (!reducedMotion) windElements.forEach((entry) => {
    entry.object.rotation.z = Math.sin(t * entry.speed + entry.phase) * entry.amount;
  });

  if (cameraArrival) {
    cameraArrival.elapsed += dt;
    const p = Math.min(1, cameraArrival.elapsed / cameraArrival.duration);
    const eased = p * p * (3 - 2 * p);
    camera.position.lerpVectors(cameraArrival.fromPosition, cameraArrival.toPosition, eased);
    controls.target.lerpVectors(cameraArrival.fromTarget, cameraArrival.toTarget, eased);
    if (p >= 1) { cameraArrival = null; controls.enabled = true; }
  }

  // starfield slow drift
  const stars = scene.getObjectByName("starfield");
  if (stars) stars.rotation.y += dt * 0.005;

  // roof animate toward target based on zoom state
  const targetY = isZoomedIn ? roofGroup.userData.baseY + 3.4 : roofGroup.userData.baseY;
  roofGroup.position.y += (targetY - roofGroup.position.y) * Math.min(1, dt * 3);
  const targetOpacity = isZoomedIn ? 0 : 1;
  roofGroup.children.forEach((child) => {
    if (!child.material) return;
    child.material.transparent = true;
    child.material.opacity += (targetOpacity - child.material.opacity) * Math.min(1, dt * 4);
  });
  roofGroup.visible = roofGroup.children.some((c) => c.material && c.material.opacity > 0.02) || !isZoomedIn;

  // walls fade slightly + interior toggling
  interiorGroup.visible = isZoomedIn;
  wallsGroup.traverse((child) => {
    if (child.material && child.isMesh) {
      child.material.transparent = true;
      const targetWallOpacity = isZoomedIn ? 0.18 : 1;
      child.material.opacity += (targetWallOpacity - (child.material.opacity ?? 1)) * Math.min(1, dt * 3);
    }
  });

  updateZoomState();
  controls.update();
  renderer.render(scene, camera);
}

function applyDayNight() {
  const bg = COLOR_SCRATCH.copy(SKY_DAY).lerp(SKY_TWILIGHT, Math.max(0, 1 - Math.abs(dayNightT - 0.5) * 2)).lerp(SKY_NIGHT, dayNightT);
  scene.background.copy(bg);
  scene.fog.color.copy(bg);
  if (skyDome) {
    skyDome.material.uniforms.zenith.value.copy(SKY_DAY).lerp(SKY_NIGHT, dayNightT);
    skyDome.material.uniforms.horizon.value.copy(SKY_HORIZON_DAY).lerp(SKY_TWILIGHT, Math.max(0, 1 - Math.abs(dayNightT - 0.5) * 2)).lerp(SKY_HORIZON_NIGHT, dayNightT);
    skyDome.material.uniforms.nadir.value.copy(SKY_DAY).lerp(SKY_NIGHT, dayNightT);
  }

  if (ambientLight) {
    ambientLight.intensity = 0.55 - dayNightT * 0.28;
    ambientLight.color.setHex(0xd9e7ff).lerp(new THREE.Color(0x3a4a7a), dayNightT);
  }
  if (sunLight) {
    sunLight.intensity = Math.max(0.05, 1.35 * (1 - dayNightT));
    sunLight.color.setHex(0xffedcf).lerp(new THREE.Color(0xbfd0ff), dayNightT);
  }
  if (warmFillLight) {
    warmFillLight.intensity = 1.1 + dayNightT * 0.4;
  }
  if (sunMesh) sunMesh.material.opacity = Math.max(0, 1 - dayNightT * 1.4);
  if (moonMesh) moonMesh.material.opacity = Math.max(0, dayNightT * 1.4 - 0.4);
  if (starsMaterial) starsMaterial.opacity = dayNightT * 0.85;

  // window / porch / lantern glow reads warmer and brighter after dusk
  const glowBoost = 0.9 + dayNightT * 0.9;
  glowMeshes.forEach((obj) => {
    obj.material.emissiveIntensity = obj.userData.baseEmissive * glowBoost;
  });
  if (window.gardenLanterns) {
    window.gardenLanterns.forEach((lantern) => {
      lantern.userData.lampLight.intensity = 0.25 + dayNightT * 0.35;
    });
  }
}

function updateCelestialPositions() {
  const daylight = Math.max(0, Math.sin(((timeOfDay - 6) / 12) * Math.PI));
  const angle = ((timeOfDay - 6) / 12) * Math.PI;
  const x = Math.cos(angle) * 23;
  const y = 2 + daylight * 21;
  if (sunMesh) sunMesh.position.set(x, y, -24);
  if (sunLight) sunLight.position.set(x, Math.max(8, y), 8);
  const moonHour = (timeOfDay + 12) % 24;
  const moonAngle = ((moonHour - 6) / 12) * Math.PI;
  if (moonMesh) moonMesh.position.set(Math.cos(moonAngle) * 22, 5 + Math.max(0, Math.sin(moonAngle)) * 17, -26);
}

function startShootingStar() {
  shootingStarSeen = true;
  shootingStarGroup.active = true;
  shootingStarGroup.elapsed = 0;
}

function updateShootingStar(dt) {
  if (!shootingStarGroup?.active) return;
  shootingStarGroup.elapsed += dt;
  const p = Math.min(1, shootingStarGroup.elapsed / shootingStarGroup.duration);
  const head = shootingStarGroup.start.clone().lerp(shootingStarGroup.end, p);
  const tail = shootingStarGroup.start.clone().lerp(shootingStarGroup.end, Math.max(0, p - 0.16));
  const positions = shootingStarLine.geometry.attributes.position;
  positions.setXYZ(0, tail.x, tail.y, tail.z);
  positions.setXYZ(1, head.x, head.y, head.z);
  positions.needsUpdate = true;
  shootingStarHead.position.copy(head);
  const alpha = Math.sin(Math.PI * p);
  shootingStarLine.material.opacity = alpha * 0.9;
  shootingStarHead.material.opacity = alpha;
  if (p >= 1) {
    shootingStarGroup.active = false;
    shootingStarLine.material.opacity = 0;
    shootingStarHead.material.opacity = 0;
  }
}

function setTime(hour) {
  timeTarget = Math.max(5, Math.min(23, Number(hour) || 14));
  const solar = Math.sin(((timeTarget - 6) / 12) * Math.PI);
  dayNightTarget = solar < 0.08 ? 1 : solar < 0.32 ? 0.7 : solar < 0.55 ? 0.28 : 0;
}

function beginArrival() {
  if (reducedMotion) return;
  cameraArrival = {
    elapsed: 0,
    duration: 3.2,
    fromPosition: camera.position.clone(),
    toPosition: new THREE.Vector3(12.5, 16.5, 21),
    fromTarget: controls.target.clone(),
    toTarget: new THREE.Vector3(0, 1.1, 0)
  };
  controls.enabled = false;
}

function focusArea(type) {
  const points = { bookshelf: [-2.45, 1.1, -1.8], tv: [2.95, 1.1, 0.4], garden: [-2.6, 0.3, 2.6] };
  const local = points[type];
  if (!local) return;
  const target = island.localToWorld(new THREE.Vector3(...local));
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  cameraArrival = { elapsed: 0, duration: 1.1, fromPosition: camera.position.clone(), toPosition: target.clone().add(direction.multiplyScalar(type === "garden" ? 12 : 10)), fromTarget: controls.target.clone(), toTarget: target };
  controls.enabled = false;
}

function playVideo(video) {
  if(!tvScreenMesh||!(video instanceof HTMLVideoElement))return;stopVideo();activeVideo=video;const texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.SRGBColorSpace;tvScreenMesh.material.dispose();tvScreenMesh.material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});tvScreenMesh.userData.videoTexture=texture;
}
function stopVideo(){
 if(activeVideo){activeVideo.pause();activeVideo.removeAttribute("src");activeVideo.load();activeVideo=null;}
 if(tvScreenMesh?.userData.videoTexture){tvScreenMesh.userData.videoTexture.dispose();tvScreenMesh.material.dispose();tvScreenMesh.material=new THREE.MeshStandardMaterial({color:0x0c0a1a,emissive:0x2c2440,emissiveIntensity:0.6});delete tvScreenMesh.userData.videoTexture;}
}

/* ---------------- INTERACTION ---------------- */
function onClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(hotspots, false);
  if (intersects.length && onHotspotClick) {
    onHotspotClick(intersects[0].object.userData.type);
  }
}

/* ---------------- PUBLIC API ---------------- */
function setZoomExternally(zoomIn) {
  cameraArrival=null;controls.enabled=true;
  const dist = zoomIn ? ZOOM_THRESHOLD - 3 : 32;
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  if(!zoomIn)controls.target.set(0,1.2,0);
  const newPos = new THREE.Vector3().addVectors(controls.target, dir.multiplyScalar(Math.max(dist, CAMERA_NEAR)));
  camera.position.copy(newPos);
}

function setDayNight(isNight) {
  setTime(isNight ? 21 : 14);
}

window.HouseScene = {
  dispose,
  init: initScene,
  setHotspotHandler: (fn) => { onHotspotClick = fn; },
  setZoom: setZoomExternally,
  setFlower: renderFlowers,
  setDayNight: setDayNight,
  setTime,
  beginArrival,
  focusArea,
  playVideo,
  stopVideo,
  isReady: () => !!scene
};

function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frameId);window.removeEventListener("resize",resizeHandler);renderer?.domElement.removeEventListener("click",onClick);stopVideo();controls?.dispose();const geometry=new Set(),materials=new Set(),textures=new Set();scene?.traverse(obj=>{if(obj.geometry)geometry.add(obj.geometry);obj.shadow?.dispose();for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material])){if(!mat)continue;materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value)}});geometry.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());renderer?.dispose();}
window.addEventListener("pagehide",e=>{if(!e.persisted)dispose()});
