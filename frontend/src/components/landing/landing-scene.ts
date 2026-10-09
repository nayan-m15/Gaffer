import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createGafferStadium } from "./gaffer-stadium";
import { yieldSceneTask } from "./scene-scheduler";

export interface LandingSceneController {
  resize: () => void;
  setActive: (active: boolean) => void;
  setPaused: (paused: boolean) => void;
  updateTheme: () => void;
  dispose: () => void;
}
interface SceneOptions { container: HTMLElement; onReadyChange: (ready: boolean) => void; signal: AbortSignal }

const ROOM_EXIT = -61;
const TUNNEL_LENGTH = 16.5; // 25% shorter than the former 22-unit tunnel.
const TUNNEL_WIDTH = 12.8;
const TUNNEL_EXIT = ROOM_EXIT + TUNNEL_LENGTH;
const DARK_BACKGROUND = 0x07100d;
const DARK_SKY_TOP = 0x020508;
const DARK_SKY_BOTTOM = 0x111915;
const LIGHT_BACKGROUND = 0xd3e8f5;
const LIGHT_SKY_TOP = 0xa8cfe6;
const LIGHT_SKY_BOTTOM = 0xe3f0f6;

function context(canvas: HTMLCanvasElement) {
  const value = canvas.getContext("2d");
  if (!value) throw new Error("Unable to create landing scene texture");
  return value;
}

