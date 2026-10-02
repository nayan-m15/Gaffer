import * as THREE from "three";

// Metres. X follows the 105m playing length, Z the 68m playing width.
// A rounded rectangle keeps straight touchline stands and flowing corners.
const SEGMENTS = 256;
const path = new THREE.Path();
path.moveTo(44, 42);
path.lineTo(-44, 42);
path.absarc(-44, 26, 16, Math.PI / 2, Math.PI, false);
path.lineTo(-60, -26);
path.absarc(-44, -26, 16, Math.PI, Math.PI * 1.5, false);
path.lineTo(44, -42);
path.absarc(44, -26, 16, Math.PI * 1.5, Math.PI * 2, false);
path.lineTo(60, 26);
path.absarc(44, 26, 16, 0, Math.PI / 2, false);
const perimeter = path.getLength();
const samples = path.getSpacedPoints(SEGMENTS);
const normals = samples.slice(0, SEGMENTS).map((_, i) => {
  const before = samples[(i + SEGMENTS - 1) % SEGMENTS];
  const after = samples[(i + 1) % SEGMENTS];
  return new THREE.Vector2(after.y - before.y, before.x - after.x).normalize();
});
function point(index: number, offset: number, y: number) {
  const i = ((index % SEGMENTS) + SEGMENTS) % SEGMENTS;
  return new THREE.Vector3(samples[i].x + normals[i].x * offset, y, samples[i].y + normals[i].y * offset);
}
function yaw(index: number) {
  const n = normals[((index % SEGMENTS) + SEGMENTS) % SEGMENTS];
  return Math.atan2(n.x, n.y);
}

