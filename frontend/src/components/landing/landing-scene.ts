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

const FORMATION = [
  [50, 94], [12, 72], [32, 78], [68, 78], [88, 72], [24, 52],
  [50, 44], [76, 52], [16, 22], [50, 14], [84, 22],
] as const;

function addSegment(points: number[], x1: number, z1: number, x2: number, z2: number) {
  points.push(x1, 0.025, z1, x2, 0.025, z2);
}

function addRectangle(points: number[], x: number, z: number, width: number, depth: number) {
  addSegment(points, x, z, x + width, z);
  addSegment(points, x + width, z, x + width, z + depth);
  addSegment(points, x + width, z + depth, x, z + depth);
  addSegment(points, x, z + depth, x, z);
}

function createMarkings(material: THREE.LineBasicMaterial) {
  const points: number[] = [];
  addRectangle(points, -5.05, -3.2, 10.1, 6.4);
  addSegment(points, 0, -3.2, 0, 3.2);
  addRectangle(points, -5.05, -1.75, 1.65, 3.5);
  addRectangle(points, 3.4, -1.75, 1.65, 3.5);
  addRectangle(points, -5.05, -0.9, 0.58, 1.8);
  addRectangle(points, 4.47, -0.9, 0.58, 1.8);

  const circleSegments = 48;
  for (let index = 0; index < circleSegments; index += 1) {
    const a = (index / circleSegments) * Math.PI * 2;
    const b = ((index + 1) / circleSegments) * Math.PI * 2;
    addSegment(points, Math.cos(a) * 0.86, Math.sin(a) * 0.86, Math.cos(b) * 0.86, Math.sin(b) * 0.86);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, material);
}

function createBallTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#d8dedc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1b252b";
  for (const [x, y] of [[20, 18], [64, 32], [106, 17], [39, 53], [92, 52]]) {
    context.beginPath();
    for (let side = 0; side < 5; side += 1) {
      const angle = -Math.PI / 2 + (side * Math.PI * 2) / 5;
      const px = x + Math.cos(angle) * 7;
      const py = y + Math.sin(angle) * 7;
      if (side === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function route(points: THREE.Vector3[], material: THREE.MeshBasicMaterial) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.022, 5, false), material);
}