function pitchTexture(lowPower: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = lowPower ? 512 : 1024;
  canvas.height = lowPower ? 768 : 1536;
  const ctx = context(canvas);
  const stripeCount = 14;
  for (let i = 0; i < stripeCount; i += 1) {
    const stripeY = i * canvas.height / stripeCount;
    const stripeHeight = canvas.height / stripeCount + 1;
    const stripe = ctx.createLinearGradient(0, stripeY, canvas.width, stripeY + stripeHeight);
    if (i % 2) {
      stripe.addColorStop(0, "#1d4820");
      stripe.addColorStop(.5, "#265824");
      stripe.addColorStop(1, "#1e4a20");
    } else {
      stripe.addColorStop(0, "#306528");
      stripe.addColorStop(.5, "#3b7430");
      stripe.addColorStop(1, "#2f6227");
    }
    ctx.fillStyle = stripe;
    ctx.fillRect(0, stripeY, canvas.width, stripeHeight);
  }
  const overallTint = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  overallTint.addColorStop(0, "rgba(122,151,82,.025)");
  overallTint.addColorStop(.45, "rgba(24,54,23,.018)");
  overallTint.addColorStop(1, "rgba(96,137,75,.03)");
  ctx.fillStyle = overallTint;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = lowPower ? 0.11 : 0.13;
  for (let i = 0; i < (lowPower ? 2800 : 7600); i += 1) {
    const x = (Math.sin(i * 93.17) * .5 + .5) * canvas.width;
    const y = (Math.sin(i * 47.31 + 2) * .5 + .5) * canvas.height;
    ctx.fillStyle = i % 5 === 0 ? "#688f4d" : i % 3 ? "#173419" : "#326a2d";
    ctx.fillRect(x, y, 1, lowPower ? 2 : 3);
  }
  ctx.globalAlpha = lowPower ? .025 : .032;
  ctx.strokeStyle = "#9fbd7d";
  ctx.lineWidth = 1;
  for (let i = 0; i < (lowPower ? 260 : 620); i += 1) {
    const x = (Math.sin(i * 27.11 + .8) * .5 + .5) * canvas.width;
    const y = (Math.sin(i * 65.73 + 3.1) * .5 + .5) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (i % 2 ? 2.6 : -2.1), y + (i % 4 - 1.5) * .9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const mx = canvas.width * .008, my = canvas.height * .004;
  ctx.strokeStyle = "rgba(245,250,245,.82)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(2, canvas.width * .004);
  ctx.strokeRect(mx, my, canvas.width - mx * 2, canvas.height - my * 2);
  ctx.beginPath(); ctx.moveTo(mx, canvas.height / 2); ctx.lineTo(canvas.width - mx, canvas.height / 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(canvas.width / 2, canvas.height / 2, 9.15 * canvas.width / 68, 9.15 * canvas.height / 105, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(canvas.width / 2, canvas.height / 2, 2.4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  const bw = canvas.width * 40.32 / 68, bd = canvas.height * 16.5 / 105;
  ctx.strokeRect((canvas.width - bw) / 2, my, bw, bd);
  ctx.strokeRect((canvas.width - bw) / 2, canvas.height - my - bd, bw, bd);
  const sixWidth = canvas.width * 18.32 / 68, sixDepth = canvas.height * 5.5 / 105;
  ctx.strokeRect((canvas.width - sixWidth) / 2, my, sixWidth, sixDepth);
  ctx.strokeRect((canvas.width - sixWidth) / 2, canvas.height - my - sixDepth, sixWidth, sixDepth);
  const sx = canvas.width / 68, sy = canvas.height / 105;
  for (const y of [my + 11 * sy, canvas.height - my - 11 * sy]) {
    ctx.beginPath(); ctx.ellipse(canvas.width / 2, y, 2.4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(canvas.width / 2, my + 11 * sy, 9.15 * sx, 9.15 * sy, 0, Math.asin(5.5 / 9.15), Math.PI - Math.asin(5.5 / 9.15)); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(canvas.width / 2, canvas.height - my - 11 * sy, 9.15 * sx, 9.15 * sy, 0, Math.PI + Math.asin(5.5 / 9.15), 2 * Math.PI - Math.asin(5.5 / 9.15)); ctx.stroke();
  const radius = .915;
  for (const x of [mx, canvas.width - mx]) for (const y of [my, canvas.height - my]) {
    const start = y === my ? (x === mx ? 0 : .5 * Math.PI) : (x === mx ? 1.5 * Math.PI : Math.PI);
    ctx.beginPath(); ctx.ellipse(x, y, radius * sx, radius * sy, 0, start, start + .5 * Math.PI); ctx.stroke();
  }

  // Baked-in pitch wear adds match-day realism without extra geometry or draw calls.
  // Keep it restrained: goal mouths carry the most wear, with lighter traffic
  // around the centre spot and the tunnel-side touchline.
  const wearPatch = (x: number, y: number, rx: number, ry: number, strength: number) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    gradient.addColorStop(0, `rgba(166,151,92,${strength})`);
    gradient.addColorStop(.48, `rgba(116,119,67,${strength * .55})`);
    gradient.addColorStop(1, "rgba(78,102,57,0)");
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  wearPatch(canvas.width / 2, my + 2.7 * sy, 5.1 * sx, 3.4 * sy, .1);
  wearPatch(canvas.width / 2, canvas.height - my - 2.7 * sy, 5.1 * sx, 3.4 * sy, .1);
  wearPatch(canvas.width / 2, canvas.height / 2, 3.1 * sx, 3.1 * sy, .035);
  wearPatch(mx + 1.15 * sx, canvas.height / 2, 2.7 * sx, 5.8 * sy, .05);

  ctx.globalAlpha = lowPower ? .045 : .06;
  ctx.strokeStyle = "#c4bb80";
  ctx.lineWidth = 1;
  for (let i = 0; i < (lowPower ? 90 : 180); i += 1) {
    const x = (Math.sin(i * 61.73 + 1.2) * .5 + .5) * canvas.width;
    const y = (Math.sin(i * 37.19 + 2.8) * .5 + .5) * canvas.height;
    const length = 3 + (i % 7);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (i % 2 ? length : -length), y + (i % 3 - 1) * 1.5); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.name = "Landing pitch";
  return texture;
}

function footballTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 512;
  const ctx = context(canvas);
  ctx.fillStyle = "#f5f6f2"; ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawPatch = (x: number, y: number, radius: number, sides: number, rotation = -Math.PI / 2, fill = "#121514") => {
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + i * Math.PI * 2 / sides;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  const strokeRing = (x: number, y: number, radius: number, sides: number, rotation = -Math.PI / 2) => {
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + i * Math.PI * 2 / sides;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  };

  ctx.strokeStyle = "rgba(28,33,30,.42)";
  ctx.lineWidth = 3;

  const hexagons = [
    [512, 86, 54],
    [332, 170, 48], [512, 192, 50], [692, 170, 48],
    [246, 302, 44], [424, 332, 44], [600, 332, 44], [778, 302, 44],
    [512, 438, 52],
  ] as const;
  hexagons.forEach(([x, y, r]) => drawPatch(x, y, r, 6, Math.PI / 6));

  const seamLinks = [
    [[512, 86], [332, 170]], [[512, 86], [512, 192]], [[512, 86], [692, 170]],
    [[332, 170], [246, 302]], [[332, 170], [424, 332]],
    [[512, 192], [424, 332]], [[512, 192], [600, 332]],
    [[692, 170], [600, 332]], [[692, 170], [778, 302]],
    [[246, 302], [512, 438]], [[424, 332], [512, 438]], [[600, 332], [512, 438]], [[778, 302], [512, 438]],
  ] as const;
  seamLinks.forEach(([[x1, y1], [x2, y2]]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });

  ctx.strokeStyle = "rgba(75,83,78,.32)";
  ctx.lineWidth = 2;
  [
    [512, 86, 54], [332, 170, 48], [512, 192, 50], [692, 170, 48],
    [246, 302, 44], [424, 332, 44], [600, 332, 44], [778, 302, 44], [512, 438, 52],
  ].forEach(([x, y, r]) => strokeRing(x, y, r, 6, Math.PI / 6));

  const vignette = ctx.createRadialGradient(canvas.width * .5, canvas.height * .45, canvas.width * .1, canvas.width * .5, canvas.height * .45, canvas.width * .7);
  vignette.addColorStop(0, "rgba(255,255,255,.08)");
  vignette.addColorStop(1, "rgba(0,0,0,.1)");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.name = "Landing football";
  return texture;
}

function createClassicFootball(radius: number, lowPower: boolean) {
  const group = new THREE.Group();
  group.name = "Classic black-and-white football";

  const whiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f5f1,
    roughness: .8,
    metalness: 0,
  });
  const blackMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d0f0e,
    roughness: .76,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const seamMaterial = new THREE.MeshBasicMaterial({
    color: 0x565b58,
    transparent: true,
    opacity: .36,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, lowPower ? 20 : 32, lowPower ? 14 : 22),
    whiteMaterial,
  );
  sphere.castShadow = !lowPower;
  sphere.receiveShadow = true;
  group.add(sphere);

  // Use black hexagonal panels so the football reads more like the requested
  // classic stylised black-and-white ball from the landing-page camera angle.
  const phi = (1 + Math.sqrt(5)) / 2;
  const directions = [
    [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi],
    [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
    [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

  const patchGeometry = new THREE.CircleGeometry(radius * .304, 6);
  const seamGeometry = new THREE.RingGeometry(radius * .308, radius * .325, 6);
  const patches = new THREE.InstancedMesh(patchGeometry, blackMaterial, directions.length);
  const seams = new THREE.InstancedMesh(seamGeometry, seamMaterial, directions.length);
  const dummy = new THREE.Object3D();
  const outward = new THREE.Vector3(0, 0, 1);
  directions.forEach((direction, index) => {
    dummy.position.copy(direction).multiplyScalar(radius * 1.006);
    dummy.quaternion.setFromUnitVectors(outward, direction);
    dummy.rotation.z += index * .43;
    dummy.updateMatrix();
    patches.setMatrixAt(index, dummy.matrix);

    dummy.position.copy(direction).multiplyScalar(radius * 1.009);
    dummy.updateMatrix();
    seams.setMatrixAt(index, dummy.matrix);
  });
  patches.instanceMatrix.needsUpdate = true;
  seams.instanceMatrix.needsUpdate = true;
  group.add(patches, seams);

  return group;
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = context(canvas); draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function dressingFloorTexture(lowPower: boolean) {
  const size = lowPower ? 512 : 1024;
  const texture = canvasTexture(size, size, ctx => {
    const base = ctx.createLinearGradient(0, 0, size, size);
    base.addColorStop(0, "#8f918b");
    base.addColorStop(.52, "#a09d95");
    base.addColorStop(1, "#858a85");
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < (lowPower ? 650 : 1700); i += 1) {
      const x = (Math.sin(i * 73.91) * .5 + .5) * size;
      const y = (Math.sin(i * 39.17 + 2.4) * .5 + .5) * size;
      ctx.fillStyle = i % 3 ? "rgba(245,239,226,.035)" : "rgba(22,28,25,.03)";
      ctx.fillRect(x, y, i % 9 === 0 ? 12 : 2, i % 9 === 0 ? 1 : 2);
    }
    ctx.strokeStyle = "rgba(35,42,39,.2)"; ctx.lineWidth = Math.max(2, size / 300);
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * size / 4, 0); ctx.lineTo(i * size / 4, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * size / 4); ctx.lineTo(size, i * size / 4); ctx.stroke();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.15, 2.15);
  texture.name = "Gaffer dressing room resin floor";
  return texture;
}

function tunnelFloorTexture(lowPower: boolean) {
  const size = lowPower ? 512 : 1024;
  const texture = canvasTexture(size, size, ctx => {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#202725");
    gradient.addColorStop(.5, "#303735");
    gradient.addColorStop(1, "#1b2220");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Deterministic mottling and fine scuffs keep the surface from reading as
    // a flat glossy slab without requiring another downloaded texture.
    for (let i = 0; i < (lowPower ? 900 : 2200); i += 1) {
      const x = (Math.sin(i * 91.37) * .5 + .5) * size;
      const y = (Math.sin(i * 47.83 + 1.7) * .5 + .5) * size;
      const alpha = .018 + (i % 5) * .006;
      ctx.fillStyle = i % 3 ? `rgba(206,220,214,${alpha})` : `rgba(3,9,7,${alpha})`;
      ctx.fillRect(x, y, i % 7 === 0 ? 16 : 3, i % 7 === 0 ? 1 : 2);
    }
    ctx.strokeStyle = "rgba(7,14,12,.42)";
    ctx.lineWidth = Math.max(2, size / 260);
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * size / 4, 0); ctx.lineTo(i * size / 4, size); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(216,240,229,.035)";
    for (let i = 0; i < 9; i += 1) {
      const y = size * (.1 + i * .1);
      ctx.beginPath(); ctx.moveTo(size * .08, y); ctx.lineTo(size * .92, y + (i % 2 ? 3 : -3)); ctx.stroke();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.2, 2);
  texture.name = "Gaffer tunnel floor";
  return texture;
}

function tunnelSignTexture(title: string, strapline: string) {
  const texture = canvasTexture(1024, 192, ctx => {
    const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
    gradient.addColorStop(0, "#07110e");
    gradient.addColorStop(.5, "#10241d");
    gradient.addColorStop(1, "#07110e");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = "#00d99a"; ctx.fillRect(0, 0, 1024, 9); ctx.fillRect(0, 183, 1024, 9);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#f3fff9"; ctx.font = "900 78px Inter,Arial,sans-serif";
    ctx.fillText(title, 512, 77);
    ctx.fillStyle = "#75e8c2"; ctx.font = "700 25px Inter,Arial,sans-serif";
    ctx.fillText(strapline, 512, 142);
  });
  texture.name = `${title} tunnel fascia`;
  return texture;
}

function crestTexture() {
  return canvasTexture(512, 512, ctx => {
    ctx.clearRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(38,117,83,.72)"; ctx.lineWidth = 22;
    ctx.beginPath(); ctx.arc(256, 256, 205, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(13,28,23,.72)"; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(256, 256, 168, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(28,103,72,.7)";
    ctx.font = "900 250px Inter,Arial,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("G", 256, 272);
    ctx.fillStyle = "rgba(214,224,219,.5)"; ctx.font = "800 35px Inter,Arial,sans-serif";
    ctx.fillText("GAFFER", 256, 414);
  });
}

function numberTexture(number: number, fabric: THREE.Texture, lowPower: boolean) {
  // Bake the print into the fabric: one lit surface, no floating decal mesh.
  const size = lowPower ? 128 : 256;
  return canvasTexture(size, size, ctx => {
    ctx.drawImage(fabric.image, 0, 0, size, size);
    ctx.fillStyle = "#f1f4f1"; ctx.font = `900 ${Math.round(size * .36)}px Inter,Arial,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(number), size * .5, size * (1 - .5 / 1.32), size * .28);
  });
}

function shirtFabricTexture(lowPower: boolean) {
  const size = lowPower ? 256 : 512;
  const texture = canvasTexture(size, size, ctx => {
    const base = ctx.createLinearGradient(0, 0, 0, size);
    base.addColorStop(0, "#1d2524");
    base.addColorStop(.38, "#151c1b");
    base.addColorStop(.68, "#101614");
    base.addColorStop(1, "#0c1110");
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);

    const shoulderGlow = ctx.createLinearGradient(0, 0, size, 0);
    shoulderGlow.addColorStop(0, "rgba(0,190,135,0)");
    shoulderGlow.addColorStop(.18, "rgba(0,208,147,.35)");
    shoulderGlow.addColorStop(.5, "rgba(73,248,196,.12)");
    shoulderGlow.addColorStop(.82, "rgba(0,208,147,.35)");
    shoulderGlow.addColorStop(1, "rgba(0,190,135,0)");
    ctx.fillStyle = shoulderGlow; ctx.fillRect(0, 0, size, size * .19);

    ctx.fillStyle = "rgba(7,10,9,.34)";
    ctx.fillRect(0, size * .12, size * .15, size * .88);
    ctx.fillRect(size * .85, size * .12, size * .15, size * .88);

    ctx.strokeStyle = "rgba(102,255,212,.62)";
    ctx.lineWidth = Math.max(4, size * .012);
    for (const offset of [size * .18, size * .82]) {
      ctx.beginPath();
      ctx.moveTo(offset, size * .03);
      ctx.lineTo(offset - size * .065, size * .22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(offset + (offset < size / 2 ? 1 : -1) * size * .028, size * .055);
      ctx.lineTo(offset + (offset < size / 2 ? -1 : 1) * size * .038, size * .22);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(225,238,232,.12)";
    ctx.lineWidth = Math.max(1, size * .005);
    ctx.beginPath();
    ctx.moveTo(size * .5, size * .2);
    ctx.lineTo(size * .5, size * .92);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * .2, size * .28);
    ctx.quadraticCurveTo(size * .5, size * .38, size * .8, size * .28);
    ctx.stroke();

    const chest = ctx.createRadialGradient(size * .5, size * .36, 0, size * .5, size * .42, size * .3);
    chest.addColorStop(0, "rgba(255,255,255,.14)");
    chest.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = chest;
    ctx.beginPath(); ctx.ellipse(size * .5, size * .45, size * .28, size * .18, 0, 0, Math.PI * 2); ctx.fill();

    ctx.globalAlpha = .18;
    for (let i = 0; i < (lowPower ? 900 : 2600); i += 1) {
      const x = (Math.sin(i * 37.11 + .8) * .5 + .5) * size;
      const y = (Math.sin(i * 51.73 + 2.1) * .5 + .5) * size;
      ctx.fillStyle = i % 2 ? "#f6fffd" : "#091110";
      ctx.fillRect(x, y, 1, i % 4 ? 2 : 3);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,.06)";
    ctx.fillRect(size * .34, size * .24, size * .32, size * .04);
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.fillRect(size * .24, size * .9, size * .52, size * .035);

    // Sleeve-edge trim is painted on the same UVs as the curved fabric.
    ctx.strokeStyle = "#00d99a";
    ctx.lineWidth = size * .025;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo((side * .755 + .76) / 1.52 * size, (1 - (.33 + .62) / 1.32) * size);
      ctx.quadraticCurveTo((side * .735 + .76) / 1.52 * size, (1 - (.16 + .62) / 1.32) * size,
        (side * .62 + .76) / 1.52 * size, (1 - (.055 + .62) / 1.32) * size);
      ctx.stroke();
    }
  });
  texture.name = "Landing shirt fabric";
  return texture;
}

function box(size: [number, number, number], position: [number, number, number], material: THREE.Material, cast = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position); mesh.castShadow = cast; mesh.receiveShadow = true;
  return mesh;
}

function instancedBoxes(
  entries: Array<{ size: [number, number, number]; position: [number, number, number] }>,
  material: THREE.Material,
  cast = false,
) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(...entry.position);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(...entry.size);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function roundedBox(size: [number, number, number], position: [number, number, number], material: THREE.Material, radius = .06, cast = false) {
  const [width, height, depth] = size;
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new THREE.Shape();
  const left = -width / 2, right = width / 2, bottom = -height / 2, top = height / 2;
  shape.moveTo(left + r, bottom);
  shape.lineTo(right - r, bottom); shape.quadraticCurveTo(right, bottom, right, bottom + r);
  shape.lineTo(right, top - r); shape.quadraticCurveTo(right, top, right - r, top);
  shape.lineTo(left + r, top); shape.quadraticCurveTo(left, top, left, top - r);
  shape.lineTo(left, bottom + r); shape.quadraticCurveTo(left, bottom, left + r, bottom);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: Math.min(r * .42, depth * .18), bevelThickness: Math.min(r * .42, depth * .18), curveSegments: 2 });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.castShadow = cast; mesh.receiveShadow = true;
  return mesh;
}

function surfaceDetailTexture(lowPower: boolean, name: string, repeatX: number, repeatY: number) {
  const size = lowPower ? 128 : 256;
  const texture = canvasTexture(size, size, ctx => {
    ctx.fillStyle = "#888888"; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < (lowPower ? 650 : 1800); i += 1) {
      const x = (Math.sin(i * 73.11 + 1.4) * .5 + .5) * size;
      const y = (Math.sin(i * 41.73 + 3.7) * .5 + .5) * size;
      const shade = 105 + (i * 37) % 70;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${i % 9 === 0 ? .2 : .09})`;
      ctx.fillRect(x, y, i % 11 === 0 ? 8 : 2, i % 7 === 0 ? 1 : 2);
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.name = name;
  return texture;
}

interface DressingRoomKit {
  metal: THREE.Material; wood: THREE.Material; woodDark: THREE.Material; cushion: THREE.Material;
  warmLight: THREE.Material; greenLight: THREE.Material; green: THREE.Material; white: THREE.Material;
  boot: THREE.Material; towel: THREE.Material; bottle: THREE.Material; shirt: THREE.MeshPhysicalMaterial;
  shirtGeometry: THREE.BufferGeometry;
  shirtCollarGeometry: THREE.BufferGeometry;
}

const LOCKER_CONFIG = { count: 7, startX: -77.8, endX: -63.1, width: 1.82, depth: 1.12, height: 3.62 };
export const DRESSING_ROOM_SHIRT_NUMBERS = [1, 4, 5, 8, 10, 11, 9, 2, 3, 6, 7, 14, 17, 21] as const;

function shirtSurface(x: number, y: number, side: number) {
  const height = THREE.MathUtils.clamp((y + .62) / 1.32, 0, 1);
  const torso = Math.max(0, 1 - (x / .44) ** 2);
  const roundness = .065 * torso * Math.sin(Math.PI * height);
  const folds = .014 * Math.sin(x * 34 + .9) * torso * (1 - height) ** 1.3;
  const sag = .025 * torso * Math.sin(Math.PI * height);
  return new THREE.Vector3(x, y - sag, side * (.022 + roundness + folds));
}

function shirtNeckline() {
  return new THREE.CubicBezierCurve(
    new THREE.Vector2(-.18, .66), new THREE.Vector2(-.11, .49),
    new THREE.Vector2(.11, .49), new THREE.Vector2(.18, .66),
  );
}

function shirtGeometry(lowPower: boolean) {
  // Both boundaries are monotonic in X, so each strip fills the silhouette
  // with real interior vertices rather than triangulating only its outline.
  const upper = [
    new THREE.QuadraticBezierCurve(new THREE.Vector2(-.76, .35), new THREE.Vector2(-.69, .53), new THREE.Vector2(-.49, .60)),
    new THREE.QuadraticBezierCurve(new THREE.Vector2(-.49, .60), new THREE.Vector2(-.34, .69), new THREE.Vector2(-.18, .66)),
    shirtNeckline(),
    new THREE.QuadraticBezierCurve(new THREE.Vector2(.18, .66), new THREE.Vector2(.34, .69), new THREE.Vector2(.49, .60)),
    new THREE.QuadraticBezierCurve(new THREE.Vector2(.49, .60), new THREE.Vector2(.69, .53), new THREE.Vector2(.76, .35)),
  ];
  const lower = [
    new THREE.QuadraticBezierCurve(new THREE.Vector2(-.76, .26), new THREE.Vector2(-.735, .16), new THREE.Vector2(-.62, .055)),
    new THREE.QuadraticBezierCurve(new THREE.Vector2(-.62, .055), new THREE.Vector2(-.47, .10), new THREE.Vector2(-.41, .18)),
    new THREE.CubicBezierCurve(new THREE.Vector2(-.41, .18), new THREE.Vector2(-.395, .02), new THREE.Vector2(-.385, -.45), new THREE.Vector2(-.365, -.55)),
    new THREE.CubicBezierCurve(new THREE.Vector2(-.365, -.55), new THREE.Vector2(-.18, -.62), new THREE.Vector2(.18, -.62), new THREE.Vector2(.365, -.55)),
    new THREE.CubicBezierCurve(new THREE.Vector2(.365, -.55), new THREE.Vector2(.385, -.45), new THREE.Vector2(.395, .02), new THREE.Vector2(.41, .18)),
    new THREE.QuadraticBezierCurve(new THREE.Vector2(.41, .18), new THREE.Vector2(.47, .10), new THREE.Vector2(.62, .055)),
    new THREE.QuadraticBezierCurve(new THREE.Vector2(.62, .055), new THREE.Vector2(.735, .16), new THREE.Vector2(.76, .26)),
  ];
  const boundaryY = (curves: Array<THREE.QuadraticBezierCurve | THREE.CubicBezierCurve>, x: number) => {
    const curve = curves.find(value => x <= (value instanceof THREE.CubicBezierCurve ? value.v3.x : value.v2.x)) ?? curves[curves.length - 1];
    let start = 0, end = 1;
    for (let i = 0; i < 16; i += 1) {
      const middle = (start + end) / 2;
      if (curve.getPoint(middle).x < x) start = middle; else end = middle;
    }
    return curve.getPoint((start + end) / 2).y;
  };
  const columns = lowPower ? 24 : 40, rows = lowPower ? 16 : 28;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const addVertex = (x: number, y: number, side: number) => {
    const point = shirtSurface(x, y, side);
    positions.push(point.x, point.y, point.z);
    uvs.push((x + .76) / 1.52, (y + .62) / 1.32);
  };
  const faceSize = (columns + 1) * (rows + 1);
  const bounds = Array.from({ length: columns + 1 }, (_, column) => {
    const x = -.76 + column / columns * 1.52;
    return { x, bottom: boundaryY(lower, x), top: boundaryY(upper, x) };
  });
  for (const side of [1, -1]) {
    const offset = side === 1 ? 0 : faceSize;
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const { x, bottom, top } = bounds[column];
        addVertex(x, THREE.MathUtils.lerp(bottom, top, row / rows), side);
        if (row < rows && column < columns) {
          const a = offset + row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
          if (side === 1) indices.push(a, b, c, b, d, c); else indices.push(a, c, b, b, c, d);
        }
      }
    }
  }
  // Duplicate only the perimeter for the thin edge's own normals.
  const perimeter: number[] = [];
  for (let column = 0; column <= columns; column += 1) perimeter.push(column);
  for (let row = 1; row <= rows; row += 1) perimeter.push(row * (columns + 1) + columns);
  for (let column = columns - 1; column >= 0; column -= 1) perimeter.push(rows * (columns + 1) + column);
  for (let row = rows - 1; row > 0; row -= 1) perimeter.push(row * (columns + 1));
  const rimStart = positions.length / 3;
  for (const vertex of perimeter) for (const offset of [0, faceSize]) {
    const index = vertex + offset;
    positions.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
    uvs.push(uvs[index * 2], uvs[index * 2 + 1]);
  }
  perimeter.forEach((_, index) => {
    const a = rimStart + index * 2, b = rimStart + ((index + 1) % perimeter.length) * 2;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // Print only the front; the back and edge retain the shared plain fabric.
  const frontIndices = columns * rows * 6;
  geometry.addGroup(0, frontIndices, 0);
  geometry.addGroup(frontIndices, indices.length - frontIndices, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = "Proportioned Gaffer shirt";
  return geometry;
}

function shirtCollarGeometry(lowPower: boolean) {
  const neckline = shirtNeckline();
  const points = neckline.getPoints(lowPower ? 12 : 20).map(point => {
    const surface = shirtSurface(point.x, point.y, 1);
    surface.z += .006;
    return surface;
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), lowPower ? 12 : 20, .014, 6, false);
}

function createShirt(kit: DressingRoomKit, numberMap: THREE.Texture, index: number) {
  const group = new THREE.Group();
  group.name = "Dressing room shirt";
  group.userData.shirtNumber = DRESSING_ROOM_SHIRT_NUMBERS[index];
  const material = kit.shirt.clone();
  material.map = numberMap;
  const body = new THREE.Mesh(kit.shirtGeometry, [material, kit.shirt]);
  body.position.z = .012; body.castShadow = true; body.receiveShadow = true;
  const collar = new THREE.Mesh(kit.shirtCollarGeometry, kit.green);
  collar.position.z = .012;
  group.rotation.x = Math.sin((index + 1) * 1.31) * .025;
  group.rotation.z = Math.sin((index + 1) * 2.17) * .028;
  const hanger = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-.43, .55, -.03), new THREE.Vector3(0, .77, -.03), new THREE.Vector3(.43, .55, -.03),
    ]),
    new THREE.LineBasicMaterial({ color: 0xbac2be }),
  );
  const hook = new THREE.Mesh(new THREE.TorusGeometry(.07, .012, 5, 12, Math.PI * 1.45), kit.metal); hook.position.set(0,.83,-.016); hook.rotation.z = -.75;
  group.add(body, collar, hanger, hook);
  return group;
}

function createLockerRow(side: number, lowPower: boolean, kit: DressingRoomKit, numberMaps: THREE.Texture[]) {
  const group = new THREE.Group();
  const count = lowPower ? 6 : LOCKER_CONFIG.count;
  const spacing = (LOCKER_CONFIG.endX - LOCKER_CONFIG.startX) / (count - 1);
  const z = side * 8.18, frontZ = side * 7.54;

  // The locker row used to create well over a hundred individual box meshes.
  // Batch the repeated rectangular pieces by material instead so the appearance
  // stays the same but the row costs only a handful of draw calls.
  const metalEntries: Array<{ size: [number, number, number]; position: [number, number, number] }> = [
    { size: [16.9, .22, 1.68], position: [-70.3, 4.02, side * 8.15] },
  ];
  const woodEntries: Array<{ size: [number, number, number]; position: [number, number, number] }> = [];
  const woodDarkEntries: Array<{ size: [number, number, number]; position: [number, number, number] }> = [];
  const greenLightEntries: Array<{ size: [number, number, number]; position: [number, number, number] }> = [
    { size: [16.75, .08, .12], position: [-70.3, 3.89, side * 7.35] },
  ];
  const warmLightEntries: Array<{ size: [number, number, number]; position: [number, number, number] }> = [
    { size: [15.7, .055, .1], position: [-70.45, .78, side * 7.5] },
  ];

  for (let i = 0; i < count; i += 1) {
    const x = LOCKER_CONFIG.startX + i * spacing;
    woodEntries.push({ size: [LOCKER_CONFIG.width, 2.45, .12], position: [x, 2.55, side * 8.68] });
    woodDarkEntries.push(
      { size: [LOCKER_CONFIG.width - .18, 1.58, .045], position: [x, 2.55, side * 8.6] },
      { size: [LOCKER_CONFIG.width, .58, LOCKER_CONFIG.depth], position: [x, 3.72, z] },
      { size: [LOCKER_CONFIG.width - .12, .12, 1.18], position: [x, .91, side * 7.96] },
      { size: [LOCKER_CONFIG.width - .13, .08, .98], position: [x, .2, side * 8.08] },
    );
    metalEntries.push(
      { size: [.12, LOCKER_CONFIG.height, LOCKER_CONFIG.depth], position: [x - LOCKER_CONFIG.width / 2, 2.05, z] },
      { size: [.12, LOCKER_CONFIG.height, LOCKER_CONFIG.depth], position: [x + LOCKER_CONFIG.width / 2, 2.05, z] },
      { size: [LOCKER_CONFIG.width - .22, .055, .055], position: [x, 3.08, frontZ] },
      { size: [LOCKER_CONFIG.width - .15, .62, .05], position: [x, .5, side * 8.58] },
    );
    warmLightEntries.push({ size: [LOCKER_CONFIG.width - .2, .055, .08], position: [x, 3.4, frontZ] });

    // Cushions, shirts, handles and loose kit keep their existing geometry because
    // they provide the close-up detail the user actually notices.
    group.add(roundedBox([LOCKER_CONFIG.width - .16, .18, 1.2], [x, 1.08, side * 7.92], kit.cushion, .055));
    const handle = roundedBox([.055, .3, .055], [x + side * .42, 2.43, frontZ - side * .045], kit.metal, .018);
    handle.rotation.x = side > 0 ? Math.PI : 0;
    group.add(handle);
    const shirt = createShirt(kit, numberMaps[i], i + (side > 0 ? LOCKER_CONFIG.count : 0));
    shirt.position.set(x, 2.5, side * 7.47); if (side > 0) shirt.rotation.y = Math.PI; group.add(shirt);
    if ((i + (side > 0 ? 1 : 0)) % 3 === 0) {
      const boot = box([.47, .16, .18], [x - .17, .36, side * 7.72], kit.boot); boot.rotation.y = side * .18; group.add(boot);
      const boot2 = boot.clone(); boot2.position.x += .36; boot2.rotation.y *= -1; group.add(boot2);
    } else if (i % 3 === 1) {
      group.add(box([.62, .15, .42], [x, .35, side * 7.83], kit.towel));
    }
  }

  group.add(
    instancedBoxes(metalEntries, kit.metal, !lowPower),
    instancedBoxes(woodEntries, kit.wood, !lowPower),
    instancedBoxes(woodDarkEntries, kit.woodDark, false),
    instancedBoxes(greenLightEntries, kit.greenLight, false),
    instancedBoxes(warmLightEntries, kit.warmLight, false),
  );
  return group;
}

function createCentralIsland(kit: DressingRoomKit) {
  const group = new THREE.Group();
  group.name = "Split central team-talk island";
  for (const side of [-1, 1]) {
    group.add(
      roundedBox([3.45, .44, 1.04], [-65.9, .29, side * 1.34], kit.woodDark, .07, true),
      roundedBox([3.3, .18, .95], [-65.9, .61, side * 1.34], kit.cushion, .055, true),
      box([3.05, .05, .055], [-65.9, .46, side * 1.835], kit.greenLight),
      box([.14, .56, .92], [-67.48, .3, side * 1.34], kit.metal),
      box([.14, .56, .92], [-64.32, .3, side * 1.34], kit.metal),
    );

    // Subtle premium detailing: cushion seams, lower trim, and four small feet.
    group.add(
      box([2.86, .028, .028], [-65.9, .662, side * 1.03], kit.warmLight),
      box([2.86, .028, .028], [-65.9, .662, side * 1.65], kit.warmLight),
      box([.028, .028, .62], [-66.92, .662, side * 1.34], kit.warmLight),
      box([.028, .028, .62], [-64.88, .662, side * 1.34], kit.warmLight),
      box([2.88, .045, .72], [-65.9, .13, side * 1.34], kit.wood),
      box([.18, .11, .18], [-67.18, .06, side * .98], kit.metal),
      box([.18, .11, .18], [-64.62, .06, side * .98], kit.metal),
      box([.18, .11, .18], [-67.18, .06, side * 1.7], kit.metal),
      box([.18, .11, .18], [-64.62, .06, side * 1.7], kit.metal),
    );
  }
  // Keep the island props simple and clearly readable from the landing-page camera:
  // two neat folded towel stacks rather than flat clipboard/notebook shapes.
  const leftTowelBottom = roundedBox([.7, .055, .4], [-65.42, .735, -1.34], kit.towel, .022);
  leftTowelBottom.rotation.y = -.08;
  const leftTowelMid = roundedBox([.58, .04, .31], [-65.39, .776, -1.32], kit.white, .02);
  leftTowelMid.rotation.y = -.05;
  const leftTowelTop = roundedBox([.42, .028, .2], [-65.36, .807, -1.305], kit.warmLight, .018);
  leftTowelTop.rotation.y = -.02;

  const rightTowelBottom = roundedBox([.74, .05, .44], [-65.78, .73, 1.33], kit.white, .02);
  rightTowelBottom.rotation.y = .12;
  const rightTowelMid = roundedBox([.6, .038, .32], [-65.74, .768, 1.315], kit.warmLight, .018);
  rightTowelMid.rotation.y = .09;
  const rightTowelTop = roundedBox([.4, .026, .21], [-65.71, .797, 1.3], kit.towel, .016);
  rightTowelTop.rotation.y = .06;

  group.add(leftTowelBottom, leftTowelMid, leftTowelTop, rightTowelBottom, rightTowelMid, rightTowelTop);
  return group;
}

function createEquipmentArea(lowPower: boolean, kit: DressingRoomKit) {
  const group = new THREE.Group();
  const rails = [-.72, .72];
  rails.forEach(z => group.add(box([1.55, .08, .08], [-62.45, .2, 4.9 + z], kit.metal), box([1.55, .08, .08], [-62.45, 1.24, 4.9 + z], kit.metal)));
  group.add(box([.08, 1.25, 1.55], [-63.15, .66, 4.9], kit.metal), box([.08, 1.25, 1.55], [-61.75, .66, 4.9], kit.metal));
  for (let i = 0; i < (lowPower ? 4 : 6); i += 1) {
    const ball = createClassicFootball(.25, lowPower);
    ball.position.set(-62.8 + (i % 2) * .68, .36 + Math.floor(i / 2) * .42, 4.9);
    ball.rotation.set(i * .21, i * .47, i * .13);
    group.add(ball);
  }
  const metalCrate = box([1.28, .72, 1.12], [-64.45, .36, 6.6], kit.metal);
  const woodCrate = box([1.08, .52, .9], [-65.65, .26, 6.72], kit.woodDark);
  group.add(metalCrate, woodCrate);
  for (const x of [-64.9, -64]) for (const y of [.08, .64]) group.add(box([.09, .09, 1.16], [x, y, 6.6], kit.white));
  // Detail the storage boxes so they read more like real room equipment cases.
  group.add(
    box([1.14, .035, 1.02], [-64.45, .735, 6.6], kit.white),
    box([1.16, .03, .05], [-64.45, .51, 6.06], kit.white),
    box([1.16, .03, .05], [-64.45, .22, 6.06], kit.white),
    roundedBox([.24, .04, .05], [-64.45, .365, 6.02], kit.metal, .012),
    box([.12, .08, .12], [-64.85, .04, 6.18], kit.metal),
    box([.12, .08, .12], [-64.05, .04, 6.18], kit.metal),
    box([.12, .08, .12], [-64.85, .04, 7.02], kit.metal),
    box([.12, .08, .12], [-64.05, .04, 7.02], kit.metal),
    box([.98, .028, .05], [-65.65, .535, 6.28], kit.wood),
    box([.98, .028, .05], [-65.65, .355, 6.28], kit.wood),
    box([.98, .028, .05], [-65.65, .175, 6.28], kit.wood),
    roundedBox([.18, .035, .05], [-65.65, .355, 6.23], kit.metal, .01),
    box([.12, .09, .12], [-66.02, .045, 6.38], kit.metal),
    box([.12, .09, .12], [-65.28, .045, 6.38], kit.metal),
    box([.12, .09, .12], [-66.02, .045, 7.06], kit.metal),
    box([.12, .09, .12], [-65.28, .045, 7.06], kit.metal)
  );
  return group;
}


function smooth(edge0: number, edge1: number, value: number) { const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }

function footballGoal(end: number, frame: THREE.Material, net: THREE.Material) {
  const group = new THREE.Group(), depth = end * 2.15, width = 7.32, height = 2.44;
  group.position.set(0, 0, end * 52.4);
  group.add(
    box([width, .12, .12], [0, height, 0], frame),
    box([.12, height, .12], [-width / 2, height / 2, 0], frame),
    box([.12, height, .12], [width / 2, height / 2, 0], frame),
    box([width, .09, .09], [0, .05, depth], frame),
    box([.09, .09, Math.abs(depth)], [-width / 2, .05, depth / 2], frame),
    box([.09, .09, Math.abs(depth)], [width / 2, .05, depth / 2], frame),
  );
  const points: number[] = [];
  const segment = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => points.push(ax, ay, az, bx, by, bz);
  // Back grid, roof grid and both side grids form one inexpensive line mesh.
  for (let x = -width / 2; x <= width / 2 + .01; x += .46) segment(x, 0, depth, x, height, depth);
  for (let y = 0; y <= height + .01; y += .35) segment(-width / 2, y, depth, width / 2, y, depth);
  for (let x = -width / 2; x <= width / 2 + .01; x += .46) segment(x, height, 0, x, height, depth);
  for (let z = 0; Math.abs(z) <= Math.abs(depth) + .01; z += end * .36) segment(-width / 2, height, z, width / 2, height, z);
  for (const side of [-1, 1]) {
    for (let y = 0; y <= height + .01; y += .35) segment(side * width / 2, y, 0, side * width / 2, y, depth);
    for (let z = 0; Math.abs(z) <= Math.abs(depth) + .01; z += end * .36) segment(side * width / 2, 0, z, side * width / 2, height, z);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(geometry, net));
  return group;
}

function buildPremiumTunnel(scene: THREE.Scene, lowPower: boolean) {
  const tunnel = new THREE.Group();
  tunnel.name = "Gaffer player tunnel";
  const centre = ROOM_EXIT + TUNNEL_LENGTH / 2;
  const bayCount = 6;
  const entranceHalfWidth = 5.15;
  const exitHalfWidth = 6.02;
  const halfWidthChange = exitHalfWidth - entranceHalfWidth;
  const runLength = Math.hypot(TUNNEL_LENGTH, halfWidthChange);
  const wallAngle = Math.atan2(halfWidthChange, TUNNEL_LENGTH);

  const floorMap = tunnelFloorTexture(lowPower);
  const surfaceDetailMap = surfaceDetailTexture(lowPower, "Gaffer tunnel micro surface", 7, 4);
  const entranceSignMap = tunnelSignTexture("GAFFER", "PREPARE. PERFORM. IMPROVE.");
  const exitSignMap = tunnelSignTexture("GAFFER", "OWN THE TOUCHLINE");
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x59615e,
    map: floorMap,
    roughness: .57,
    metalness: .06,
    clearcoat: .18,
    clearcoatRoughness: .72,
    bumpMap: surfaceDetailMap,
    bumpScale: .028,
    roughnessMap: surfaceDetailMap,
  });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x080e0c, roughness: .84, metalness: .1 });
  const structuralMetal = new THREE.MeshStandardMaterial({ color: 0x202a27, roughness: .48, metalness: .52 });
  const tunnelLight = new THREE.MeshStandardMaterial({ color: 0xeafff7, emissive: 0xbfffe8, emissiveIntensity: 1.42, roughness: .38 });
  const brandLight = new THREE.MeshStandardMaterial({ color: 0x00d99a, emissive: 0x00a875, emissiveIntensity: 1.25, roughness: .4 });
  const hiddenEndCap = new THREE.MeshBasicMaterial({ visible: false });
  const openEndedBox = (size: [number, number, number], position: [number, number, number], material: THREE.Material, cast = false) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      [hiddenEndCap, hiddenEndCap, material, material, material, material],
    );
    mesh.position.set(...position);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    return mesh;
  };

  // The slab spans the same two anchor planes as the former tunnel. The dark
  // resin finish picks up the bright stadium portal without becoming a mirror.
  tunnel.add(box([TUNNEL_LENGTH, .2, TUNNEL_WIDTH], [centre, -.07, 0], floorMaterial));
  tunnel.add(box([TUNNEL_LENGTH, .23, 9.05], [centre, 4.11, 0], graphite, !lowPower));

  for (const side of [-1, 1]) {
    const rotationY = -side * wallAngle;
    // Canted shoulder panels create the reference-inspired, framed silhouette:
    // they retain the tunnel form while the lower sightline stays fully open.
    const shoulder = openEndedBox([runLength, 2.12, .25], [centre, 3.27, side * 5.1], graphite, !lowPower);
    shoulder.rotation.set(-side * .65, rotationY, 0);
    tunnel.add(shoulder);

    const guideLight = box([runLength - .75, .075, .13], [centre + .05, 3.6, side * 4.43], tunnelLight);
    guideLight.rotation.y = -side * Math.atan2(.3, TUNNEL_LENGTH);
    tunnel.add(guideLight);
  }

  // The upper rib system keeps the architectural rhythm without placing
  // opaque wall blocks in the dressing-room sightline.
  const ribShoulders = new THREE.InstancedMesh(new THREE.BoxGeometry(.2, 2.18, .31), structuralMetal, (bayCount + 1) * 2);
  const ribCeiling = new THREE.InstancedMesh(new THREE.BoxGeometry(.22, .22, 8.9), structuralMetal, bayCount + 1);
  const dummy = new THREE.Object3D();
  for (let rib = 0; rib <= bayCount; rib += 1) {
    const x = ROOM_EXIT + rib * TUNNEL_LENGTH / bayCount;
    for (const side of [-1, 1]) {
      const index = rib * 2 + (side > 0 ? 1 : 0);
      dummy.position.set(x, 3.28, side * 5.1);
      dummy.rotation.set(-side * .65, 0, 0); dummy.updateMatrix(); ribShoulders.setMatrixAt(index, dummy.matrix);
    }
    dummy.position.set(x, 3.98, 0); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); ribCeiling.setMatrixAt(rib, dummy.matrix);
  }
  ribShoulders.instanceMatrix.needsUpdate = true;
  ribCeiling.instanceMatrix.needsUpdate = true;
  tunnel.add(ribShoulders, ribCeiling);

  // Three quiet ceiling channels and the high side guides pull the eye toward
  // daylight rather than making the space feel like a sci-fi corridor.
  for (const z of [-2.72, 0, 2.72]) tunnel.add(box([TUNNEL_LENGTH - .8, .065, .18], [centre, 3.965, z], tunnelLight));

  const addPortal = (x: number, halfWidth: number, texture: THREE.Texture, includeUprights: boolean) => {
    tunnel.add(roundedBox([.38, .5, halfWidth * 2], [x, 3.88, 0], structuralMetal, .06, !lowPower));
    if (includeUprights) {
      tunnel.add(
        roundedBox([.38, 3.92, .5], [x, 1.96, -halfWidth + .12], structuralMetal, .055, !lowPower),
        roundedBox([.38, 3.92, .5], [x, 1.96, halfWidth - .12], structuralMetal, .055, !lowPower),
        box([.4, 3.34, .075], [x - .02, 1.78, -halfWidth + .39], brandLight),
        box([.4, 3.34, .075], [x - .02, 1.78, halfWidth - .39], brandLight),
      );
    }
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(halfWidth * 1.5, .48),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    sign.position.set(x - .196, 3.84, 0);
    sign.rotation.y = -Math.PI / 2;
    tunnel.add(sign);
  };
  addPortal(ROOM_EXIT, entranceHalfWidth, entranceSignMap, false);
  addPortal(TUNNEL_EXIT, exitHalfWidth, exitSignMap, true);

  // The apron begins exactly at the old tunnel exit; this narrow threshold
  // masks z-fighting while leaving the existing pitch-side connection intact.
  tunnel.add(box([.34, .075, TUNNEL_WIDTH], [TUNNEL_EXIT, .055, 0], structuralMetal));
  scene.add(tunnel);
  return { floorMap, surfaceDetailMap, entranceSignMap, exitSignMap, tunnelLight, brandLight };
}

async function buildDressingRoomAndTunnel(scene: THREE.Scene, lowPower: boolean, yieldTask: () => Promise<void>, pendingTextures: Set<THREE.Texture>) {
  const roomSurfaceDetail = surfaceDetailTexture(lowPower, "Gaffer dressing-room micro surface", 5, 5);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x262c29, roughness: .94, bumpMap: roomSurfaceDetail, bumpScale: .018 }), dark = new THREE.MeshStandardMaterial({ color: 0x080d0b, roughness: .92, bumpMap: roomSurfaceDetail, bumpScale: .012 });
  const floorTexture = dressingFloorTexture(lowPower), floor = new THREE.MeshPhysicalMaterial({ color: 0x777872, map: floorTexture, roughness: .62, metalness: .025, clearcoat: .14, clearcoatRoughness: .78, bumpMap: roomSurfaceDetail, bumpScale: .035, roughnessMap: roomSurfaceDetail });
  const metal = new THREE.MeshStandardMaterial({ color: 0x111815, roughness: .58, metalness: .42, bumpMap: roomSurfaceDetail, bumpScale: .009 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x412c21, roughness: .7, bumpMap: roomSurfaceDetail, bumpScale: .014 }), woodDark = new THREE.MeshStandardMaterial({ color: 0x211713, roughness: .8, bumpMap: roomSurfaceDetail, bumpScale: .012 }), green = new THREE.MeshStandardMaterial({ color: 0x00d99a, roughness: .72 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ece8, roughness: .83 });
  const light = new THREE.MeshStandardMaterial({ color: 0xfff3d8, emissive: 0xffd99c, emissiveIntensity: 1.22, roughness: .46 });
  const greenLight = new THREE.MeshStandardMaterial({ color: 0x00d99a, emissive: 0x00b77d, emissiveIntensity: 1.22, roughness: .48 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0x151a19, roughness: .88 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x111615, roughness: .72 });
  const towel = new THREE.MeshStandardMaterial({ color: 0xbfc5c1, roughness: .96 });
  const bottleMat = new THREE.MeshStandardMaterial({color:0x4fb9a8,roughness:.35,transparent:true,opacity:.82});
  const shirtFabricMap = shirtFabricTexture(lowPower);
  [roomSurfaceDetail, floorTexture, shirtFabricMap].forEach(texture => pendingTextures.add(texture));
  const shirt = new THREE.MeshPhysicalMaterial({ map: shirtFabricMap, color: 0xffffff, roughness: .92, metalness: .02, clearcoat: .02, clearcoatRoughness: .9, side: THREE.DoubleSide });
  const dressingKit: DressingRoomKit = { metal, wood, woodDark, cushion, warmLight: light, greenLight, green, white, boot, towel, bottle: bottleMat, shirt, shirtGeometry: shirtGeometry(lowPower), shirtCollarGeometry: shirtCollarGeometry(lowPower) };
  const dummy = new THREE.Object3D();

  scene.add(
    box([18,.3,18],[-70,-.15,0],floor),
    box([18,.35,18],[-70,4.35,0],dark),
    box([.35,4.5,18],[-79,2.1,0],concrete),
    box([.18,4.3,3.7],[-61.02,2.08,-7.13],dark),
    box([.18,4.3,3.7],[-61.02,2.08,7.13],dark),
    box([.2,.16,17.6],[-78.78,.13,0],metal),
  );
  // A coffered acoustic ceiling and broad warm panels give the room a believable
  // club-facility finish while guiding the existing camera toward the tunnel.
  for (let i = 0; i < 6; i += 1) scene.add(box([2.72, .08, 16.9], [-77.45 + i * 2.98, 4.12, 0], i % 2 ? metal : dark));
  for (const x of [-76.2, -71.2, -66.2]) for (const z of [-3.35, 3.35]) {
    scene.add(
      box([2.55, .045, 1.12], [x, 4.035, z], light),
      box([2.8, .055, 1.36], [x, 4.075, z], metal),
    );
  }
  for (const side of [-1, 1]) scene.add(box([16.1, .045, .1], [-70.2, 4.025, side * 5.78], greenLight));
  const ventSlats = new THREE.InstancedMesh(new THREE.BoxGeometry(.7, .035, .055), metal, 12);
  for (let i = 0; i < 12; i += 1) {
    dummy.position.set(i < 6 ? -74.1 : -66.9, 4.025, (i % 6 - 2.5) * .16);
    dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); ventSlats.setMatrixAt(i, dummy.matrix);
  }
  ventSlats.instanceMatrix.needsUpdate = true; scene.add(ventSlats);

  if (new Set(DRESSING_ROOM_SHIRT_NUMBERS).size !== DRESSING_ROOM_SHIRT_NUMBERS.length) throw new Error("Dressing-room shirt numbers must be unique");
  const numberMaps = DRESSING_ROOM_SHIRT_NUMBERS.map(number => numberTexture(number, shirtFabricMap, lowPower));
  numberMaps.forEach(texture => pendingTextures.add(texture));
  scene.add(
    createLockerRow(-1, lowPower, dressingKit, numberMaps.slice(0, LOCKER_CONFIG.count)),
    createLockerRow(1, lowPower, dressingKit, numberMaps.slice(LOCKER_CONFIG.count)),
    createCentralIsland(dressingKit),
  );
  await yieldTask();
  const bottles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075,.085,.32,8),bottleMat,lowPower?6:10);
  for(let i=0;i<bottles.count;i+=1){const side=i%2?-1:1;dummy.position.set(-76+Math.floor(i/2)*2.6,.39,side*7.72);dummy.rotation.set(0,0,0);dummy.updateMatrix();bottles.setMatrixAt(i,dummy.matrix);} scene.add(bottles);

  // Selective dressing-room detail: one tactics wall and a soft kit bag.
  const tacticsWall = new THREE.Group();
  tacticsWall.name = "Dressing room tactics wall";
  tacticsWall.add(roundedBox([.12, 2.15, 3.05], [-78.79, 2.26, -2.15], metal, .045));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 1.7), new THREE.MeshStandardMaterial({ color: 0xe7ece8, roughness: .78 }));
  board.position.set(-78.715, 2.3, -2.15); board.rotation.y = Math.PI / 2; tacticsWall.add(board);
  const markings = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-78.705, 2.3, -3.05), new THREE.Vector3(-78.705, 2.3, -1.25),
      new THREE.Vector3(-78.705, 1.75, -2.6), new THREE.Vector3(-78.705, 2.85, -2.6),
      new THREE.Vector3(-78.705, 1.75, -1.7), new THREE.Vector3(-78.705, 2.85, -1.7),
    ]),
    new THREE.LineBasicMaterial({ color: 0x2b6b52, transparent: true, opacity: .55 }),
  );
  tacticsWall.add(markings); scene.add(tacticsWall);
  const kitBag = roundedBox([1.18, .46, .58], [-64.05, .28, -5.85], dark, .13, true); kitBag.rotation.y = -.18; scene.add(kitBag);

  const crestMap = crestTexture();
  crestMap.center.set(.5, .5);
  crestMap.rotation = -Math.PI / 2;
  const crest = new THREE.Mesh(new THREE.CircleGeometry(1.28, 40), new THREE.MeshStandardMaterial({ map: crestMap, transparent: true, roughness: .78, depthWrite: false }));
  crest.rotation.x = -Math.PI / 2; crest.position.set(-63.25, .012, 0); scene.add(crest);
  const ballTexture=footballTexture(), footballMat = new THREE.MeshStandardMaterial({map:ballTexture,roughness:.72});
  scene.add(createEquipmentArea(lowPower, dressingKit));
  await yieldTask();
  const tunnelAssets = buildPremiumTunnel(scene, lowPower);
  scene.add(box([10.5,.18,TUNNEL_WIDTH],[-39.25,-.04,0],dark));

  return { floorTexture, roomSurfaceDetail, crestMap, numberMaps, ballTexture, shirtFabricMap, footballMat, metal, green, dark, dummy, light, cushion, tunnelAssets };
}