/** All repeated architecture uses shared unit boxes and one draw per material. */
class StructureBatch {
  private batches = new Map<THREE.Material, THREE.Matrix4[]>();
  private transform = new THREE.Object3D();
  private direction = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  box(material: THREE.Material, position: THREE.Vector3, size: THREE.Vector3, rotation = 0) {
    this.transform.position.copy(position);
    this.transform.rotation.set(0, rotation, 0);
    this.transform.scale.copy(size);
    this.transform.updateMatrix();
    this.push(material);
  }
  beam(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, width: number) {
    this.direction.subVectors(b, a);
    this.transform.position.copy(a).add(b).multiplyScalar(0.5);
    this.transform.quaternion.setFromUnitVectors(this.up, this.direction.clone().normalize());
    this.transform.scale.set(width, this.direction.length(), width);
    this.transform.updateMatrix();
    this.push(material);
  }
  private push(material: THREE.Material) {
    const list = this.batches.get(material) ?? [];
    list.push(this.transform.matrix.clone());
    this.batches.set(material, list);
  }
  finish(group: THREE.Group) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    this.batches.forEach((matrices, material) => {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      // r128 cannot compute instance bounds; don't cull using the unit-box bound.
      mesh.frustumCulled = false;
      mesh.castShadow = material instanceof THREE.MeshStandardMaterial && !material.transparent;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    this.batches.clear();
  }
}

function strip(profile: Array<[number, number]>, material: THREE.Material, group: THREE.Group, name: string, tunnel = false, portals?: { offset: number; y: number; run: number; rise: number }) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row < profile.length; row++) {
    for (let i = 0; i <= SEGMENTS; i++) {
      const p = point(i, profile[row][0], profile[row][1]);
      positions.push(p.x, p.y, p.z);
      uv.push(i / SEGMENTS, row / (profile.length - 1));
    }
  }
  for (let row = 0; row < profile.length - 1; row++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = row * (SEGMENTS + 1) + i, b = a + SEGMENTS + 1;
      const p = point(i, profile[row][0], profile[row][1]);
      if (tunnel && p.z < -41 && Math.abs(p.x) < 3.8 && p.y < 5) continue;
      if (portals && i % 32 >= 10 && i % 32 <= 13 && profile[row][0] >= portals.offset + 7 * portals.run && profile[row][0] < portals.offset + 11 * portals.run) continue;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Stadium canvas context unavailable");
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function pitchTexture() {
  return canvasTexture(2048, 1408, (ctx) => {
    // Texture includes a narrow grass run-off: line dimensions stay exact.
    const w = 112, h = 77, sx = 2048 / w, sz = 1408 / h;
    ctx.fillStyle = "#246022";
    ctx.fillRect(0, 0, 2048, 1408);
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = i % 2 ? "#2f7a2c" : "#296b26";
      ctx.fillRect((3.5 + i * 5.25) * sx, 4.5 * sz, 5.25 * sx, 68 * sz);
    }
    const image = ctx.getImageData(0, 0, 2048, 1408);
    let seed = 571;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const v = ((seed >>> 24) / 255 - 0.5) * 9;
      image.data[i] += v;
      image.data[i + 1] += v;
      image.data[i + 2] += v * 0.6;
    }
    ctx.putImageData(image, 0, 0);
    ctx.save();
    ctx.scale(sx, sz);
    ctx.translate(56, 38.5);
    ctx.strokeStyle = "#e5ebdf";
    ctx.fillStyle = "#e5ebdf";
    ctx.lineWidth = 0.12;
    ctx.strokeRect(-52.5, -34, 105, 68);
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, 34); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 9.15, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.18, 0, Math.PI * 2); ctx.fill();
    for (const sign of [-1, 1]) {
      ctx.strokeRect(sign < 0 ? -52.5 : 36, -20.16, 16.5, 40.32);
      ctx.strokeRect(sign < 0 ? -52.5 : 47, -9.16, 5.5, 18.32);
      ctx.beginPath(); ctx.arc(sign * 41.5, 0, 0.18, 0, Math.PI * 2); ctx.fill();
      const angle = Math.acos(5.5 / 9.15);
      ctx.beginPath();
      ctx.arc(sign * 41.5, 0, 9.15, sign < 0 ? -angle : Math.PI - angle, sign < 0 ? angle : Math.PI + angle);
      ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.beginPath();
        const start = sign < 0 ? side < 0 ? 0 : -Math.PI / 2 : side < 0 ? Math.PI / 2 : Math.PI;
        ctx.arc(sign * 52.5, side * 34, 1, start, start + Math.PI / 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

export function buildStadium(maxAnisotropy: number) {
  const group = new THREE.Group();
  group.name = "Gaffer stadium / metres";
  const batch = new StructureBatch();
  const material = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness, metalness, side: THREE.DoubleSide });
  const concrete = material(0x667078, 0.96);
  const riser = material(0x454f56, 0.94);
  const graphite = material(0x17212b, 0.58, 0.45);
  const steel = material(0x9eabb6, 0.38, 0.72);
  const roofMat = material(0x78838d, 0.64, 0.4);
  const roofGlass = material(0xa2bcc6, 0.37, 0.25);
  const seatMat = material(0xffffff, 0.72, 0.05);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x6d9ba7, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
  const interior = material(0x8b7659, 0.9);
  interior.emissive.set(0xffc782).convertSRGBToLinear();
  const loungeLamp = material(0xffd59f, 0.8);
  loungeLamp.emissive.set(0xffbd70).convertSRGBToLinear();
  const roomTexture = canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = "#5f5140"; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#a08a65"; ctx.fillRect(25, 24, 206, 64);
    ctx.fillStyle = "#242b30"; ctx.fillRect(0, 0, 256, 17); ctx.fillRect(0, 100, 256, 28);
    ctx.fillStyle = "#3b3732"; ctx.fillRect(36, 62, 42, 35); ctx.fillRect(150, 62, 55, 35);
  });
  roomTexture.wrapS = THREE.RepeatWrapping;
  roomTexture.repeat.x = 64;
  interior.map = roomTexture;
  interior.emissiveMap = roomTexture;
  const lamp = material(0xf5f7ff, 0.35, 0.1);
  lamp.emissive.set(0xdde9ff);
  const accent = material(0x00d99a, 0.48, 0.15);
  accent.emissive.set(0x00d99a);
  const white = material(0xe5e9e5, 0.42, 0.2);
  const turf = pitchTexture();
  turf.anisotropy = Math.min(maxAnisotropy, 8);
  const pitchMat = new THREE.MeshStandardMaterial({ map: turf, roughness: 1 });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(112, 77), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.03;
  pitch.receiveShadow = true;
  pitch.name = "105 x 68m pitch with regulation markings";
  group.add(pitch);
  batch.box(riser, new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(230, 0.5, 190));
  strip([[-1.5, 0.04], [0, 0.04]], concrete, group, "Perimeter access walkway");
  strip([[0, 0.1], [0, 1.2]], graphite, group, "Pitch retaining wall");

  // Stepped concrete decks and real human-scale seat shells. Aisles align
  // between tiers; vomitories remove seats rather than covering them up.
  const seatTransforms: THREE.Matrix4[] = [], seatColors: THREE.Color[] = [];
  const seatTransform = new THREE.Object3D();
  const charcoal = new THREE.Color(0x26343d).convertSRGBToLinear(), neutral = new THREE.Color(0x78878e).convertSRGBToLinear(), green = new THREE.Color(0x008f6c).convertSRGBToLinear();
  const tiers = [
    { name: "Lower bowl", offset: 0, y: 1.3, rows: 24, run: 0.82, rise: 0.52 },
    { name: "Club seats", offset: 23, y: 18.8, rows: 5, run: 0.85, rise: 0.48 },
    { name: "Upper bowl", offset: 30, y: 25.2, rows: 30, run: 0.84, rise: 0.65 },
  ];
  tiers.forEach((tier, tierIndex) => {
    const profile: Array<[number, number]> = [];
    for (let row = 0; row < tier.rows; row++) {
      const offset = tier.offset + row * tier.run;
      const y = tier.y + row * tier.rise;
      profile.push([offset, y], [offset + tier.run, y]);
      if (row < tier.rows - 1) profile.push([offset + tier.run, y + tier.rise]);
      // Offset perimeter grows by 2pi per metre; keep seat spacing ~0.54m.
      const count = Math.floor((perimeter + Math.PI * 2 * (offset + 0.42)) / 0.56);
      for (let seat = 0; seat < count; seat++) {
        const u = seat / count, section = Math.floor(u * 32);
        const aisle = Math.abs(((u * 32 + 0.5) % 1) - 0.5) < 0.062;
        const i = Math.floor(u * SEGMENTS);
        const p = point(i, offset + 0.48, y + 0.52);
        // Main-stand tunnel, plus repeating access portals every four blocks.
        const tunnel = tierIndex === 0 && p.z < -41 && Math.abs(p.x) < 3.4 && row < 12;
        const portal = tierIndex !== 1 && section % 4 === 1 && row >= 7 && row <= 10 && Math.abs(((u * 32) % 1) - 0.5) < 0.2;
        if (aisle || tunnel || portal) continue;
        // Interpolate the perimeter to avoid stacking seats at sample points.
        const next = point(i + 1, offset + 0.48, y + 0.52);
        p.lerp(next, u * SEGMENTS - i);
        seatTransform.position.copy(p);
        seatTransform.rotation.set(0, yaw(i), 0);
        seatTransform.scale.set(1, 1, 1);
        seatTransform.updateMatrix();
        seatTransforms.push(seatTransform.matrix.clone());
        const accentBlock = section % 8 === 3 && row > 3 && row < tier.rows - 3;
        seatColors.push(accentBlock ? green : (section + row) % 17 === 0 ? neutral : charcoal);
      }
    }
    strip(profile, riser, group, tier.name + " stepped terraces", tierIndex === 0, tierIndex === 1 ? undefined : tier);
    // Each stair flight has twice as many smaller steps as the seating rows.
    for (let block = 0; block < 32; block++) {
      const i = Math.round(block * SEGMENTS / 32);
      for (let step = 0; step < tier.rows * 2; step++) {
        batch.box(concrete, point(i, tier.offset + (step + 0.5) * tier.run / 2, tier.y + step * tier.rise / 2 + 0.05), new THREE.Vector3(1.35, 0.1, tier.run / 2), yaw(i));
      }
      batch.beam(steel, point(i, tier.offset, tier.y + 1), point(i, tier.offset + tier.rows * tier.run, tier.y + tier.rows * tier.rise + 1), 0.045);
      for (let r = 0; r < tier.rows; r += 4) {
        batch.beam(steel, point(i, tier.offset + r * tier.run, tier.y + r * tier.rise), point(i, tier.offset + r * tier.run, tier.y + r * tier.rise + 1), 0.05);
      }
    }
  });
  // Six triangles per shell rather than 24 for two solid boxes. Real seat
  // spacing and folded backs still read at background distance.
  const seatGeometry = new THREE.BufferGeometry();
  seatGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -.23, 0, -.24, .23, 0, -.24, -.23, 0, .19, .23, 0, .19,
    -.23, .4, .24, .23, .4, .24,
    -.23, -.08, -.24, .23, -.08, -.24,
  ], 3));
  seatGeometry.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 0, 1, 6, 1, 7, 6]);
  seatGeometry.computeVertexNormals();
  const seats = new THREE.InstancedMesh(seatGeometry, seatMat, seatTransforms.length);
  seats.name = `${seatTransforms.length} instanced seats`;
  seatTransforms.forEach((matrix, i) => { seats.setMatrixAt(i, matrix); seats.setColorAt(i, seatColors[i]); });
  seats.instanceMatrix.needsUpdate = true;
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
  seats.frustumCulled = false;
  seats.receiveShadow = true;
  group.add(seats);

  // Retain the old scene's lightweight, seeded crowd idea as a single batch
  // of seated silhouettes. Alpha testing avoids sorting transparent people.
  const crowdTexture = canvasTexture(64, 128, (ctx) => {
    ctx.clearRect(0, 0, 64, 128);
    ctx.fillStyle = "#dedcd5";
    ctx.beginPath(); ctx.moveTo(13, 125); ctx.lineTo(15, 55); ctx.quadraticCurveTo(32, 40, 49, 55); ctx.lineTo(51, 125); ctx.fill();
    ctx.fillStyle = "#c99c79"; ctx.beginPath(); ctx.ellipse(32, 28, 11, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#252a2d"; ctx.beginPath(); ctx.ellipse(32, 19, 11, 6, 0, Math.PI, Math.PI * 2); ctx.fill();
  });
  const crowdMaterial = new THREE.MeshStandardMaterial({ map: crowdTexture, alphaTest: 0.45, roughness: 1, side: THREE.DoubleSide });
  const crowdMatrices: THREE.Matrix4[] = [];
  const crowdColors: THREE.Color[] = [];
  const crowdPalette = [0x48525c, 0x728079, 0x566a77, 0x8e8170, 0x26493e, 0xa3a8a2, 0x49545d].map((hex) => new THREE.Color(hex).convertSRGBToLinear());
  seatTransforms.forEach((matrix, i) => {
    if ((Math.imul(i + 11, 1664525) >>> 0) % 11 > 6) return;
    seatTransform.matrix.copy(matrix);
    seatTransform.matrix.decompose(seatTransform.position, seatTransform.quaternion, seatTransform.scale);
    seatTransform.position.y += 0.45;
    seatTransform.scale.set(0.45, 0.85, 1);
    seatTransform.updateMatrix();
    crowdMatrices.push(seatTransform.matrix.clone());
    crowdColors.push(crowdPalette[i % crowdPalette.length]);
  });
  const crowd = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), crowdMaterial, crowdMatrices.length);
  crowdMatrices.forEach((matrix, i) => { crowd.setMatrixAt(i, matrix); crowd.setColorAt(i, crowdColors[i]); });
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  crowd.frustumCulled = false;
  crowd.name = `${crowdMatrices.length} static instanced spectators`;
  group.add(crowd);

  // Hospitality is a deep gallery: floor, rear wall, ceiling, furniture,
  // warm recess lighting and mullions sit behind a continuous glazed front.
  strip([[19.7, 13.8], [19.7, 18.3]], glass, group, "Smoked-glass executive suites");
  strip([[19.8, 13.5], [27, 13.5]], concrete, group, "Hospitality floor");
  strip([[27, 13.5], [27, 18.6]], interior, group, "Warm suite interiors");
  strip([[19.6, 18.5], [28, 18.5]], graphite, group, "Hospitality overhang");
  strip([[27.6, 21.2], [27.6, 24]], graphite, group, "Upper concourse fascia");
  strip([[55.5, 44.1], [55.5, 48]], graphite, group, "Rear bowl enclosure");
  for (let i = 0; i < SEGMENTS; i += 4) {
    batch.box(graphite, point(i, 19.7, 16.1), new THREE.Vector3(0.15, 4.5, 0.2), yaw(i));
    batch.box(loungeLamp, point(i, 23.3, 18.2), new THREE.Vector3(3.2, 0.09, 0.24), yaw(i));
    batch.box(graphite, point(i, 24, 14.5), new THREE.Vector3(1.7, 0.8, 0.7), yaw(i));
    batch.box(concrete, point(i, 28, 23.3), new THREE.Vector3(0.45, 4, 0.7), yaw(i));
    batch.box(graphite, point(i, 28.1, 22.8), new THREE.Vector3(3.4, 2.2, 0.4), yaw(i));
    if (i % 32 === 8) {
      for (const tier of [tiers[0], tiers[2]]) {
        const offset = tier.offset + 7 * tier.run;
        const y = tier.y + 7 * tier.rise;
        batch.box(graphite, point(i + 4, offset + 0.1, y + 0.9), new THREE.Vector3(3.8, 1.8, 0.12), yaw(i + 4));
        batch.box(concrete, point(i + 4, offset, y + 1.9), new THREE.Vector3(4.3, 0.25, 0.45), yaw(i + 4));
      }
    }
  }
  // Main stand has a second gallery, expressing deliberate asymmetry.
  for (let x = -36; x <= 36; x += 6) {
    batch.box(interior, new THREE.Vector3(x, 23.1, -71.1), new THREE.Vector3(5.7, 2.1, 3));
    batch.box(glass, new THREE.Vector3(x, 23.1, -69.5), new THREE.Vector3(5.6, 2, 0.12));
    batch.box(graphite, new THREE.Vector3(x - 3, 23.1, -69.4), new THREE.Vector3(0.18, 2.8, 0.3));
  }

  // Radial cantilever trusses carry a faceted canopy, leaving the entire
  // pitch open. The three chords and triangulation provide visible depth.
  strip([[12, 48.4], [23, 49.6]], roofGlass, group, "Translucent inner canopy");
  strip([[23, 49.6], [42, 52.4], [60, 51.3]], roofMat, group, "Folded metal canopy");
  strip([[60, 48.2], [60, 51.3]], graphite, group, "Outer roof fascia");
  for (const offset of [12, 23, 42, 60]) {
    const y = offset === 12 ? 48.3 : offset === 23 ? 49.5 : offset === 42 ? 52.3 : 51.2;
    for (let i = 0; i < SEGMENTS; i++) batch.beam(steel, point(i, offset, y), point(i + 1, offset, y), 0.16);
  }
  for (let i = 0; i < SEGMENTS; i += 4) {
    const inner = point(i, 12, 47.5), outer = point(i, 60, 50.5);
    batch.beam(steel, inner, outer, 0.28);
    batch.beam(graphite, point(i, 12, 45.5), point(i, 60, 47.8), 0.22);
    batch.beam(steel, point(i, 12, 45.5), inner, 0.18);
    for (let cell = 0; cell < 6; cell++) {
      const o = 12 + cell * 8;
      const topA = point(i, o, 47.5 + cell * 0.5);
      const lowB = point(i, o + 8, 45.5 + (cell + 1) * 0.38);
      batch.beam(steel, topA, lowB, 0.12);
      batch.beam(steel, lowB, point(i, o + 8, 47.5 + (cell + 1) * 0.5), 0.12);
    }
    if (i % 8 === 0) {
      batch.beam(graphite, point(i, 59, 0), point(i, 59, 50), 0.65);
      batch.beam(steel, point(i, 59, 38), point(i, 42, 49), 0.28);
      batch.beam(steel, point(i, 22, 49.3), point(i + 8, 42, 51.8), 0.1);
      // Lighting housings are fixed to the inner chord, facing the field.
      batch.box(graphite, point(i, 12.3, 45.6), new THREE.Vector3(4.8, 0.45, 0.85), yaw(i));
      for (let bulb = 0; bulb < 6; bulb++) {
        const p = point(i, 12, 45.35);
        p.x += Math.cos(yaw(i)) * (bulb - 2.5) * 0.72;
        p.z -= Math.sin(yaw(i)) * (bulb - 2.5) * 0.72;
        batch.box(lamp, p, new THREE.Vector3(0.51, 0.16, 0.6), yaw(i));
      }
      batch.box(graphite, point(i, 14, 44), new THREE.Vector3(0.65, 1.5, 0.8), yaw(i)); // speakers
    }
  }

  const brandTextures = [true, false].map((text) => canvasTexture(512, 64, (ctx) => {
    ctx.fillStyle = "#0b1218"; ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = "#00d99a"; ctx.fillRect(0, 59, 512, 3);
    if (text) {
      ctx.fillStyle = "#e8fff7"; ctx.font = "800 42px Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GAFFER", 256, 32);
    } else {
      ctx.strokeStyle = "#00d99a"; ctx.lineWidth = 8;
      for (let x = -64; x < 560; x += 95) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 64); ctx.stroke(); }
    }
  }));
  const ledMaterials = brandTextures.map((map) => new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.6 }));
  // A front-only display avoids mirrored text on box endcaps.
  const panelGeometry = new THREE.PlaneGeometry(1, 1);
  const panelMatrices: THREE.Matrix4[][] = [[], []];
  const panelTransform = new THREE.Object3D();
  function panel(type: number, p: THREE.Vector3, width: number, height: number, rotation: number) {
    panelTransform.position.copy(p); panelTransform.rotation.set(0, rotation, 0);
    panelTransform.scale.set(width, height, 1); panelTransform.updateMatrix();
    panelMatrices[type].push(panelTransform.matrix.clone());
  }
  for (const z of [-38.7, 38.7]) {
    for (let index = 0; index < 14; index++) {
      const x = -48.75 + index * 7.5;
      if (z < 0 && Math.abs(x) < 21) continue; // tunnel / two dugouts / technical areas
      batch.box(graphite, new THREE.Vector3(x, 0.55, z), new THREE.Vector3(7.3, 1.1, 0.28));
      panel(index % 2, new THREE.Vector3(x, 0.55, z + (z < 0 ? 0.15 : -0.15)), 7.25, 1, z < 0 ? 0 : Math.PI);
    }
  }
  for (const x of [-57, 57]) {
    for (let index = 0; index < 8; index++) {
      const z = -28 + index * 8;
      if (Math.abs(z) < 6) continue; // goal support / net clearance
      batch.box(graphite, new THREE.Vector3(x, 0.55, z), new THREE.Vector3(0.28, 1.1, 7.8));
      panel(index % 2, new THREE.Vector3(x + (x < 0 ? 0.15 : -0.15), 0.55, z), 7.75, 1, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  // Ribbon panels follow the same bowl path, with joints matching suite bays.
  strip([[19.4, 12.5], [19.4, 13.5]], graphite, group, "Continuous LED ribbon backing");
  for (let i = 0; i < SEGMENTS; i += 2) {
    const a = point(i, 19.25, 13), b = point(i + 2, 19.25, 13);
    panel(Math.floor(i / 8) % 2, a.clone().add(b).multiplyScalar(0.5), a.distanceTo(b) + 0.04, 0.85, yaw(i + 1) + Math.PI);
  }
  panelMatrices.forEach((matrices, type) => {
    const mesh = new THREE.InstancedMesh(panelGeometry, ledMaterials[type], matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false;
    mesh.name = type === 0 ? "GAFFER LED panels" : "Abstract brand LED panels";
    group.add(mesh);
  });

  // Proper tunnel depth, no seating over the portal; stairs are replaced here.
  batch.box(graphite, new THREE.Vector3(0, 2.2, -51), new THREE.Vector3(6.5, 4.4, 0.2));
  batch.box(riser, new THREE.Vector3(0, 0.05, -46.2), new THREE.Vector3(6.5, 0.1, 10));
  batch.box(concrete, new THREE.Vector3(-3.45, 2.3, -45), new THREE.Vector3(0.5, 4.6, 9));
  batch.box(concrete, new THREE.Vector3(3.45, 2.3, -45), new THREE.Vector3(0.5, 4.6, 9));
  batch.box(concrete, new THREE.Vector3(0, 4.75, -45), new THREE.Vector3(7.4, 0.5, 9));
  batch.box(accent, new THREE.Vector3(0, 4.42, -41.8), new THREE.Vector3(6.3, 0.08, 0.12));
  for (const z of [-44, -47, -50]) batch.box(lamp, new THREE.Vector3(0, 4.4, z), new THREE.Vector3(1.2, 0.1, 0.2));
  for (const side of [-1, 1]) {
    batch.beam(steel, new THREE.Vector3(side * 3.5, 1, -42), new THREE.Vector3(side * 3.5, 1, -37.3), 0.06);
    for (const z of [-42, -39, -37.3]) batch.beam(steel, new THREE.Vector3(side * 3.5, 0, z), new THREE.Vector3(side * 3.5, 1, z), 0.06);
    const x = side * 12;
    batch.box(concrete, new THREE.Vector3(x, 0.15, -40), new THREE.Vector3(10, 0.3, 3));
    batch.box(graphite, new THREE.Vector3(x, 2.5, -40), new THREE.Vector3(10, 0.18, 3.2));
    batch.box(glass, new THREE.Vector3(x, 1.35, -41.5), new THREE.Vector3(9.8, 2.2, 0.1));
    for (const end of [-1, 1]) {
      batch.box(glass, new THREE.Vector3(x + end * 4.9, 1.35, -40), new THREE.Vector3(0.1, 2.2, 3));
      batch.box(steel, new THREE.Vector3(x + end * 4.9, 1.35, -38.6), new THREE.Vector3(0.08, 2.4, 0.08));
    }
    for (let seat = 0; seat < 14; seat++) {
      const sx = x - 4.2 + seat * 0.64;
      batch.box(graphite, new THREE.Vector3(sx, 0.7, -40), new THREE.Vector3(0.5, 0.12, 0.5));
      batch.box(graphite, new THREE.Vector3(sx, 1.05, -40.3), new THREE.Vector3(0.5, 0.65, 0.1));
    }
  }
  // Technical-area and goal-net line segments share one draw each.
  const technical: number[] = [];
  function line(list: number[], a: THREE.Vector3, b: THREE.Vector3) { list.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  for (const x of [-12, 12]) {
    const corners = [[x - 5.6, -37.7], [x - 5.6, -35.5], [x + 5.6, -35.5], [x + 5.6, -37.7]];
    for (let i = 0; i < 3; i++) line(technical, new THREE.Vector3(corners[i][0], 0.06, corners[i][1]), new THREE.Vector3(corners[i + 1][0], 0.06, corners[i + 1][1]));
  }
  const netLines: number[] = [];
  for (const sign of [-1, 1]) {
    const x = sign * 52.5, backX = sign * 54.6;
    for (const z of [-3.66, 3.66]) {
      batch.beam(white, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 2.44, z), 0.12);
      batch.beam(white, new THREE.Vector3(x, 2.44, z), new THREE.Vector3(backX, 2.25, z), 0.065);
      batch.beam(white, new THREE.Vector3(backX, 0, z), new THREE.Vector3(backX, 2.25, z), 0.065);
      for (let h = 0; h <= 2.25; h += 0.15) line(netLines, new THREE.Vector3(x, h, z), new THREE.Vector3(backX, h, z));
      for (let d = 0; d <= 2.1; d += 0.15) line(netLines, new THREE.Vector3(x + sign * d, 0, z), new THREE.Vector3(x + sign * d, 2.44 - d * 0.09, z));
    }
    batch.beam(white, new THREE.Vector3(x, 2.44, -3.66), new THREE.Vector3(x, 2.44, 3.66), 0.12);
    for (let z = -3.66; z <= 3.66; z += 0.15) {
      line(netLines, new THREE.Vector3(backX, 0, z), new THREE.Vector3(backX, 2.25, z));
      line(netLines, new THREE.Vector3(x, 2.44, z), new THREE.Vector3(backX, 2.25, z));
    }
    for (let h = 0; h <= 2.25; h += 0.15) line(netLines, new THREE.Vector3(backX, h, -3.66), new THREE.Vector3(backX, h, 3.66));
    for (const side of [-1, 1]) {
      batch.beam(white, new THREE.Vector3(x, 0, side * 34), new THREE.Vector3(x, 1.5, side * 34), 0.035);
      batch.box(accent, new THREE.Vector3(x + sign * 0.17, 1.35, side * 34), new THREE.Vector3(0.35, 0.25, 0.02));
    }
  }
  for (const [list, opacity, name] of [[netLines, 0.45, "Goal nets"], [technical, 0.8, "Technical areas"]] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
    const mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xe6efe7, transparent: true, opacity }));
    mesh.name = name; group.add(mesh);
  }

  const screenTexture = canvasTexture(1024, 512, (ctx) => {
    ctx.fillStyle = "#0b1218"; ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = "#00d99a"; ctx.fillRect(46, 45, 5, 420);
    ctx.fillStyle = "#effff9"; ctx.font = "800 105px Arial"; ctx.fillText("GAFFER", 94, 155);
    ctx.font = "500 26px Arial"; ctx.fillStyle = "#9badae"; ctx.fillText("THE HOME OF YOUR GAME", 98, 203);
    ctx.strokeStyle = "#00d99a"; ctx.lineWidth = 3; ctx.strokeRect(95, 257, 505, 194);
    ctx.beginPath(); ctx.moveTo(348, 257); ctx.lineTo(348, 451); ctx.stroke();
    ctx.beginPath(); ctx.arc(348, 354, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#effff9"; ctx.font = "600 65px Arial"; ctx.fillText("00 : 00", 660, 337);
    ctx.fillStyle = "#00d99a"; ctx.font = "500 23px Arial"; ctx.fillText("MATCH CENTRE", 665, 396);
  });
  const screenMat = new THREE.MeshStandardMaterial({ map: screenTexture, emissiveMap: screenTexture, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.65 });
  const screenGeometry = new THREE.PlaneGeometry(13, 6.5);
  for (const index of [80, 208]) {
    const p = point(index, 35, 38.4), rotation = yaw(index) + Math.PI;
    batch.box(graphite, p, new THREE.Vector3(13.6, 7.1, 0.8), rotation);
    const screen = new THREE.Mesh(screenGeometry, screenMat);
    screen.position.copy(point(index, 34.55, 38.4)); screen.rotation.y = rotation;
    screen.name = "Roof-suspended Gaffer match screen"; group.add(screen);
    for (const delta of [-2, 2]) batch.beam(steel, point(index + delta, 35, 42), point(index + delta, 35, 50), 0.18);
  }
  batch.finish(group);
  // Matrices/colors have been copied into instance GPU attributes. Release
  // staging arrays instead of retaining them in the theme callback's scope.
  seatTransforms.length = 0;
  seatColors.length = 0;
  crowdMatrices.length = 0;
  crowdColors.length = 0;
  panelMatrices.forEach((matrices) => { matrices.length = 0; });
  return {
    group,
    setNight(night: number) {
      lamp.emissiveIntensity = 0.12 + night * 2.4;
      interior.emissiveIntensity = 0.04 + night * 0.3;
      loungeLamp.emissiveIntensity = 0.1 + night * 1.1;
      accent.emissiveIntensity = 0.08 + night * 0.35;
      ledMaterials.forEach((mat) => { mat.emissiveIntensity = 0.15 + night * 0.65; });
      screenMat.emissiveIntensity = 0.22 + night * 0.55;
    },
  };
}

/** Dispose each shared resource once, including textures and line geometry. */
export function disposeStadium(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    // Geometry disposal does not release per-instance GPU attributes in r128.
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach((mat) => materials.add(mat));
    }
    if (object instanceof THREE.Light && "shadow" in object) {
      const shadow = (object as THREE.DirectionalLight).shadow;
      // The r128 type package exposes a minimal RenderTarget interface.
      (shadow.map as THREE.WebGLRenderTarget | null)?.dispose();
      (shadow.mapPass as THREE.WebGLRenderTarget | null)?.dispose();
    }
  });
  materials.forEach((mat) => {
    Object.values(mat).forEach((value) => { if (value instanceof THREE.Texture) textures.add(value); });
    mat.dispose();
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