export function createLandingScene({ container, onReadyChange }: SceneOptions): LandingSceneController {
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);
  const isMobile = width < 768;
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: width >= 1024,
    powerPreference: "low-power",
  });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "landing-scene__canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.tabIndex = -1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 60);
  const cameraBase = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();

  const pitchMaterial = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const markingMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.42 });
  const markerMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const ballTexture = createBallTexture();
  const ballMaterial = new THREE.MeshStandardMaterial({ map: ballTexture, roughness: 0.95, metalness: 0 });
  const routeMaterials = [
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3 }),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2 }),
  ];

  const pitch = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.12, 6.8), pitchMaterial);
  pitch.position.y = -0.06;
  scene.add(pitch, createMarkings(markingMaterial));

  const markerGeometry = new THREE.CylinderGeometry(0.13, 0.15, 0.09, 14);
  const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, FORMATION.length);
  const markerMatrix = new THREE.Matrix4();
  FORMATION.forEach(([x, y], index) => {
    const px = (x / 100 - 0.5) * 9.6;
    const pz = (y / 100 - 0.5) * 5.9;
    markerMatrix.makeTranslation(px, 0.075, pz);
    markers.setMatrixAt(index, markerMatrix);
  });
  markers.count = isMobile ? 5 : width < 1024 ? 7 : 11;
  markers.instanceMatrix.needsUpdate = true;
  scene.add(markers);

  const routes = [
    route([
      new THREE.Vector3(-2.5, 0.055, 1.3),
      new THREE.Vector3(-0.4, 0.06, 0.25),
      new THREE.Vector3(0, 0.055, -2.1),
    ], routeMaterials[0]),
    route([
      new THREE.Vector3(2.5, 0.055, 1.3),
      new THREE.Vector3(1.5, 0.06, -0.3),
      new THREE.Vector3(3.25, 0.055, -1.65),
    ], routeMaterials[1]),
  ];
  routes[1].visible = width >= 1024;
  scene.add(...routes);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), ballMaterial);
  ball.position.set(-0.6, 0.17, 0.15);
  ball.visible = width >= 520;
  scene.add(ball);

  scene.add(new THREE.AmbientLight(0xffffff, 0.36));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.62);
  keyLight.position.set(-5, 10, 7);
  scene.add(keyLight);

  let active = true;
  let paused = false;
  let disposed = false;
  let animationFrame = 0;
  let previousFrame = 0;
  let elapsed = 0;
  let readySent = false;

  const updateCamera = () => {
    const currentWidth = Math.max(container.clientWidth, 1);
    if (currentWidth < 768) {
      cameraBase.set(7.8, 12.8, 14.5);
      cameraTarget.set(0, 0, 0.75);
      camera.fov = 39;
    } else if (currentWidth < 1280) {
      cameraBase.set(8.5, 10.8, 13.6);
      cameraTarget.set(0, 0, 0.35);
      camera.fov = 37;
    } else {
      cameraBase.set(9, 10, 13);
      cameraTarget.set(0, 0, 0.2);
      camera.fov = 35;
    }
    camera.position.copy(cameraBase);
    camera.lookAt(cameraTarget);
  };

  const applyTheme = () => {
    const styles = getComputedStyle(document.documentElement);
    const dark = document.documentElement.classList.contains("dark");
    pitchMaterial.color.set(styles.getPropertyValue(dark ? "--card" : "--background").trim());
    markerMaterial.color.set(styles.getPropertyValue("--brand").trim());
    markingMaterial.color.set(styles.getPropertyValue("--muted-foreground").trim());
    routeMaterials.forEach((material) => material.color.set(styles.getPropertyValue("--brand-light").trim()));
  };

  const render = () => {
    if (disposed) return;
    renderer.render(scene, camera);
    if (!readySent) {
      readySent = true;
      onReadyChange(true);
    }
  };

  const animate = (time: number) => {
    animationFrame = 0;
    if (disposed || paused || !active || container.clientWidth < 768) return;
    if (time - previousFrame < (container.clientWidth < 1024 ? 1000 / 24 : 1000 / 30)) {
      animationFrame = requestAnimationFrame(animate);
      return;
    }
    const delta = previousFrame ? Math.min(time - previousFrame, 100) : 0;
    previousFrame = time;
    elapsed += delta;
    const phase = elapsed / 1000;
    camera.position.set(
      cameraBase.x + Math.sin(phase * 0.12) * 0.12,
      cameraBase.y + Math.sin(phase * 0.09) * 0.05,
      cameraBase.z,
    );
    camera.lookAt(cameraTarget);
    routeMaterials[0].opacity = 0.25 + Math.sin(phase * 0.45) * 0.05;
    routeMaterials[1].opacity = 0.17 + Math.sin(phase * 0.38 + 1.2) * 0.04;
    ball.rotation.y = phase * 0.04;
    render();
    animationFrame = requestAnimationFrame(animate);
  };

  const stop = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previousFrame = 0;
  };

  const start = () => {
    stop();
    if (!disposed && active && !paused && container.clientWidth >= 768) {
      animationFrame = requestAnimationFrame(animate);
    }
  };

  const resize = () => {
    if (disposed) return;
    const nextWidth = Math.max(container.clientWidth, 1);
    const nextHeight = Math.max(container.clientHeight, 1);
    const cap = nextWidth >= 1280 ? 1.5 : nextWidth >= 1024 ? 1.25 : 1;
    const pixelBudget = nextWidth >= 1280 ? 2_000_000 : nextWidth >= 1024 ? 1_300_000 : 800_000;
    const budgetRatio = Math.sqrt(pixelBudget / (nextWidth * nextHeight));
    renderer.setPixelRatio(Math.max(0.75, Math.min(window.devicePixelRatio, cap, budgetRatio)));
    renderer.setSize(nextWidth, nextHeight, false);
    camera.aspect = nextWidth / nextHeight;
    updateCamera();
    camera.updateProjectionMatrix();
    markers.count = nextWidth < 768 ? 5 : nextWidth < 1024 ? 7 : 11;
    routes[1].visible = nextWidth >= 1024;
    ball.visible = nextWidth >= 520;
    render();
    start();
  };

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    stop();
    onReadyChange(false);
  };
  const handleContextRestored = () => {
    readySent = false;
    applyTheme();
    resize();
  };
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);

  applyTheme();
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
      if (paused) {
        stop();
        render();
      } else {
        start();
      }
    },
    updateTheme() {
      applyTheme();
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
        }
      });
      pitchMaterial.dispose();
      markingMaterial.dispose();
      markerMaterial.dispose();
      ballMaterial.dispose();
      routeMaterials.forEach((material) => material.dispose());
      ballTexture?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      onReadyChange(false);
    },
  };
}