function createCornerFlag(lowPower: boolean, poleMaterial: THREE.Material) {
  const group = new THREE.Group();
  group.name = "Landing corner flag";
  group.position.set(-33.45, .02, -51.75);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .03, 1.8, lowPower ? 6 : 8), poleMaterial);
  pole.position.y = .9;
  const pivot = new THREE.Group();
  pivot.name = "Landing corner flag cloth";
  pivot.position.y = 1.55;
  pivot.rotation.y = .3;
  const clothMaterial = new THREE.MeshStandardMaterial({
    color: 0x00bd86, emissive: 0x003d2c, emissiveIntensity: .16, roughness: .76, side: THREE.DoubleSide,
  });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(.78, .46, 1, 1), clothMaterial);
  cloth.geometry.translate(.39, 0, 0);
  pivot.add(cloth);
  group.add(pole, pivot);
  return { group, pivot };
}

function applyGrassShader(material: THREE.Material, lowPower: boolean) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      // Straight mowing lanes only, similar to the reference tunnel-to-pitch photo.
      // Keep tonal separation subtle and realistic, with only tiny blade breakup.
      vec2 grassUv = vUv;
      float grassLane = mod(floor(grassUv.y * 14.0), 2.0);
      float laneTone = mix(0.965, 1.025, grassLane);

      vec2 turfCell = vec2(floor(grassUv.x * ${lowPower ? '96.0' : '144.0'}), floor(grassUv.y * ${lowPower ? '220.0' : '320.0'}));
      float turfNoise = fract(sin(dot(turfCell, vec2(12.9898, 78.233))) * 43758.5453);
      float turfVariation = (turfNoise - 0.5) * ${lowPower ? "0.008" : "0.012"};

      diffuseColor.rgb *= laneTone + turfVariation;
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `
      // Preserve lighting and shadowing but suppress any bright reflective-looking lift.
      gl_FragColor.rgb = mix(gl_FragColor.rgb, diffuseColor.rgb, 0.10);
      #include <dithering_fragment>
      `,
    );
  };
  material.customProgramCacheKey = () => `landing-grass-reference-${lowPower ? "low" : "full"}`;
  material.needsUpdate = true;
}

