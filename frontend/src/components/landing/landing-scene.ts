import * as THREE from "three";

export interface LandingSceneController {
  resize: () => void;
  setActive: (active: boolean) => void;
  setPaused: (paused: boolean) => void;
  updateTheme: () => void;
  dispose: () => void;
}
interface SceneOptions { container: HTMLElement; onReadyChange: (ready: boolean) => void }

const ROOM_EXIT = -61;
const TUNNEL_LENGTH = 16.5; // 25% shorter than the former 22-unit tunnel.
const TUNNEL_EXIT = ROOM_EXIT + TUNNEL_LENGTH;

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
  for (let i = 0; i < 12; i += 1) {
    ctx.fillStyle = i % 2 ? "#174f31" : "#1d653b";
    ctx.fillRect(0, i * canvas.height / 12, canvas.width, canvas.height / 12 + 1);
  }
  ctx.globalAlpha = 0.13;
  for (let i = 0; i < (lowPower ? 1800 : 5200); i += 1) {
    ctx.fillStyle = i % 3 ? "#092e20" : "#86b96d";
    ctx.fillRect((Math.sin(i * 93.17) * .5 + .5) * canvas.width, (Math.sin(i * 47.31 + 2) * .5 + .5) * canvas.height, 1, lowPower ? 2 : 3);
  }
  ctx.globalAlpha = 1;
  const mx = canvas.width * .035, my = canvas.height * .026;
  ctx.strokeStyle = "rgba(245,250,245,.82)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(2, canvas.width * .004);
  ctx.strokeRect(mx, my, canvas.width - mx * 2, canvas.height - my * 2);
  ctx.beginPath(); ctx.moveTo(mx, canvas.height / 2); ctx.lineTo(canvas.width - mx, canvas.height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * .135, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * .009, 0, Math.PI * 2); ctx.fill();
  const bw = canvas.width * .59, bd = canvas.height * .155;
  ctx.strokeRect((canvas.width - bw) / 2, my, bw, bd);
  ctx.strokeRect((canvas.width - bw) / 2, canvas.height - my - bd, bw, bd);
  ctx.strokeRect(canvas.width * .36, my, canvas.width * .28, canvas.height * .06);
  ctx.strokeRect(canvas.width * .36, canvas.height - my - canvas.height * .06, canvas.width * .28, canvas.height * .06);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.name = "Landing pitch";
  return texture;
}

