import * as THREE from "three";

export interface LandingSceneController {
  resize: () => void;
  setActive: (active: boolean) => void;
  setPaused: (paused: boolean) => void;
  updateTheme: () => void;
  dispose: () => void;
}

interface SceneOptions {
  container: HTMLElement;
  onReadyChange: (ready: boolean) => void;
}

function canvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the landing scene texture.");
  return context;
}

function createPitchTexture(lowPower: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = lowPower ? 512 : 1024;
  canvas.height = lowPower ? 768 : 1536;
  const context = canvasContext(canvas);
  const { width, height } = canvas;

  for (let stripe = 0; stripe < 12; stripe += 1) {
    context.fillStyle = stripe % 2 === 0 ? "#1d653b" : "#174f31";
    context.fillRect(0, (stripe * height) / 12, width, height / 12 + 1);
  }

  context.globalAlpha = 0.13;
  for (let index = 0; index < (lowPower ? 1800 : 5200); index += 1) {
    context.fillStyle = index % 3 === 0 ? "#86b96d" : "#092e20";
    const x = (Math.sin(index * 93.17) * 0.5 + 0.5) * width;
    const y = (Math.sin(index * 47.31 + 2) * 0.5 + 0.5) * height;
    context.fillRect(x, y, 1, lowPower ? 2 : 3);
  }
  context.globalAlpha = 1;

  const marginX = width * 0.035;
  const marginY = height * 0.026;
  context.strokeStyle = "rgba(245,250,245,.82)";
  context.lineWidth = Math.max(2, width * 0.004);
  context.strokeRect(marginX, marginY, width - marginX * 2, height - marginY * 2);
  context.beginPath();
  context.moveTo(marginX, height / 2);
  context.lineTo(width - marginX, height / 2);
  context.stroke();
  context.beginPath();
  context.arc(width / 2, height / 2, width * 0.135, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(width / 2, height / 2, width * 0.009, 0, Math.PI * 2);
  context.fillStyle = "rgba(245,250,245,.82)";
  context.fill();

  const boxWidth = width * 0.59;
  const boxDepth = height * 0.155;
  context.strokeRect((width - boxWidth) / 2, marginY, boxWidth, boxDepth);
  context.strokeRect((width - boxWidth) / 2, height - marginY - boxDepth, boxWidth, boxDepth);
  context.strokeRect(width * 0.36, marginY, width * 0.28, height * 0.06);
  context.strokeRect(width * 0.36, height - marginY - height * 0.06, width * 0.28, height * 0.06);

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.name = "Landing pitch";
  return texture;
}

function createBrandTexture(lowPower: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = lowPower ? 512 : 1024;
  canvas.height = 128;
  const context = canvasContext(canvas);
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "#061b14");
  gradient.addColorStop(0.5, "#0c3023");
  gradient.addColorStop(1, "#061b14");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#2ed58b";
  context.fillRect(0, 8, canvas.width, 4);
  context.fillRect(0, canvas.height - 12, canvas.width, 4);
  context.fillStyle = "#effff7";
  context.font = `800 ${canvas.height * 0.42}px Inter, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("GAFFER  •  MATCHDAY", canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.name = "Landing stadium branding";
  return texture;
}

function box(
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  castShadow = false,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

export function createLandingScene({ container, onReadyChange }: SceneOptions): LandingSceneController {
  const initialWidth = Math.max(container.clientWidth, 1);
  const initialHeight = Math.max(container.clientHeight, 1);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lowPower = initialWidth < 768;

  const renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: !lowPower,
    powerPreference: "high-performance",
  });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x07100d, 1);
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.domElement.className = "landing-scene__canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.tabIndex = -1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07100d);
  scene.fog = new THREE.Fog(0x0b1512, 24, lowPower ? 145 : 190);
  const camera = new THREE.PerspectiveCamera(lowPower ? 67 : 58, initialWidth / initialHeight, 0.08, 240);

  // One physical route: dressing room -> tunnel -> dugout -> touchline -> centre circle.
  const cameraPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-73, 1.72, 0),
    new THREE.Vector3(-66, 1.72, 0),
    new THREE.Vector3(-59, 1.72, 0),
    new THREE.Vector3(-49, 1.72, 0),
    new THREE.Vector3(-41.5, 1.72, 0.8),
    new THREE.Vector3(-38.5, 1.72, 6.2),
    new THREE.Vector3(-36.8, 1.72, 0.5),
    new THREE.Vector3(-27, 1.72, 0),
    new THREE.Vector3(-12, 1.72, 0),
    new THREE.Vector3(0, 1.72, 0),
  ], false, "centripetal");
  const lookPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-64, 1.68, 0),
    new THREE.Vector3(-57, 1.68, 0),
    new THREE.Vector3(-48, 1.7, 0),
    new THREE.Vector3(-40, 1.8, 1),
    new THREE.Vector3(-38, 1.75, 7),
    new THREE.Vector3(-36, 1.65, 1),
    new THREE.Vector3(-27, 1.6, 0),
    new THREE.Vector3(-13, 1.9, -0.5),
    new THREE.Vector3(1, 2.3, -3),
    new THREE.Vector3(18, 5.2, -24),
  ], false, "centripetal");

  const concrete = new THREE.MeshStandardMaterial({ color: 0x565d5a, roughness: 0.93 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x252d2b, roughness: 0.9 });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x777c78, roughness: 0.88 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x252c2b, roughness: 0.56, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x70482e, roughness: 0.78 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x12a66c, roughness: 0.78 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x08754d, roughness: 0.72 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xb9d8d0, roughness: 0.18, transparent: true, opacity: 0.27, side: THREE.DoubleSide });
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff4d5, emissive: 0xffd98a, emissiveIntensity: 1.4, roughness: 0.35 });

  scene.add(
    box([18, 0.3, 18], [-70, -0.15, 0], floorMaterial),
    box([18, 0.35, 18], [-70, 4.35, 0], darkConcrete),
    box([0.35, 4.5, 18], [-79, 2.1, 0], concrete),
    box([18, 4.5, 0.35], [-70, 2.1, -9], concrete),
    box([18, 4.5, 0.35], [-70, 2.1, 9], concrete),
    box([0.35, 4.5, 5.7], [-61, 2.1, -6.15], concrete),
    box([0.35, 4.5, 5.7], [-61, 2.1, 6.15], concrete),
  );

  const lockerGeometry = new THREE.BoxGeometry(1.65, 3.35, 0.75);
  const lockers = new THREE.InstancedMesh(lockerGeometry, metal, lowPower ? 8 : 14);
  const transform = new THREE.Object3D();
  let lockerIndex = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < (lowPower ? 4 : 7); index += 1) {
      transform.position.set(-77 + index * 2.35, 1.8, side * 8.35);
      transform.rotation.set(0, side < 0 ? 0 : Math.PI, 0);
      transform.updateMatrix();
      lockers.setMatrixAt(lockerIndex++, transform.matrix);
    }
  }
  lockers.castShadow = !lowPower;
  lockers.receiveShadow = true;
  scene.add(lockers);

  const benchGeometry = new THREE.BoxGeometry(11.5, 0.35, 1.25);
  for (const side of [-1, 1]) {
    const bench = new THREE.Mesh(benchGeometry, wood);
    bench.position.set(-70.5, 0.55, side * 6.7);
    bench.castShadow = !lowPower;
    scene.add(bench);
  }

  const shirts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.3, 0.08), shirt, lowPower ? 4 : 8);
  for (let index = 0; index < shirts.count; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const slot = Math.floor(index / 2);
    transform.position.set(-76 + slot * 3.1, 2.45, side * 7.91);
    transform.rotation.set(0, side < 0 ? 0 : Math.PI, 0);
    transform.updateMatrix();
    shirts.setMatrixAt(index, transform.matrix);
  }
  scene.add(shirts);

  scene.add(
    box([22, 0.25, 6.4], [-50, -0.1, 0], darkConcrete),
    box([22, 0.28, 6.4], [-50, 3.9, 0], darkConcrete),
    box([22, 4, 0.25], [-50, 1.9, -3.2], concrete),
    box([22, 4, 0.25], [-50, 1.9, 3.2], concrete),
  );
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.25, 6.5), metal, 7);
  const tunnelLights = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.08, 0.32), lightMaterial, 6);
  for (let index = 0; index < 7; index += 1) {
    transform.position.set(-60 + index * 3.2, 3.7, 0);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    beams.setMatrixAt(index, transform.matrix);
    if (index < 6) {
      transform.position.set(-58.5 + index * 3.2, 3.72, 0);
      transform.updateMatrix();
      tunnelLights.setMatrixAt(index, transform.matrix);
    }
  }
  scene.add(beams, tunnelLights);

  const pitchTexture = createPitchTexture(lowPower);
  pitchTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), lowPower ? 2 : 8);
  const pitchMaterial = new THREE.MeshStandardMaterial({ map: pitchTexture, roughness: 0.94, metalness: 0 });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(68, 105), pitchMaterial);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  const dugout = new THREE.Group();
  dugout.position.set(-39.2, 0, 12);
  dugout.add(
    box([2.8, 0.3, 15], [0, 0.15, 0], darkConcrete),
    box([0.3, 3.2, 15], [-1.25, 1.75, 0], glass),
    box([2.8, 0.32, 15], [0, 3.25, 0], metal),
    box([2.8, 3.2, 0.25], [0, 1.65, -7.4], glass),
    box([2.8, 3.2, 0.25], [0, 1.65, 7.4], glass),
  );
  const dugoutSeats = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.9, 1.05), seat, lowPower ? 6 : 10);
  for (let index = 0; index < dugoutSeats.count; index += 1) {
    transform.position.set(0.15, 0.85, -6.1 + index * (12.2 / Math.max(dugoutSeats.count - 1, 1)));
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    dugoutSeats.setMatrixAt(index, transform.matrix);
  }
  dugout.add(dugoutSeats);
  scene.add(dugout);

  const brandTexture = createBrandTexture(lowPower);
  const adMaterial = new THREE.MeshStandardMaterial({ map: brandTexture, roughness: 0.62, emissive: 0x062219, emissiveIntensity: 0.25 });
  const adGeometry = new THREE.BoxGeometry(5.8, 1.1, 0.35);
  const adTransforms: Array<[number, number, number, number]> = [];
  for (let z = -45; z <= 45; z += 6.3) {
    if (z < -5 || z > 22) adTransforms.push([-35.6, 0.65, z, Math.PI / 2]);
    adTransforms.push([35.6, 0.65, z, -Math.PI / 2]);
  }
  for (let x = -29; x <= 29; x += 6.3) {
    adTransforms.push([x, 0.65, -54.2, 0], [x, 0.65, 54.2, Math.PI]);
  }
  const ads = new THREE.InstancedMesh(adGeometry, adMaterial, adTransforms.length);
  adTransforms.forEach(([x, y, z, rotation], index) => {
    transform.position.set(x, y, z);
    transform.rotation.set(0, rotation, 0);
    transform.updateMatrix();
    ads.setMatrixAt(index, transform.matrix);
  });
  scene.add(ads);

  const standMaterial = new THREE.MeshStandardMaterial({ color: 0x17201e, roughness: 0.88 });
  const crowdMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x1b7553, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x34413e, roughness: 0.92 }),
  ];
  const tierCount = lowPower ? 5 : 8;
  for (let tier = 0; tier < tierCount; tier += 1) {
    const rise = tier * 1.45;
    const offset = tier * 1.45;
    scene.add(
      // Split the west stand around the tunnel and dugout so the route never
      // intersects seating geometry.
      box([4.2, 1.25, 50], [-39 - offset, 0.62 + rise, -33], tier % 2 ? crowdMaterials[0] : standMaterial),
      box([4.2, 1.25, 35], [-39 - offset, 0.62 + rise, 40.5], tier % 2 ? crowdMaterials[0] : standMaterial),
      box([4.2, 1.25, 116], [39 + offset, 0.62 + rise, 0], tier % 2 ? crowdMaterials[1] : standMaterial),
      box([77 + offset * 2, 1.25, 4.2], [0, 0.62 + rise, -59 - offset], tier % 2 ? crowdMaterials[0] : standMaterial),
      box([77 + offset * 2, 1.25, 4.2], [0, 0.62 + rise, 59 + offset], tier % 2 ? crowdMaterials[1] : standMaterial),
    );
  }

  const goalMaterial = new THREE.MeshStandardMaterial({ color: 0xe8efeb, roughness: 0.55, metalness: 0.25 });
  for (const end of [-1, 1]) {
    const goal = new THREE.Group();
    goal.position.set(0, 0, end * 52.4);
    goal.add(
      box([7.32, 0.12, 0.12], [0, 2.44, 0], goalMaterial),
      box([0.12, 2.44, 0.12], [-3.66, 1.22, 0], goalMaterial),
      box([0.12, 2.44, 0.12], [3.66, 1.22, 0], goalMaterial),
    );
    scene.add(goal);
  }

  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: { topColor: { value: new THREE.Color(0x07131c) }, bottomColor: { value: new THREE.Color(0x273a32) } },
    vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 p=modelMatrix*vec4(position,1.0); vWorldPosition=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vWorldPosition; void main(){ float h=clamp(normalize(vWorldPosition+vec3(0.,28.,0.)).y,0.,1.); gl_FragColor=vec4(mix(bottomColor,topColor,pow(h,.7)),1.); }`,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(210, lowPower ? 16 : 24, lowPower ? 10 : 16), skyMaterial));

  scene.add(new THREE.HemisphereLight(0xaecbc4, 0x17201b, 0.7));
  const sun = new THREE.DirectionalLight(0xd8e8df, 1.05);
  sun.position.set(-18, 56, 24);
  sun.castShadow = !lowPower;
  sun.shadow.mapSize.set(lowPower ? 512 : 1536, lowPower ? 512 : 1536);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0003;
  scene.add(sun, sun.target);
  const roomLight = new THREE.PointLight(0xffdfaa, 0.55, 24, 2);
  roomLight.position.set(-69, 3.4, 0);
  const exitLight = new THREE.PointLight(0xbfead8, 0.85, 25, 2);
  exitLight.position.set(-39, 3.5, 1);
  scene.add(roomLight, exitLight);

  const cameraPosition = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let targetProgress = 0;
  let currentProgress = 0;
  let active = true;
  let paused = false;
  let disposed = false;
  let readySent = false;
  let animationFrame = 0;

  const updateScrollTarget = () => {
    const scrollRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    targetProgress = THREE.MathUtils.clamp(window.scrollY / scrollRange, 0, 1);
    if (active && !paused) start();
  };

  const updateCamera = (progress: number) => {
    // getPointAt uses arc length, so page progress maps to consistent walking
    // speed even though the spline's control points are unevenly spaced.
    const pathProgress = progress;
    cameraPath.getPointAt(pathProgress, cameraPosition);
    lookPath.getPointAt(pathProgress, lookTarget);
    if (!reducedMotion) cameraPosition.y += Math.sin(progress * Math.PI * 34) * 0.018;
    camera.position.copy(cameraPosition);
    camera.lookAt(lookTarget);
  };

  const render = () => {
    if (disposed) return;
    renderer.render(scene, camera);
    if (!readySent) {
      readySent = true;
      onReadyChange(true);
    }
  };

  const stop = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  };

  const animate = () => {
    animationFrame = 0;
    if (disposed || paused || !active) return;
    const difference = targetProgress - currentProgress;
    currentProgress += difference * (reducedMotion ? 1 : lowPower ? 0.12 : 0.095);
    if (Math.abs(difference) < 0.00008) currentProgress = targetProgress;
    updateCamera(currentProgress);
    render();
    if (currentProgress !== targetProgress) animationFrame = requestAnimationFrame(animate);
  };

  function start() {
    if (!animationFrame && !disposed && active && !paused) animationFrame = requestAnimationFrame(animate);
  }

  const resize = () => {
    if (disposed) return;
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    lowPower = width < 768;
    const cap = lowPower ? 1.15 : width < 1280 ? 1.4 : 1.7;
    const pixelBudget = lowPower ? 900_000 : width < 1280 ? 1_500_000 : 2_400_000;
    const budgetRatio = Math.sqrt(pixelBudget / (width * height));
    renderer.setPixelRatio(Math.max(0.75, Math.min(window.devicePixelRatio || 1, cap, budgetRatio)));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = lowPower ? 67 : width < 1100 ? 62 : 58;
    camera.updateProjectionMatrix();
    updateCamera(currentProgress);
    render();
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    stop();
    onReadyChange(false);
  };
  const handleContextRestored = () => {
    readySent = false;
    resize();
  };
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);
  window.addEventListener("scroll", updateScrollTarget, { passive: true });

  updateScrollTarget();
  currentProgress = targetProgress;
  resize();

  return {
    resize,
    setActive(nextActive) {
      active = nextActive;
      if (active) start();
      else stop();
    },
    setPaused(nextPaused) {
      paused = nextPaused;
      if (paused) stop();
      else start();
    },
    updateTheme() {
      renderer.toneMappingExposure = document.documentElement.classList.contains("dark") ? 0.94 : 1.04;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      window.removeEventListener("scroll", updateScrollTarget);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh)) return;
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      pitchTexture.dispose();
      brandTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      onReadyChange(false);
    },
  };
}