function tuneStadiumVisuals(stadiumGroup: THREE.Group) {
  const materialSet = new Set<THREE.Material>();
  const tmp = new THREE.Color();
  stadiumGroup.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => materialSet.add(material));
      if (object instanceof THREE.InstancedMesh && object.instanceColor) {
        // Seats stay subdued but catch a restrained stadium-light highlight.
        if (object.material instanceof THREE.MeshStandardMaterial) {
          object.material.roughness = Math.min(object.material.roughness, .74);
          object.material.metalness = Math.max(object.material.metalness, .015);
        }
        for (let i = 0; i < object.count; i += 1) {
          object.getColorAt(i, tmp);
          const greenish = tmp.g > tmp.r * 1.18 && tmp.g > tmp.b * 1.12;
          tmp.multiplyScalar(greenish ? .92 : .77);
          if (greenish) {
            tmp.offsetHSL(0, -.02, -.03);
          } else {
            tmp.offsetHSL(0, -.015, -.035);
          }
          object.setColorAt(i, tmp);
        }
        object.instanceColor.needsUpdate = true;
      }
    }
  });
  materialSet.forEach(material => {
    if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial || material instanceof THREE.MeshLambertMaterial)) return;
    const hex = material.color.getHex();
    if (hex === 0xffffff) return;
    // Quietly darken the stand architecture while leaving signage/glass readable.
    if ([0x626b67, 0x252d2b, 0x242d2c, 0x111917, 0x858d88, 0x9ba8a0, 0x454d4b].includes(hex)) {
      material.color.multiplyScalar(hex === 0x858d88 || hex === 0x9ba8a0 ? .86 : .92);
    }
  });
}

