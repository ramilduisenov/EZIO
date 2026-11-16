// EZIO — interactive 3D bottle (three.js r160, vendored)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('bottle3d');
const buttons = [...document.querySelectorAll('.views button')];
const VIEWS = [0, Math.PI / 4, Math.PI / 2, Math.PI]; // front, 3/4, side, back

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
} catch (e) {
  stage.classList.add('no3d'); // keep the photo fallback
  throw e;
}
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
camera.position.set(0, 0.15, 4.4);

const key = new THREE.DirectionalLight(0xfff4dc, 2.2); key.position.set(-2.5, 3, 2.5); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ff5ee, 1.4); rim.position.set(3, 1, -2.5); scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

// soft contact shadow
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(11,110,107,.45)'); gr.addColorStop(1, 'rgba(11,110,107,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.enablePan = false; controls.enableZoom = false;
controls.minPolarAngle = Math.PI * 0.32; controls.maxPolarAngle = Math.PI * 0.62;
controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
controls.target.set(0, 0, 0);

// The generator baked the PET as opaque white. Low-saturation light texels
// (plastic) become see-through mint; saturated label/cap and dark print stay solid.
function glassify(mat, back) {
  mat.transparent = true;
  mat.side = back ? THREE.BackSide : THREE.FrontSide;
  mat.depthWrite = !back;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        vec3 sc = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); // judge in sRGB
        float mx = max(sc.r, max(sc.g, sc.b)), mn = min(sc.r, min(sc.g, sc.b));
        float sat = (mx - mn) / max(mx, 1e-4);
        float solid = smoothstep(0.30, 0.46, sat);
        solid = max(solid, 1.0 - smoothstep(0.35, 0.55, mx));
        vec3 mint = vec3(0.55, 0.90, 0.85);
        diffuseColor.rgb = mix(mint, c, solid);
        diffuseColor.a = mix(${back ? '0.08' : '0.16'}, 1.0, solid);
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(0.06, roughnessFactor, diffuseColor.a);`);
  };
  mat.customProgramCacheKey = () => 'ezio-glass-' + (back ? 'b' : 'f');
  mat.needsUpdate = true;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
let bottle = null;
loader.load(new URL('../models/ezio.glb', import.meta.url).href, (gltf) => {
  bottle = gltf.scene;
  const box = new THREE.Box3().setFromObject(bottle);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = 1.9 / size.y; bottle.scale.setScalar(s);
  bottle.position.sub(center.multiplyScalar(s));
  shadow.position.y = -0.95;
  bottle.traverse((o) => {
    if (!o.isMesh) return;
    const front = o.material; front.metalness = 0;
    const backMesh = o.clone(); backMesh.material = front.clone();
    glassify(backMesh.material, true); glassify(front, false);
    backMesh.renderOrder = 0; o.renderOrder = 1;
    o.parent.add(backMesh);
  });
  bottle.userData.y0 = bottle.position.y;
  scene.add(bottle);
  stage.classList.add('ready');
  resize();
}, undefined, () => stage.classList.add('no3d'));

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// view buttons: animate the azimuth to a fixed angle
let tween = null;
function azimuth() { return Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z); }
function goTo(i) {
  controls.autoRotate = false;
  buttons.forEach((b, k) => b.setAttribute('aria-pressed', k === i));
  let from = azimuth(), to = VIEWS[i];
  let d = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  tween = { from, d, t: 0 };
}
buttons.forEach((b, i) => b.addEventListener('click', () => goTo(i)));
controls.addEventListener('start', () => { controls.autoRotate = false; tween = null; buttons.forEach((b) => b.setAttribute('aria-pressed', 'false')); });

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) controls.autoRotate = false;
let visible = true;
new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(stage);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (!visible) return;
  if (tween) {
    tween.t = Math.min(1, tween.t + dt * 1.8);
    const e = 1 - Math.pow(1 - tween.t, 3);
    const a = tween.from + tween.d * e;
    const r = Math.hypot(camera.position.x, camera.position.z);
    camera.position.x = Math.sin(a) * r; camera.position.z = Math.cos(a) * r;
    if (tween.t >= 1) tween = null;
  }
  if (bottle && !reduce) bottle.position.y = bottle.userData.y0 + Math.sin(clock.elapsedTime * 1.4) * 0.015;
  controls.update();
  renderer.render(scene, camera);
});