function labelTexture(text: string, width = 1024, height = 160) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = context(canvas);
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#04150f"); gradient.addColorStop(.5, "#0b3324"); gradient.addColorStop(1, "#04150f");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2ed58b"; ctx.lineWidth = 7; ctx.strokeRect(8, 8, width - 16, height - 16);
  ctx.fillStyle = "#effff7"; ctx.font = `900 ${height * .48}px Inter,Arial,sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, width / 2, height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding; texture.name = text;
  return texture;
}

function footballTexture() {
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 128;
  const ctx = context(canvas); ctx.fillStyle = "#edf0eb"; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#151918";
  for (const [x, y] of [[28, 27], [82, 72], [132, 30], [184, 79], [234, 34], [15, 108]]) {
    ctx.beginPath();
    for (let p = 0; p < 5; p += 1) {
      const a = -Math.PI / 2 + p * Math.PI * .4;
      if (!p) ctx.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); else ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
    }
    ctx.closePath(); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding; texture.wrapS = THREE.RepeatWrapping;
  return texture;
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
    ctx.fillStyle = "#4b4f4d"; ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
      const tone = 69 + ((x * 13 + y * 7) % 4) * 3;
      ctx.fillStyle = `rgb(${tone},${tone + 3},${tone + 1})`;
      ctx.fillRect(x * size / 4 + 3, y * size / 4 + 3, size / 4 - 6, size / 4 - 6);
    }
    ctx.strokeStyle = "rgba(18,22,21,.6)"; ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * size / 4, 0); ctx.lineTo(i * size / 4, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * size / 4); ctx.lineTo(size, i * size / 4); ctx.stroke();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.25, 2.25);
  return texture;
}

function tacticsTexture() {
  return canvasTexture(640, 380, ctx => {
    ctx.fillStyle = "#173d2e"; ctx.fillRect(0, 0, 640, 380);
    ctx.strokeStyle = "rgba(231,242,235,.78)"; ctx.lineWidth = 5;
    ctx.strokeRect(38, 32, 564, 316);
    ctx.beginPath(); ctx.moveTo(320, 32); ctx.lineTo(320, 348); ctx.stroke();
    ctx.beginPath(); ctx.arc(320, 190, 57, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(38, 105, 94, 170); ctx.strokeRect(508, 105, 94, 170);
    ctx.strokeRect(38, 145, 38, 90); ctx.strokeRect(564, 145, 38, 90);
    const dots = [[145,100],[180,190],[145,280],[260,135],[260,245],[495,100],[460,190],[495,280],[380,135],[380,245]];
    dots.forEach(([x,y], i) => { ctx.fillStyle = i < 5 ? "#e7eee9" : "#35c889"; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = "#e1b55d"; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(175, 190); ctx.quadraticCurveTo(270, 75, 375, 132); ctx.stroke();
  });
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

function numberTexture(number: number) {
  return canvasTexture(128, 160, ctx => {
    ctx.clearRect(0, 0, 128, 160);
    ctx.fillStyle = "#f1f4f1"; ctx.font = "900 100px Inter,Arial,sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(number), 64, 86);
  });
}

function box(size: [number, number, number], position: [number, number, number], material: THREE.Material, cast = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position); mesh.castShadow = cast; mesh.receiveShadow = true;
  return mesh;
}

interface DressingRoomKit {
  metal: THREE.Material; wood: THREE.Material; woodDark: THREE.Material; cushion: THREE.Material;
  warmLight: THREE.Material; greenLight: THREE.Material; green: THREE.Material; white: THREE.Material;
  boot: THREE.Material; towel: THREE.Material; bottle: THREE.Material;
}

//based on the original locker layout, but with a few tweaks to make it more compact and less expensive to render.

const LOCKER_CONFIG = { count: 7, startX: -77.8, endX: -63.1, width: 1.82, depth: 1.12, height: 3.62 };

function createShirt(kit: DressingRoomKit, numberMap: THREE.Texture) {
  const group = new THREE.Group();
  const jersey = new THREE.MeshStandardMaterial({ color: 0x171d1b, roughness: .92 });
  const body = box([.76, 1.14, .065], [0, -.21, 0], jersey);
  const leftSleeve = box([.3, .5, .06], [-.48, .04, 0], jersey); leftSleeve.rotation.z = -.32;
  const rightSleeve = box([.3, .5, .06], [.48, .04, 0], jersey); rightSleeve.rotation.z = .32;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.14, .025, 6, 16, Math.PI), kit.green); collar.position.set(0, .38, .042); collar.rotation.z = Math.PI;
  const numberMat = new THREE.MeshBasicMaterial({ map: numberMap, transparent: true, depthWrite: false });
  const digits = new THREE.Mesh(new THREE.PlaneGeometry(.43, .54), numberMat); digits.position.set(0, -.18, .04);
  const rail = box([.76, .035, .035], [0, .72, 0], kit.metal);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(.075, .014, 5, 12, Math.PI * 1.4), kit.metal); hook.position.y = .79; hook.rotation.z = -.7;
  group.add(body, leftSleeve, rightSleeve, collar, digits, rail, hook);
  return group;
}

function createLockerRow(side: number, lowPower: boolean, kit: DressingRoomKit, numberMaps: THREE.Texture[]) {
  const group = new THREE.Group();
  const count = lowPower ? 6 : LOCKER_CONFIG.count;
  const spacing = (LOCKER_CONFIG.endX - LOCKER_CONFIG.startX) / (count - 1);
  const z = side * 8.2, frontZ = side * 7.58;
  group.add(box([16.9, .24, 1.62], [-70.3, 4.02, side * 8.15], kit.metal, !lowPower));
  for (let i = 0; i < count; i += 1) {
    const x = LOCKER_CONFIG.startX + i * spacing;
    group.add(
      box([LOCKER_CONFIG.width, 2.42, .12], [x, 2.56, side * 8.67], kit.wood),
      box([.12, LOCKER_CONFIG.height, LOCKER_CONFIG.depth], [x - LOCKER_CONFIG.width / 2, 2.05, z], kit.metal),
      box([.12, LOCKER_CONFIG.height, LOCKER_CONFIG.depth], [x + LOCKER_CONFIG.width / 2, 2.05, z], kit.metal),
      box([LOCKER_CONFIG.width, .58, LOCKER_CONFIG.depth], [x, 3.72, z], kit.woodDark),
      box([LOCKER_CONFIG.width - .16, .055, .08], [x, 3.42, frontZ], kit.warmLight),
      box([LOCKER_CONFIG.width - .14, .16, 1.18], [x, 1.12, side * 7.96], kit.cushion),
      box([LOCKER_CONFIG.width - .12, .1, 1.15], [x, .94, side * 7.98], kit.woodDark),
    );
    const shirt = createShirt(kit, numberMaps[i]);
    shirt.position.set(x, 2.56, side * 7.55); if (side > 0) shirt.rotation.y = Math.PI; group.add(shirt);
    const cubbyFloor = box([LOCKER_CONFIG.width - .13, .08, .98], [x, .2, side * 8.08], kit.woodDark); group.add(cubbyFloor);
    if ((i + (side > 0 ? 1 : 0)) % 3 === 0) {
      const boot = box([.47, .16, .18], [x - .17, .36, side * 7.72], kit.boot); boot.rotation.y = side * .18; group.add(boot);
      const boot2 = boot.clone(); boot2.position.x += .36; boot2.rotation.y *= -1; group.add(boot2);
    } else if (i % 3 === 1) {
      group.add(box([.62, .15, .42], [x, .35, side * 7.83], kit.towel));
    }
  }
  const benchLight = box([15.7, .055, .1], [-70.45, .78, side * 7.5], kit.warmLight); group.add(benchLight);
  return group;
}

function createTacticalBoard(texture: THREE.Texture, kit: DressingRoomKit) {
  const group = new THREE.Group();
  group.add(box([.16, 2.08, 3.72], [0, 0, 0], kit.metal));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.42, 1.78), new THREE.MeshStandardMaterial({ map: texture, roughness: .75 }));
  board.position.x = -.085; board.rotation.y = -Math.PI / 2; group.add(board);
  group.add(box([.12, .06, 3.25], [-.14, 1.25, 0], kit.warmLight));
  group.position.set(-61.28, 2.66, -5.55);
  return group;
}

function createEquipmentArea(lowPower: boolean, ballMaterial: THREE.Material, kit: DressingRoomKit) {
  const group = new THREE.Group();
  const rails = [-.72, .72];
  rails.forEach(z => group.add(box([1.55, .08, .08], [-62.45, .2, 4.9 + z], kit.metal), box([1.55, .08, .08], [-62.45, 1.24, 4.9 + z], kit.metal)));
  group.add(box([.08, 1.25, 1.55], [-63.15, .66, 4.9], kit.metal), box([.08, 1.25, 1.55], [-61.75, .66, 4.9], kit.metal));
  const ballGeometry = new THREE.SphereGeometry(.25, lowPower ? 10 : 14, lowPower ? 7 : 10);
  for (let i = 0; i < (lowPower ? 4 : 6); i += 1) {
    const ball = new THREE.Mesh(ballGeometry, ballMaterial); ball.position.set(-62.8 + (i % 2) * .68, .36 + Math.floor(i / 2) * .42, 4.9); group.add(ball);
  }
  group.add(box([1.28, .72, 1.12], [-64.45, .36, 6.6], kit.metal), box([1.08, .52, .9], [-65.65, .26, 6.72], kit.woodDark));
  for (const x of [-64.9, -64]) for (const y of [.08, .64]) group.add(box([.09, .09, 1.16], [x, y, 6.6], kit.white));
  return group;
}

interface StandKit { structure: THREE.Material; concrete: THREE.Material; seat: THREE.Material; crowd: THREE.Material; metal: THREE.Material; light: THREE.Material }

function stadiumStand(side: "east" | "west" | "north" | "south", lowPower: boolean, kit: StandKit) {
  const group = new THREE.Group(), alongZ = side === "east" || side === "west";
  const sign = side === "west" || side === "north" ? -1 : 1;
  const near = alongZ ? 38 : 56.5, length = alongZ ? 112 : 76, rows = lowPower ? 6 : 9, depth = 1.45;
  for (let row = 0; row < rows; row += 1) {
    const out = near + row * depth, y = .65 + row * 1.08, material = row % 3 === 1 ? kit.seat : kit.structure;
    if (alongZ && side === "west") group.add(box([3.1, .92, 48], [sign * out, y, -32], material), box([3.1, .92, 34], [sign * out, y, 39], material));
    else if (alongZ) group.add(box([3.1, .92, length], [sign * out, y, 0], material));
    else group.add(box([length + row * 2.4, .92, 3.1], [0, y, sign * out], material));
  }
  // A seat is two very low-poly pieces, instanced across the most visible rows.
  const seatRows = lowPower ? 3 : 6, seatsPerRow = Math.floor(length / (lowPower ? 2.1 : 1.35));
  const seatBases = new THREE.InstancedMesh(new THREE.BoxGeometry(.64, .13, .54), kit.seat, seatRows * seatsPerRow);
  const seatBacks = new THREE.InstancedMesh(new THREE.BoxGeometry(.64, .62, .11), kit.seat, seatRows * seatsPerRow);
  const seatPart = new THREE.Object3D();
  let seatIndex = 0;
  for (let row = 0; row < seatRows; row += 1) for (let column = 0; column < seatsPerRow; column += 1) {
    const along = -length / 2 + (column + .5) * length / seatsPerRow, out = near + .62 + row * depth;
    const hiddenByWestAccess = side === "west" && along > -8 && along < 22;
    const scale = hiddenByWestAccess ? 0 : 1;
    seatPart.position.set(alongZ ? sign * out : along, 1.16 + row * 1.08, alongZ ? along : sign * out);
    seatPart.scale.setScalar(scale); seatPart.updateMatrix(); seatBases.setMatrixAt(seatIndex, seatPart.matrix);
    seatPart.position.set(alongZ ? sign * (out + .27) : along, 1.48 + row * 1.08, alongZ ? along : sign * (out + .27));
    seatPart.updateMatrix(); seatBacks.setMatrixAt(seatIndex, seatPart.matrix); seatIndex += 1;
  }
  group.add(seatBases, seatBacks);
  const back = near + rows * depth + 2.2, upper = rows * 1.08 + 5.4;
  if (alongZ) group.add(box([6.4, 1.05, length + 2], [sign * back, upper, 0], kit.concrete), box([1.4, 7.2, length + 4], [sign * (back + 3.4), upper + 3.1, 0], kit.structure), box([15, .65, length + 8], [sign * (back - 1.2), upper + 9.7, 0], kit.metal, !lowPower));
  else group.add(box([length + 8, 1.05, 6.4], [0, upper, sign * back], kit.concrete), box([length + 10, 7.2, 1.4], [0, upper + 3.1, sign * (back + 3.4)], kit.structure), box([length + 16, .65, 15], [0, upper + 9.7, sign * (back - 1.2)], kit.metal, !lowPower));
  const supports = lowPower ? 5 : 8;
  for (let i = 0; i < supports; i += 1) {
    const at = -length / 2 + 6 + i * (length - 12) / Math.max(supports - 1, 1);
    if (alongZ) group.add(box([.32, upper + 9.4, .32], [sign * (back + 2.7), (upper + 9.4) / 2, at], kit.metal), box([9.5, .22, .26], [sign * (back - 1.1), upper + 9.25, at], kit.metal));
    else group.add(box([.32, upper + 9.4, .32], [at, (upper + 9.4) / 2, sign * (back + 2.7)], kit.metal), box([.26, .22, 9.5], [at, upper + 9.25, sign * (back - 1.1)], kit.metal));
  }
  const crowdRows = lowPower ? 4 : 7, perRow = Math.floor(length / (lowPower ? 2.4 : 1.55));
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(.34, .72, .28), kit.crowd, crowdRows * perRow), person = new THREE.Object3D();
  let index = 0;
  for (let row = 0; row < crowdRows; row += 1) for (let col = 0; col < perRow; col += 1) {
    const along = -length / 2 + (col + .5) * length / perRow, out = near + .7 + row * depth;
    person.position.set(alongZ ? sign * out : along, 1.45 + row * 1.08, alongZ ? along : sign * out);
    const hiddenByWestAccess = side === "west" && along > -8 && along < 22;
    person.scale.setScalar(hiddenByWestAccess ? 0 : .82 + ((row * 17 + col * 7) % 5) * .045); person.updateMatrix();
    crowd.setMatrixAt(index, person.matrix); crowd.setColorAt(index, new THREE.Color([0x16744f, 0xd8dedb, 0x24312e, 0x0d5139][(row + col) % 4])); index += 1;
  }
  group.add(crowd);
  const rigs = lowPower ? 4 : 7;
  for (let i = 0; i < rigs; i += 1) { const at = -length / 2 + 8 + i * (length - 16) / Math.max(rigs - 1, 1); group.add(alongZ ? box([.22, .16, 3.2], [sign * (back - 7.5), upper + 9.25, at], kit.light) : box([3.2, .16, .22], [at, upper + 9.25, sign * (back - 7.5)], kit.light)); }
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

export function createLandingScene({ container, onReadyChange }: SceneOptions): LandingSceneController {
  const initialWidth = Math.max(container.clientWidth, 1), initialHeight = Math.max(container.clientHeight, 1);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const constrainedDevice =
    (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) ||
    (deviceMemory !== undefined && deviceMemory <= 4);
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
  lowPower ||= softwareRenderer;
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.setClearColor(0x07100d); renderer.shadowMap.enabled = !lowPower; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02; renderer.domElement.className = "landing-scene__canvas"; renderer.domElement.setAttribute("aria-hidden", "true"); renderer.domElement.tabIndex = -1; container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07100d); scene.fog = new THREE.Fog(0x0b1512, 24, lowPower ? 145 : 190);
  const camera = new THREE.PerspectiveCamera(lowPower ? 67 : 58, initialWidth / initialHeight, .08, 240);
  const cameraPath = new THREE.CatmullRomCurve3([-73, -67, -61, -55.5, -50, TUNNEL_EXIT, -38, -29, -15, 0].map(x => new THREE.Vector3(x, 1.72, 0)), false, "centripetal");

  const concrete = new THREE.MeshStandardMaterial({ color: 0x4b504e, roughness: .94 }), dark = new THREE.MeshStandardMaterial({ color: 0x181e1c, roughness: .92 });
  const floorTexture = dressingFloorTexture(lowPower), floor = new THREE.MeshPhysicalMaterial({ color: 0x818582, map: floorTexture, roughness: .69, metalness: .04, clearcoat: .08, clearcoatRoughness: .82 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x202725, roughness: .62, metalness: .34 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x754b30, roughness: .74 }), woodDark = new THREE.MeshStandardMaterial({ color: 0x3d2a20, roughness: .82 }), green = new THREE.MeshStandardMaterial({ color: 0x08754d, roughness: .8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ece8, roughness: .83 });
  const light = new THREE.MeshStandardMaterial({ color: 0xfff1cd, emissive: 0xffd18a, emissiveIntensity: 1.15, roughness: .48 });
  const greenLight = new THREE.MeshStandardMaterial({ color: 0x159563, emissive: 0x08754d, emissiveIntensity: 1.15, roughness: .5 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0x151a19, roughness: .88 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x111615, roughness: .72 });
  const towel = new THREE.MeshStandardMaterial({ color: 0xbfc5c1, roughness: .96 });
  const bottleMat = new THREE.MeshStandardMaterial({color:0x4fb9a8,roughness:.35,transparent:true,opacity:.82});
  const dressingKit: DressingRoomKit = { metal, wood, woodDark, cushion, warmLight: light, greenLight, green, white, boot, towel, bottle: bottleMat };
  const dummy = new THREE.Object3D();

  scene.add(
    box([18,.3,18],[-70,-.15,0],floor),
    box([18,.35,18],[-70,4.35,0],dark),
    box([.35,4.5,18],[-79,2.1,0],concrete),
    box([18,4.5,.35],[-70,2.1,-9],concrete),
    box([18,4.5,.35],[-70,2.1,9],concrete),
    box([.35,4.5,5.7],[ROOM_EXIT,2.1,-6.15],concrete),
    box([.35,4.5,5.7],[ROOM_EXIT,2.1,6.15],concrete),
  );
  // Large matte ceiling panels, seams and paired linear lights create strong lines into the tunnel.
  for (let i = 0; i < 6; i += 1) scene.add(box([2.72, .08, 16.9], [-77.45 + i * 2.98, 4.12, 0], i % 2 ? metal : dark));
  for (const side of [-1, 1]) scene.add(box([16.1, .055, .13], [-70.2, 4.04, side * 4.72], light));
  const spotRims = new THREE.InstancedMesh(new THREE.CylinderGeometry(.13, .13, .035, 12), metal, 6);
  for (let i = 0; i < 6; i += 1) { dummy.position.set(-77 + i * 2.7, 4.04, 0); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); spotRims.setMatrixAt(i, dummy.matrix); } scene.add(spotRims);

  const shirtNumbers = [21,23,26,6,7,8,14], numberMaps = shirtNumbers.map(numberTexture);
  scene.add(createLockerRow(-1, lowPower, dressingKit, numberMaps), createLockerRow(1, lowPower, dressingKit, numberMaps));
  const bottles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075,.085,.32,8),bottleMat,lowPower?6:10);
  for(let i=0;i<bottles.count;i+=1){const side=i%2?-1:1;dummy.position.set(-76+Math.floor(i/2)*2.6,.39,side*7.72);dummy.rotation.set(0,0,0);dummy.updateMatrix();bottles.setMatrixAt(i,dummy.matrix);} scene.add(bottles);

  const crestMap = crestTexture(), crest = new THREE.Mesh(new THREE.CircleGeometry(2.35, 48), new THREE.MeshStandardMaterial({ map: crestMap, transparent: true, roughness: .72, depthWrite: false }));
  crest.rotation.x = -Math.PI / 2; crest.position.set(-69.7, .012, 0); scene.add(crest);
  const tacticsMap = tacticsTexture(); scene.add(createTacticalBoard(tacticsMap, dressingKit));
  const scoreTexture=labelTexture("0 - 0",512,224), scoreMat=new THREE.MeshBasicMaterial({map:scoreTexture});
  const scoreboardFrame=box([.18,1.65,3.6],[-61.2,2.68,5.55],metal);
  const scoreboard=new THREE.Mesh(new THREE.PlaneGeometry(3.3,1.38),scoreMat);scoreboard.position.set(-61.305,2.68,5.55);scoreboard.rotation.y=-Math.PI/2;scene.add(scoreboardFrame,scoreboard);
  const ballTexture=footballTexture(), footballMat = new THREE.MeshStandardMaterial({map:ballTexture,roughness:.72});
  scene.add(createEquipmentArea(lowPower, footballMat, dressingKit));
  // Portal structure is built around the original opening; the walk-out coordinates remain untouched.
  scene.add(
    box([.55,4.55,.58],[ROOM_EXIT-.06,2.15,-3.33],metal,!lowPower),
    box([.55,4.55,.58],[ROOM_EXIT-.06,2.15,3.33],metal,!lowPower),
    box([.55,.58,7.22],[ROOM_EXIT-.06,4.24,0],metal,!lowPower),
    box([.14,3.75,.08],[ROOM_EXIT-.38,2.03,-3.02],greenLight),
    box([.14,3.75,.08],[ROOM_EXIT-.38,2.03,3.02],greenLight),
    box([.14,.08,6.12],[ROOM_EXIT-.38,3.88,0],greenLight),
  );

  const centre=ROOM_EXIT+TUNNEL_LENGTH/2;
  scene.add(box([TUNNEL_LENGTH,.25,6.4],[centre,-.1,0],dark),box([TUNNEL_LENGTH,.28,6.4],[centre,3.9,0],dark),box([TUNNEL_LENGTH,4,.25],[centre,1.9,-3.2],concrete),box([TUNNEL_LENGTH,4,.25],[centre,1.9,3.2],concrete));
  const beams=new THREE.InstancedMesh(new THREE.BoxGeometry(.28,.25,6.5),metal,6), tunnelLights=new THREE.InstancedMesh(new THREE.BoxGeometry(1.8,.08,.32),light,5);
  for(let i=0;i<6;i+=1){const x=ROOM_EXIT+i*TUNNEL_LENGTH/5;dummy.position.set(x,3.7,0);dummy.updateMatrix();beams.setMatrixAt(i,dummy.matrix);if(i<5){dummy.position.x=x+TUNNEL_LENGTH/10;dummy.position.y=3.72;dummy.updateMatrix();tunnelLights.setMatrixAt(i,dummy.matrix);}} scene.add(beams,tunnelLights);
  const bannerTexture=labelTexture("GAFFER",lowPower?512:1024), bannerMat=new THREE.MeshStandardMaterial({map:bannerTexture,emissive:0x062219,emissiveIntensity:.22,roughness:.7});
  for(const side of [-1,1]) for(const x of [-57.5,-51.2,-46.2]){const banner=box([4.5,1.15,.1],[x,2.05,side*3.055],bannerMat);if(side>0)banner.rotation.y=Math.PI;scene.add(banner);}
  scene.add(box([.5,4.55,.55],[TUNNEL_EXIT,2.15,-3.3],metal),box([.5,4.55,.55],[TUNNEL_EXIT,2.15,3.3],metal),box([.5,.55,7.15],[TUNNEL_EXIT,4.25,0],metal),box([10.5,.18,6.4],[-39.25,-.04,0],dark));

  const grassTexture=pitchTexture(lowPower);grassTexture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),lowPower?2:8);const grassMat=new THREE.MeshStandardMaterial({map:grassTexture,roughness:.96});const pitch=new THREE.Mesh(new THREE.PlaneGeometry(68,105),grassMat);pitch.rotation.x=-Math.PI/2;pitch.receiveShadow=true;scene.add(pitch);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(.22,lowPower?12:18,lowPower?8:12),footballMat);ball.position.set(0,.225,0);ball.rotation.set(.16,-.5,.08);ball.castShadow=!lowPower;scene.add(ball);
  const glass=new THREE.MeshPhysicalMaterial({color:0xb9d8d0,roughness:.24,transparent:true,opacity:.25,side:THREE.DoubleSide}),dugout=new THREE.Group();dugout.position.set(-39.2,0,13.5);dugout.add(box([2.8,.3,13],[0,.15,0],dark),box([.3,3.2,13],[-1.25,1.75,0],glass),box([2.8,.32,13],[0,3.25,0],metal));scene.add(dugout);
  const adTransforms:Array<[number,number,number,number]>=[];for(let z=-45;z<=45;z+=6.3){if(z<-6||z>21)adTransforms.push([-35.6,.65,z,Math.PI/2]);adTransforms.push([35.6,.65,z,-Math.PI/2]);}for(let x=-29;x<=29;x+=6.3)adTransforms.push([x,.65,-54.2,0],[x,.65,54.2,Math.PI]);
  const ads=new THREE.InstancedMesh(new THREE.BoxGeometry(5.8,1.1,.35),bannerMat,adTransforms.length);adTransforms.forEach(([x,y,z,r],i)=>{dummy.position.set(x,y,z);dummy.rotation.y=r;dummy.updateMatrix();ads.setMatrixAt(i,dummy.matrix);});scene.add(ads);
  const stand=new THREE.MeshStandardMaterial({color:0x17201e,roughness:.91}),standConcrete=new THREE.MeshStandardMaterial({color:0x59615e,roughness:.96}),crowd=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.94,vertexColors:true});
  const kit={structure:stand,concrete:standConcrete,seat:green,crowd,metal,light};scene.add(stadiumStand("west",lowPower,kit),stadiumStand("east",lowPower,kit),stadiumStand("north",lowPower,kit),stadiumStand("south",lowPower,kit));
  const goalMat=new THREE.MeshStandardMaterial({color:0xe8efeb,roughness:.62,metalness:.18});
  const netMat=new THREE.LineBasicMaterial({color:0xdce8e2,transparent:true,opacity:.48});
  scene.add(footballGoal(-1,goalMat,netMat),footballGoal(1,goalMat,netMat));
  const skyMat=new THREE.ShaderMaterial({uniforms:{topColor:{value:new THREE.Color(0x07131c)},bottomColor:{value:new THREE.Color(0x354c40)}},vertexShader:`varying vec3 v;void main(){vec4 p=modelMatrix*vec4(position,1.);v=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`uniform vec3 topColor;uniform vec3 bottomColor;varying vec3 v;void main(){float h=clamp(normalize(v+vec3(0.,28.,0.)).y,0.,1.);gl_FragColor=vec4(mix(bottomColor,topColor,pow(h,.7)),1.);}`,side:THREE.BackSide,fog:false,depthWrite:false});scene.add(new THREE.Mesh(new THREE.SphereGeometry(210,lowPower?16:24,lowPower?10:16),skyMat));
  scene.add(new THREE.HemisphereLight(0xaecbc4,0x17201b,.58));const sun=new THREE.DirectionalLight(0xd8e8df,1.08);sun.position.set(-18,56,24);sun.castShadow=!lowPower;sun.shadow.mapSize.set(lowPower?512:1536,lowPower?512:1536);sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=75;sun.shadow.camera.bottom=-75;sun.shadow.camera.far=150;scene.add(sun,sun.target);
  const roomLight=new THREE.PointLight(0xffdfaa,.34,22,2);roomLight.position.set(-70,3.45,0);
  const lockerLightLeft=new THREE.PointLight(0xffc978,.38,10,2);lockerLightLeft.position.set(-70.8,2.7,-5.7);
  const lockerLightRight=new THREE.PointLight(0xffc978,.38,10,2);lockerLightRight.position.set(-70.8,2.7,5.7);
  const portalLight=new THREE.PointLight(0x38bb82,.32,9,2);portalLight.position.set(ROOM_EXIT-.65,2.35,0);
  const exitLight=new THREE.PointLight(0xcaf2df,.78,22,2);exitLight.position.set(TUNNEL_EXIT+1.5,3.6,0);scene.add(roomLight,lockerLightLeft,lockerLightRight,portalLight,exitLight);

  const position=new THREE.Vector3(),target=new THREE.Vector3(),direction=new THREE.Vector3();let targetProgress=0,currentProgress=0,active=true,paused=false,disposed=false,readySent=false,frame=0;
  const updateTarget=()=>{targetProgress=THREE.MathUtils.clamp(window.scrollY/Math.max(document.documentElement.scrollHeight-window.innerHeight,1),0,1);if(active&&!paused)start();};
  const updateCamera=(progress:number)=>{cameraPath.getPointAt(progress,position);if(!reducedMotion)position.y+=Math.sin(progress*Math.PI*30)*.014;camera.position.copy(position);
    // Once fully outside, pan across the complete right side, then finish on the left stand.
    const rightSweep=smooth(.58,.73,progress),leftSweep=smooth(.76,.98,progress);
    const yaw=reducedMotion?0:rightSweep*1.12-leftSweep*2.18;
    direction.set(Math.cos(yaw),smooth(.58,.78,progress)*.06,Math.sin(yaw));target.copy(position).addScaledVector(direction,18);camera.lookAt(target);};
  const render=()=>{if(disposed)return;renderer.render(scene,camera);if(!readySent){readySent=true;onReadyChange(true);}};
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;};
  const animate=()=>{frame=0;if(disposed||paused||!active)return;const difference=targetProgress-currentProgress;currentProgress+=difference*(reducedMotion?1:lowPower?.12:.095);if(Math.abs(difference)<.00008)currentProgress=targetProgress;updateCamera(currentProgress);render();if(currentProgress!==targetProgress)frame=requestAnimationFrame(animate);};
  function start(){if(!frame&&!disposed&&active&&!paused)frame=requestAnimationFrame(animate);}
  const resize=()=>{if(disposed)return;const width=Math.max(container.clientWidth,1),height=Math.max(container.clientHeight,1);lowPower=width<768||constrainedDevice||softwareRenderer;const cap=lowPower?1.15:width<1280?1.4:1.7,budget=lowPower?900000:width<1280?1500000:2400000;renderer.setPixelRatio(Math.max(.75,Math.min(window.devicePixelRatio||1,cap,Math.sqrt(budget/(width*height)))));renderer.setSize(width,height,false);camera.aspect=width/height;camera.fov=lowPower?67:width<1100?62:58;camera.updateProjectionMatrix();updateCamera(currentProgress);render();};
  const lost=(event:Event)=>{event.preventDefault();stop();onReadyChange(false);},restored=()=>{readySent=false;resize();};renderer.domElement.addEventListener("webglcontextlost",lost);renderer.domElement.addEventListener("webglcontextrestored",restored);window.addEventListener("scroll",updateTarget,{passive:true});updateTarget();currentProgress=targetProgress;resize();
  return {resize,setActive(value){active=value;if(active)start();else stop();},setPaused(value){paused=value;if(paused)stop();else start();},updateTheme(){renderer.toneMappingExposure=document.documentElement.classList.contains("dark")?.94:1.04;render();},dispose(){if(disposed)return;disposed=true;stop();window.removeEventListener("scroll",updateTarget);renderer.domElement.removeEventListener("webglcontextlost",lost);renderer.domElement.removeEventListener("webglcontextrestored",restored);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();scene.traverse(object=>{if(!(object instanceof THREE.Mesh||object instanceof THREE.InstancedMesh||object instanceof THREE.LineSegments))return;geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));});geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());grassTexture.dispose();floorTexture.dispose();crestMap.dispose();tacticsMap.dispose();numberMaps.forEach(value=>value.dispose());bannerTexture.dispose();scoreTexture.dispose();ballTexture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();onReadyChange(false);}};
}