async function buildPitchAndStadium(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  lowPower: boolean,
  roomAssets: Awaited<ReturnType<typeof buildDressingRoomAndTunnel>>,
  yieldTask: () => Promise<void>,
) {
  const { dark, metal, cushion } = roomAssets;
  const grassTexture=pitchTexture(lowPower);grassTexture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),lowPower?2:8);const grassDetail=surfaceDetailTexture(lowPower,"Landing grass micro surface",18,28);const grassMat=new THREE.MeshPhongMaterial({map:grassTexture,bumpMap:grassDetail,bumpScale:lowPower ? .006 : .01,shininess:0});applyGrassShader(grassMat,lowPower);const pitch=new THREE.Mesh(new THREE.PlaneGeometry(68,105),grassMat);pitch.rotation.x=-Math.PI/2;pitch.receiveShadow=true;scene.add(pitch);
  const ball=createClassicFootball(.22,lowPower);ball.position.set(0,.225,0);ball.rotation.set(.22,-.58,.12);scene.add(ball);
  const cornerFlag=createCornerFlag(lowPower,metal);scene.add(cornerFlag.group);
  const glass=new THREE.MeshPhysicalMaterial({color:0xb9d8d0,roughness:.24,transparent:true,opacity:.25,side:THREE.DoubleSide}),dugout=new THREE.Group();dugout.position.set(-39.2,0,13.5);dugout.add(box([2.8,.3,13],[0,.15,0],dark),box([.3,3.2,13],[-1.25,1.75,0],glass),box([2.8,.32,13],[0,3.25,0],metal));
  for(let i=0;i<6;i+=1){const z=-5.2+i*2.05;dugout.add(box([.65,.48,.72],[.35,.58,z],cushion),box([.12,.8,.72],[-.05,.88,z],cushion));}
  for(const z of [-6.3,6.3])dugout.add(box([2.8,3,.08],[0,1.65,z],glass));scene.add(dugout);
  await yieldTask();
  const stadium=await createGafferStadium(lowPower, scene, yieldTask);tuneStadiumVisuals(stadium.group);
  const goalMat=new THREE.MeshStandardMaterial({color:0xe8efeb,roughness:.62,metalness:.18});
  const netMat=new THREE.LineBasicMaterial({color:0xdce8e2,transparent:true,opacity:.48});
  scene.add(footballGoal(-1,goalMat,netMat),footballGoal(1,goalMat,netMat));
  const skyMat=new THREE.ShaderMaterial({uniforms:{topColor:{value:new THREE.Color(DARK_SKY_TOP)},bottomColor:{value:new THREE.Color(DARK_SKY_BOTTOM)}},vertexShader:`varying vec3 v;void main(){vec4 p=modelMatrix*vec4(position,1.);v=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`uniform vec3 topColor;uniform vec3 bottomColor;varying vec3 v;void main(){float h=clamp(normalize(v+vec3(0.,28.,0.)).y,0.,1.);float t=smoothstep(0.0,1.0,pow(h,.86));gl_FragColor=vec4(mix(bottomColor,topColor,t),1.);}`,side:THREE.BackSide,fog:false,depthWrite:false});scene.add(new THREE.Mesh(new THREE.SphereGeometry(138,lowPower?32:64,lowPower?18:32),skyMat));
  scene.add(new THREE.HemisphereLight(0xaecbc4,0x17201b,.58));const sun=new THREE.DirectionalLight(0xd8e8df,1.08);sun.position.set(-18,56,24);sun.castShadow=!lowPower;sun.shadow.mapSize.set(lowPower?512:1024,lowPower?512:1024);sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=75;sun.shadow.camera.bottom=-75;sun.shadow.camera.far=150;scene.add(sun,sun.target);
  const daylightSun=new THREE.DirectionalLight(0xfff1d6,.85);daylightSun.name="Landing daylight sun";daylightSun.position.set(38,68,-42);daylightSun.castShadow=false;daylightSun.shadow.mapSize.set(512,512);daylightSun.shadow.camera.left=-70;daylightSun.shadow.camera.right=70;daylightSun.shadow.camera.top=75;daylightSun.shadow.camera.bottom=-75;daylightSun.shadow.camera.far=180;daylightSun.visible=false;scene.add(daylightSun,daylightSun.target);
  const roomLight=new THREE.PointLight(0xffdfaa,.34,22,2);roomLight.position.set(-70,3.45,0);
  const lockerLightLeft=new THREE.PointLight(0xffc978,.38,10,2);lockerLightLeft.position.set(-70.8,2.7,-5.7);
  const lockerLightRight=new THREE.PointLight(0xffc978,.38,10,2);lockerLightRight.position.set(-70.8,2.7,5.7);
  const roomAccentLeft=new THREE.PointLight(0xfff0cf,lowPower?.1:.16,9,2);roomAccentLeft.position.set(-74.5,3.85,-3.4);
  const roomAccentRight=new THREE.PointLight(0xfff0cf,lowPower?.1:.16,9,2);roomAccentRight.position.set(-74.5,3.85,3.4);
  const portalLight=new THREE.PointLight(0x38bb82,.24,9,2);portalLight.position.set(ROOM_EXIT-.65,2.35,0);
  const tunnelFill=new THREE.PointLight(0xc7f6e4,lowPower?.14:.2,13,2);tunnelFill.position.set(ROOM_EXIT+TUNNEL_LENGTH*.52,3.15,0);
  const tunnelAccentLeft=new THREE.PointLight(0x61f0b8,lowPower?.08:.14,9,2);tunnelAccentLeft.position.set(ROOM_EXIT+TUNNEL_LENGTH*.58,2.65,-3.9);
  const tunnelAccentRight=new THREE.PointLight(0x61f0b8,lowPower?.08:.14,9,2);tunnelAccentRight.position.set(ROOM_EXIT+TUNNEL_LENGTH*.58,2.65,3.9);
  const exitLight=new THREE.PointLight(0xcaf2df,.62,22,2);exitLight.position.set(TUNNEL_EXIT+1.5,3.6,0);
  // Broad diffuse stadium illumination avoids bright circular/reflective-looking patches on the turf.
  // These are directional so the pitch reads like evenly floodlit grass rather than a glossy surface.
  const pitchFillLeft=new THREE.DirectionalLight(0xf1f5e9,lowPower?.09:.16);pitchFillLeft.position.set(-28,34,-38);pitchFillLeft.target.position.set(2,0,-8);pitchFillLeft.castShadow=false;
  const pitchFillRight=new THREE.DirectionalLight(0xe8f1e9,lowPower?.09:.16);pitchFillRight.position.set(-28,34,38);pitchFillRight.target.position.set(2,0,8);pitchFillRight.castShadow=false;
  const pitchRimLeft=new THREE.PointLight(0x85d7b0,lowPower?.05:.11,42,2);pitchRimLeft.position.set(-18,7,-28);
  const pitchRimRight=new THREE.PointLight(0x85d7b0,lowPower?.05:.11,42,2);pitchRimRight.position.set(-18,7,28);
  scene.add(roomLight,lockerLightLeft,lockerLightRight,roomAccentLeft,roomAccentRight,portalLight,exitLight,tunnelFill,tunnelAccentLeft,tunnelAccentRight,pitchFillLeft,pitchFillLeft.target,pitchFillRight,pitchFillRight.target,pitchRimLeft,pitchRimRight);

  return { grassTexture, grassDetail, stadium, skyMat, daylightSun, cornerFlag, lighting: { roomLight, lockerLightLeft, lockerLightRight, roomAccentLeft, roomAccentRight, portalLight, tunnelFill, tunnelAccentLeft, tunnelAccentRight, exitLight, pitchFillLeft, pitchFillRight, pitchRimLeft, pitchRimRight } };
}
export async function createLandingScene({ container, onReadyChange, signal }: SceneOptions): Promise<LandingSceneController> {
  const yieldTask = () => yieldSceneTask(signal);
  await yieldTask();
  const initialWidth = Math.max(container.clientWidth, 1), initialHeight = Math.max(container.clientHeight, 1);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const constrainedDevice =
    (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 6) ||
    (deviceMemory !== undefined && deviceMemory <= 6);
  let lowPower = initialWidth < 768 || constrainedDevice;
  const renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: !lowPower,
    powerPreference: lowPower ? "low-power" : "high-performance",
  });
  const gl = renderer.getContext();
  const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = String(
    gl.getParameter(
      rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER,
    ),
  );
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererName);
  if (softwareRenderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw new Error("Use the static landing background on software renderers");
  }
  lowPower ||= softwareRenderer;
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.setClearColor(DARK_BACKGROUND); renderer.shadowMap.enabled = !lowPower; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02; renderer.domElement.className = "landing-scene__canvas"; renderer.domElement.setAttribute("aria-hidden", "true"); renderer.domElement.tabIndex = -1; container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(),sceneBackground=new THREE.Color(DARK_BACKGROUND);scene.background=sceneBackground;scene.fog = new THREE.Fog(0x0b1512, 24, lowPower ? 145 : 190);
  const pendingTextures = new Set<THREE.Texture>();
  try {
  const camera = new THREE.PerspectiveCamera(lowPower ? 67 : 58, initialWidth / initialHeight, .08, 300);
  const cameraPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-73, 1.74, .1), new THREE.Vector3(-67, 1.72, -.08), new THREE.Vector3(-61, 1.69, 0),
    new THREE.Vector3(-55.5, 1.66, .04), new THREE.Vector3(-50, 1.64, 0), new THREE.Vector3(TUNNEL_EXIT, 1.69, 0),
    new THREE.Vector3(-38, 1.76, -.08), new THREE.Vector3(-29, 1.82, .08), new THREE.Vector3(-15, 1.84, 0), new THREE.Vector3(0, 1.82, 0),
  ], false, "centripetal");

  const roomAssets = await buildDressingRoomAndTunnel(scene, lowPower, yieldTask, pendingTextures);
  const { floorTexture, roomSurfaceDetail, crestMap, numberMaps, ballTexture, shirtFabricMap, tunnelAssets } = roomAssets;
  await yieldTask();
  const { grassTexture, grassDetail, stadium, skyMat, daylightSun, cornerFlag, lighting } = await buildPitchAndStadium(scene, renderer, lowPower, roomAssets, yieldTask);
  const applyEnvironmentTheme=()=>{const lightMode=!document.documentElement.classList.contains("dark");const background=lightMode?LIGHT_BACKGROUND:DARK_BACKGROUND;sceneBackground.setHex(background);renderer.setClearColor(background);skyMat.uniforms.topColor.value.setHex(lightMode?LIGHT_SKY_TOP:DARK_SKY_TOP);skyMat.uniforms.bottomColor.value.setHex(lightMode?LIGHT_SKY_BOTTOM:DARK_SKY_BOTTOM);if(scene.fog instanceof THREE.Fog)scene.fog.color.setHex(lightMode?0x9eb8b0:0x0b1512);daylightSun.visible=lightMode;stadium.updateTheme(lightMode);};
  const updateLighting=(progress:number)=>{
    const tunnelArrival=smooth(.24,.5,progress),stadiumReveal=smooth(.43,.62,progress);
    const lightMode=!document.documentElement.classList.contains("dark");
    const themeBoost=lightMode?1:.92;
    // Darken the room/tunnel as the stadium opens up, matching the reference reveal.
    lighting.roomLight.intensity=.4-.22*tunnelArrival; lighting.lockerLightLeft.intensity=.43-.25*tunnelArrival; lighting.lockerLightRight.intensity=.43-.25*tunnelArrival;
    lighting.roomAccentLeft.intensity=(lowPower?.1:.16)*(1-.5*tunnelArrival); lighting.roomAccentRight.intensity=(lowPower?.1:.16)*(1-.5*tunnelArrival);
    lighting.portalLight.intensity=.2+.18*tunnelArrival; lighting.tunnelFill.intensity=(lowPower?.12:.18)+.06*tunnelArrival; lighting.exitLight.intensity=.55+1.1*stadiumReveal;
    lighting.tunnelAccentLeft.intensity=((lowPower?.06:.11)+.08*tunnelArrival)*themeBoost; lighting.tunnelAccentRight.intensity=((lowPower?.06:.11)+.08*tunnelArrival)*themeBoost;
    // Broad stadium floodlighting brightens the whole field evenly; no local hot spots.
    lighting.pitchFillLeft.intensity=((lowPower?.09:.16)+.18*stadiumReveal)*themeBoost; lighting.pitchFillRight.intensity=((lowPower?.09:.16)+.18*stadiumReveal)*themeBoost;
    lighting.pitchRimLeft.intensity=((lowPower?.05:.11)+.08*stadiumReveal)*(lightMode?1:.92); lighting.pitchRimRight.intensity=((lowPower?.05:.11)+.08*stadiumReveal)*(lightMode?1:.92);
    // Keep exposure controlled so white UI/lines stay crisp and the pitch does not wash out.
    renderer.toneMappingExposure=(lightMode?.99:.91)+stadiumReveal*(lightMode?.09:.07);
    if(scene.fog instanceof THREE.Fog){scene.fog.near=THREE.MathUtils.lerp(18,30,stadiumReveal);scene.fog.far=THREE.MathUtils.lerp(lowPower?126:164,lowPower?156:206,stadiumReveal);}
  };
  applyEnvironmentTheme();
  const shirtObject = scene.getObjectByName("Dressing room shirt");
  const animatedShirt = shirtObject instanceof THREE.Group ? shirtObject : null;
  const shirtBaseRoll = animatedShirt?.rotation.z ?? 0;
  const flagBaseYaw = cornerFlag.pivot.rotation.y;
  // Static geometry dominates this scene. Stop Three.js from rebuilding local
  // matrices for every static mesh on every rendered scroll frame.
  scene.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    }
  });
  // Compile one material/geometry variant per task. A single compile(scene)
  // would still synchronously compile every program in the same long task.
  const compileScene = new THREE.Scene();
  const compiled = new Set<string>();
  scene.traverse(object => {
    if (object instanceof THREE.Light) compileScene.add(object.clone());
  });
  compileScene.fog = scene.fog;
  const meshes: THREE.Mesh[] = [];
  scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const key = `${materials.map(material => material.id).join(',')}/${mesh instanceof THREE.InstancedMesh}/${!!mesh.geometry.attributes.normal}/${!!mesh.geometry.attributes.uv}`;
    if (compiled.has(key)) continue;
    compiled.add(key);
    await yieldTask();
    const sample = mesh.clone();
    compileScene.add(sample);
    renderer.compile(compileScene, camera);
    compileScene.remove(sample);
  }
  await yieldTask();
  // Theme changes made while constructing/compiling must reach the first frame.
  applyEnvironmentTheme();
  const updateEnvironmentalMotion=(progress:number)=>{
    if(reducedMotion){
      if(animatedShirt)animatedShirt.rotation.z=shirtBaseRoll;
      cornerFlag.pivot.rotation.set(0,flagBaseYaw,0);
      roomAssets.tunnelAssets.tunnelLight.emissiveIntensity=1.42;
      roomAssets.tunnelAssets.brandLight.emissiveIntensity=1.25;
      return;
    }
    const motionScale=lowPower?.55:1;
    // Motion is derived from scroll progress, so the scene still stops rendering
    // when scrolling settles and incurs no continuous idle animation cost.
    if(animatedShirt){
      const roomGate=1-smooth(.16,.3,progress);
      animatedShirt.rotation.z=shirtBaseRoll+Math.sin(progress*Math.PI*18+.7)*.024*motionScale*roomGate;
    }
    const tunnelGate=(smooth(.18,.34,progress)-smooth(.5,.64,progress));
    const pulse=Math.sin(progress*Math.PI*22+1.1);
    roomAssets.tunnelAssets.tunnelLight.emissiveIntensity=1.42+pulse*.065*motionScale*tunnelGate;
    roomAssets.tunnelAssets.brandLight.emissiveIntensity=1.25+pulse*.045*motionScale*tunnelGate;
    const pitchGate=smooth(.5,.68,progress);
    cornerFlag.pivot.rotation.y=flagBaseYaw+Math.sin(progress*Math.PI*16+.45)*.085*motionScale*pitchGate;
    cornerFlag.pivot.rotation.z=Math.sin(progress*Math.PI*11+1.7)*.012*motionScale*pitchGate;
  };
  const position=new THREE.Vector3(),target=new THREE.Vector3(),direction=new THREE.Vector3();let targetProgress=0,currentProgress=0,active=!document.hidden,paused=false,disposed=false,readySent=false,frame=0;
  const updateTarget=()=>{targetProgress=THREE.MathUtils.clamp(window.scrollY/Math.max(document.documentElement.scrollHeight-window.innerHeight,1),0,1);if(active&&!paused)start();};
  const updateCamera=(progress:number)=>{cameraPath.getPointAt(progress,position);if(!reducedMotion)position.y+=Math.sin(progress*Math.PI*30)*.009;camera.position.copy(position);
    // Keep the original straight run from the dressing room into the tunnel.
    // The stadium sweeps only begin once the camera is fully outside.
    const rightSweep=smooth(.58,.73,progress),leftSweep=smooth(.76,.98,progress);
    const yaw=reducedMotion?0:rightSweep*1.12-leftSweep*2.18;
    direction.set(Math.cos(yaw),smooth(.58,.78,progress)*.06,Math.sin(yaw));target.copy(position).addScaledVector(direction,18);camera.lookAt(target);updateLighting(progress);updateEnvironmentalMotion(progress);};
  const render=()=>{if(disposed)return;renderer.render(scene,camera);if(!readySent){readySent=true;onReadyChange(true);}};
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;};
  const animate=()=>{frame=0;if(disposed||paused||!active)return;const difference=targetProgress-currentProgress;if(Math.abs(difference)<.00008){currentProgress=targetProgress;updateCamera(currentProgress);render();return;}currentProgress+=difference*(reducedMotion?1:lowPower?.12:.095);if(Math.abs(targetProgress-currentProgress)<.00008)currentProgress=targetProgress;updateCamera(currentProgress);render();if(currentProgress!==targetProgress)frame=requestAnimationFrame(animate);};
  function start(){if(!frame&&!disposed&&active&&!paused)frame=requestAnimationFrame(animate);}
  // Keep the synchronous shirts until both assets and every replacement are ready.
  let loadedShirt: THREE.Object3D | null = null;
  let kitImage: HTMLImageElement | null = null;
  let shirtLoadFailed = false, shirtsSwapped = false;
  const modelTextures = new Set<THREE.Texture>();
  const modelMaterials = new Set<THREE.Material>();
  const collectResources = (roots: THREE.Object3D[]) => {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    roots.forEach(root => root.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    }));
    return { geometries, materials };
  };
  const releaseLoadedShirt = () => {
    if (!loadedShirt) return;
    const resources = collectResources([loadedShirt]);
    resources.geometries.forEach(value => value.dispose());
    resources.materials.forEach(value => {
      Object.values(value).forEach(property => { if (property instanceof THREE.Texture) modelTextures.add(property); });
      value.dispose();
    });
    loadedShirt = null;
  };
  const failShirtLoad = (error: unknown) => {
    if (!shirtLoadFailed && !disposed) console.warn("Landing shirt assets could not be loaded; keeping fallback shirts.", error);
    shirtLoadFailed = true;
    releaseLoadedShirt();
    modelMaterials.forEach(value => value.dispose()); modelMaterials.clear();
    modelTextures.forEach(value => value.dispose()); modelTextures.clear();
    kitImage = null;
  };
  const swapShirts = () => {
    if (disposed || shirtLoadFailed || !loadedShirt || !kitImage || shirtsSwapped) return;
    let scale = .18, clearance = NaN;
    let check = "source model";
    let failedBounds: Array<{ check: string; number: number; bound: number; limit: number; sway: number }> = [];
    try {
      const groups: THREE.Group[] = [];
      scene.traverse(object => { if (object instanceof THREE.Group && object.name === "Dressing room shirt") groups.push(object); });
      const sourceShirt = loadedShirt.getObjectByName("Shirt");
      if (!(sourceShirt instanceof THREE.Mesh)) throw new Error("Landing model is missing the Shirt mesh");
      const sourceBounds = new THREE.Box3().setFromObject(loadedShirt);
      const centerX = (sourceBounds.min.x + sourceBounds.max.x) / 2;
      // Existing hook top is about .90 above the group; cushion top is 1.17.
      const hookTop = .90, surfaceTop = 1.17, minimumClearance = .15;
      scene.updateMatrixWorld(true);
      check = "canvas texture";
      const replacements = groups.map(group => {
        // World Z points into each locker in opposite directions. Keep the
        // old group's measured back extent, including its hanger and hook.
        const oldBounds = new THREE.Box3().setFromObject(group);
        const intoLocker = Math.sign(group.position.z);
        const backLimit = intoLocker > 0 ? oldBounds.max.z - group.position.z : group.position.z - oldBounds.min.z;
        const canvas = document.createElement("canvas");
        const size = lowPower ? 256 : 512, R = size / 1024;
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Landing kit canvas is unavailable");
        ctx.drawImage(kitImage!, 0, 0, size, size);
        ctx.fillStyle = "#f1f4f1"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `900 ${160 * R}px Inter, Arial, sans-serif`;
        ctx.fillText(String(group.userData.shirtNumber), 251 * R, 258 * R);
        ctx.font = `900 ${230 * R}px Inter, Arial, sans-serif`;
        ctx.fillText(String(group.userData.shirtNumber), 773 * R, 303 * R);
        const texture = new THREE.CanvasTexture(canvas);
        texture.flipY = false; texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        modelTextures.add(texture);
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .9, metalness: 0, side: THREE.DoubleSide });
        modelMaterials.add(material);
        const model = loadedShirt!.clone(true);
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const isShirt = object.name === "Shirt";
          if (isShirt) object.material = material;
          object.castShadow = isShirt && !lowPower; object.receiveShadow = isShirt;
        });
        return { group, model, intoLocker, backLimit, topLimit: oldBounds.max.y + .05 };
      });
      check = "placement bounds";
      for (;;) {
        clearance = Infinity;
        failedBounds = [];
        replacements.forEach(({ group, model, intoLocker, backLimit, topLimit }) => {
          model.scale.setScalar(scale);
          model.position.set(-centerX * scale, hookTop - sourceBounds.max.y * scale, .08);
          // Test both ends of the first shirt's possible scroll sway as well as
          // the unchanged deterministic tilt. No bounds work runs per frame.
          const probe = new THREE.Group();
          probe.position.copy(group.position); probe.rotation.copy(group.rotation);
          probe.add(model);
          const baseRoll = group === animatedShirt ? shirtBaseRoll : group.rotation.z;
          for (const sway of group === animatedShirt ? [-.024, 0, .024] : [0]) {
            probe.rotation.z = baseRoll + sway;
            probe.updateMatrixWorld(true);
            const bounds = new THREE.Box3().setFromObject(model.getObjectByName("Shirt")!);
            clearance = Math.min(clearance, bounds.min.y - surfaceTop);
            const modelBounds = new THREE.Box3().setFromObject(model);
            const backExtent = intoLocker > 0 ? modelBounds.max.z - group.position.z : group.position.z - modelBounds.min.z;
            // Keep the same hem/opening checks; compare top and back with the
            // measured fallback rather than absolute room coordinates.
            const halfOpening = LOCKER_CONFIG.width / 2 - .12;
            const record = (name: string, bound: number, limit: number) => {
              failedBounds.push({ check: name, number: group.userData.shirtNumber, bound, limit, sway });
            };
            if (bounds.min.y - surfaceTop < minimumClearance) record("hem clearance", bounds.min.y - surfaceTop, minimumClearance);
            if (bounds.min.x < group.position.x - halfOpening) record("opening min.x", bounds.min.x, group.position.x - halfOpening);
            if (bounds.max.x > group.position.x + halfOpening) record("opening max.x", bounds.max.x, group.position.x + halfOpening);
            if (modelBounds.max.y > topLimit) record("hook top max.y", modelBounds.max.y, topLimit);
            if (backExtent > backLimit) record("back depth into locker", backExtent, backLimit);
          }
          probe.remove(model);
        });
        if (failedBounds.length === 0 && clearance >= minimumClearance) break;
        if (scale <= .15) throw new Error("Landing model placement rejected");
        scale = Math.max(.15, scale - .005);
      }
      const removed = groups.flatMap(group => [...group.children]);
      const fallback = collectResources(removed);
      check = "swap and disposal";
      replacements.forEach(({ group, model }) => {
        group.remove(...group.children); group.add(model);
        group.userData.shirtModelScale = scale;
        group.userData.shirtModelClearance = clearance;
        model.traverse(object => { object.updateMatrix(); object.matrixAutoUpdate = false; });
      });
      // Shared locker materials remain alive; only unreferenced fallback assets go.
      const live = collectResources([scene]);
      fallback.geometries.forEach(value => { if (!live.geometries.has(value)) value.dispose(); });
      fallback.materials.forEach(value => { if (!live.materials.has(value)) value.dispose(); });
      collectResources([loadedShirt]).materials.forEach(value => {
        if (!live.materials.has(value)) value.dispose();
      });
      loadedShirt = null; kitImage = null; shirtsSwapped = true;
      numberMaps.forEach(value => value.dispose()); numberMaps.length = 0;
      const fabricIsLive = [...live.materials].some(material => Object.values(material).some(value => value === shirtFabricMap));
      if (fabricIsLive) modelTextures.add(shirtFabricMap); else shirtFabricMap.dispose();
      console.info("Landing shirts swapped", { scale, minimumClearance: clearance });
      // The existing request coalesces with an outstanding scroll frame.
      start();
    } catch (error) { failShirtLoad({ check, scale, clearance, failedBounds, error }); }
  };
  new GLTFLoader().load("/models/landing-shirt.glb", gltf => {
    loadedShirt = gltf.scene;
    if (disposed || shirtLoadFailed) {
      releaseLoadedShirt(); modelTextures.forEach(value => value.dispose()); modelTextures.clear();
      return;
    }
    swapShirts();
  }, undefined, failShirtLoad);
  new THREE.ImageLoader().load("/models/landing-shirt-kit.jpg", image => {
    if (disposed || shirtLoadFailed) return;
    kitImage = image; swapShirts();
  }, undefined, failShirtLoad);
  let lastWidth=0,lastHeight=0,lastPixelRatio=0;
  const resize=()=>{if(disposed)return;const width=Math.max(container.clientWidth,1),height=Math.max(container.clientHeight,1);lowPower=width<768||constrainedDevice||softwareRenderer;const cap=lowPower?1.05:width<1280?1.28:1.45,budget=lowPower?760000:width<1280?1250000:1750000;
    const pixelRatio=Math.max(lowPower?.55:.5,Math.min(window.devicePixelRatio||1,cap,Math.sqrt(budget/(width*height))));
    if(width===lastWidth&&height===lastHeight&&pixelRatio===lastPixelRatio&&readySent)return;
    lastWidth=width;lastHeight=height;lastPixelRatio=pixelRatio;
    renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);camera.aspect=width/height;camera.fov=lowPower?67:width<1100?62:58;camera.updateProjectionMatrix();updateCamera(currentProgress);render();};
  const lost=(event:Event)=>{event.preventDefault();stop();onReadyChange(false);},restored=()=>{readySent=false;resize();};renderer.domElement.addEventListener("webglcontextlost",lost);renderer.domElement.addEventListener("webglcontextrestored",restored);window.addEventListener("scroll",updateTarget,{passive:true});updateTarget();currentProgress=targetProgress;resize();
  return {resize,setActive(value){active=value;if(active)start();else stop();},setPaused(value){paused=value;if(paused)stop();else start();},updateTheme(){applyEnvironmentTheme();updateLighting(currentProgress);render();},dispose(){if(disposed)return;disposed=true;stop();releaseLoadedShirt();kitImage=null;modelTextures.forEach(value=>value.dispose());modelTextures.clear();modelMaterials.clear();window.removeEventListener("scroll",updateTarget);renderer.domElement.removeEventListener("webglcontextlost",lost);renderer.domElement.removeEventListener("webglcontextrestored",restored);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();scene.traverse(object=>{if(!(object instanceof THREE.Mesh||object instanceof THREE.InstancedMesh||object instanceof THREE.Line))return;geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));});geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());grassTexture.dispose();grassDetail.dispose();floorTexture.dispose();roomSurfaceDetail.dispose();crestMap.dispose();numberMaps.forEach(value=>value.dispose());ballTexture.dispose();if(!shirtsSwapped)shirtFabricMap.dispose();tunnelAssets.floorMap.dispose();tunnelAssets.surfaceDetailMap.dispose();tunnelAssets.entranceSignMap.dispose();tunnelAssets.exitSignMap.dispose();stadium.textures.forEach((value: THREE.Texture)=>value.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();onReadyChange(false);}};
  } catch (error) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    });
    materials.forEach(material => {
      Object.values(material).forEach(value => { if (value instanceof THREE.Texture) pendingTextures.add(value); });
      material.dispose();
    });
    geometries.forEach(geometry => geometry.dispose());
    pendingTextures.forEach(texture => texture.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    throw error;
  }

}
