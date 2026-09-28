import * as THREE from "three";

type Side = "east" | "west" | "north" | "south";
type Tier = { rows: number; start: number; rise: number; depth: number; base: number };
type StandSpec = { side: Side; length: number; tiers: Tier[]; roof: number; columns: number; name: string };

const BRAND = 0x00d99a;

function block(size: [number, number, number], at: [number, number, number], material: THREE.Material, shadow = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function strut(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 5), material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function strutBatch(segments: Array<[THREE.Vector3, THREE.Vector3]>, radius: number, material: THREE.Material) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5), material, segments.length);
  const dummy = new THREE.Object3D(), direction = new THREE.Vector3();
  segments.forEach(([a, b], i) => {
    direction.subVectors(b, a);
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    dummy.scale.set(radius, direction.length(), radius);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function signTexture(text: string, background = "#101816") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = "#00d99a"; ctx.fillRect(0, 0, 1024, 8);
  ctx.fillStyle = "#edf7f1"; ctx.font = "800 76px Inter,Arial,sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 512, 87);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function scoreboardTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#090e0e"; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "#00d99a"; ctx.fillRect(0, 0, 1024, 17);
  ctx.fillStyle = "#eaf5ef"; ctx.textAlign = "center";
  ctx.font = "900 82px Inter,Arial,sans-serif"; ctx.fillText("GAFFER", 512, 112);
  ctx.font = "600 38px Inter,Arial,sans-serif"; ctx.fillText("HOME                         AWAY", 512, 205);
  ctx.font = "900 150px Inter,Arial,sans-serif"; ctx.fillText("0      :      0", 512, 373);
  ctx.fillStyle = "#00d99a"; ctx.font = "700 48px Inter,Arial,sans-serif"; ctx.fillText("00:00", 512, 455);
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function standTransform(group: THREE.Group, side: Side) {
  if (side === "east") { group.position.x = 37.5; group.rotation.y = Math.PI / 2; }
  if (side === "west") { group.position.x = -37.5; group.rotation.y = -Math.PI / 2; }
  if (side === "north") { group.position.z = -56; group.rotation.y = Math.PI; }
  if (side === "south") group.position.z = 56;
}

function opening(side: Side, along: number, row: number, tier: number) {
  // The existing walk-out is on the west touchline at z=0. Keep its sightline clear.
  if (side === "west" && tier === 0 && Math.abs(along) < 6.5) return true;
  if (side === "west" && tier === 0 && along > 7.2 && along < 20.5 && row < 4) return true; // dugout
  return false;
}

function makeStand(spec: StandSpec, lowPower: boolean, materials: ReturnType<typeof makeMaterials>, textures: THREE.Texture[]) {
  const stand = new THREE.Group();
  stand.name = `Gaffer ${spec.name} stand`;
  standTransform(stand, spec.side);
  const { concrete, darkConcrete, steel, fascia, seat, glass, aisle, rail } = materials;
  const totalDepth = Math.max(...spec.tiers.map(t => t.start + t.rows * t.depth));
  const backHeight = spec.roof - 3.3;

  // Keep the west touchline open so the dressing-room walk-out flows directly
  // onto the pitch without a blocky entrance facade.
  const lowerBuildingHeight = backHeight * .55;
  if (spec.side !== "west") {
    stand.add(block([spec.length + 2, lowerBuildingHeight, 2.5], [0, lowerBuildingHeight / 2, totalDepth + 1.9], darkConcrete));
  }
  stand.add(block([spec.length + 2, 1.25, 4.3], [0, backHeight - .5, totalDepth + 1.1], concrete));
  stand.add(block([spec.length + 4, .45, totalDepth + 4], [0, -.25, (totalDepth + 4) / 2], darkConcrete));
  for (let i = 0; i < spec.columns; i++) {
    const x = -spec.length / 2 + (i + .5) * spec.length / spec.columns;
    stand.add(block([.55, backHeight, .75], [x, backHeight / 2, totalDepth + 1], concrete));
    if (!lowPower || i % 2 === 0) stand.add(block([spec.length / spec.columns - 1, 2.3, .13], [x, backHeight * .7, totalDepth + .48], glass));
  }

  for (let tierIndex = 0; tierIndex < spec.tiers.length; tierIndex++) {
    const tier = spec.tiers[tierIndex];
    const aisleCount = spec.side === "north" ? 4 : spec.side === "south" ? 3 : 5;
    const aisleWidth = 1.65;
    const seatSpacing = lowPower ? 1.15 : .78;
    const rowStride = lowPower ? 2 : 1;
    const positions: Array<{ x: number; y: number; z: number; green: boolean }> = [];
    const riserGeometry = new THREE.BoxGeometry(1, 1, 1);
    const risers = new THREE.InstancedMesh(riserGeometry, darkConcrete, tier.rows * (aisleCount + 3));
    const riserDummy = new THREE.Object3D(); let riserCount = 0;
    const sections = aisleCount + 1;
    const sectionWidth = (spec.length - aisleCount * aisleWidth) / sections;
    for (let row = 0; row < tier.rows; row++) {
      const z = tier.start + (row + .5) * tier.depth;
      const y = tier.base + (row + .5) * tier.rise;
      for (let section = 0; section < sections; section++) {
        const x0 = -spec.length / 2 + section * (sectionWidth + aisleWidth);
        let spans: Array<[number, number]> = [[x0, x0 + sectionWidth]];
        if (spec.side === "west" && tierIndex === 0) {
          const cuts: Array<[number, number]> = row < 4 ? [[-6.5, 6.5], [7.2, 20.5]] : [[-6.5, 6.5]];
          for (const [cutStart, cutEnd] of cuts) spans = spans.flatMap(([start, end]) => {
            if (cutEnd <= start || cutStart >= end) return [[start, end]];
            return [[start, Math.min(end, cutStart)], [Math.max(start, cutEnd), end]].filter(([a, b]) => b - a > .2) as Array<[number, number]>;
          });
        }
        for (const [start, end] of spans) {
          riserDummy.position.set((start + end) / 2, y / 2, z);
          riserDummy.scale.set(end - start - .08, y, tier.depth + .025);
          riserDummy.updateMatrix(); risers.setMatrixAt(riserCount++, riserDummy.matrix);
        }
        if (row % rowStride !== 0) continue;
        const seats = Math.floor(sectionWidth / seatSpacing);
        for (let col = 0; col < seats; col++) {
          const x = x0 + (col + .5) * sectionWidth / seats;
          if (opening(spec.side, x, row, tierIndex)) continue;
          const wordBand = spec.side === "north" && tierIndex === 0 && row >= 7 && row <= 13;
          const stripe = (section === 1 || section === sections - 2) && row >= 4 && row <= 7;
          const greenSeat = wordBand ? ((Math.floor((x + spec.length / 2) / 3) + row) % 5 < 2) : stripe || ((row * 13 + col * 7 + section * 19) % 43 === 0);
          positions.push({ x, y: tier.base + (row + 1) * tier.rise + .12, z, green: greenSeat });
        }
      }
    }
    risers.count = riserCount; risers.instanceMatrix.needsUpdate = true; risers.receiveShadow = true; stand.add(risers);
    // Two draw calls for each tier, even when it contains thousands of seats.
    const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(.66, .12, .5), seat, positions.length);
    const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(.66, .68, .11), seat, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach((p, i) => {
      const color = new THREE.Color(p.green ? BRAND : (i % 17 === 0 ? 0x34413c : 0x1b2523));
      dummy.position.set(p.x, p.y, p.z - .08); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); bases.setMatrixAt(i, dummy.matrix); bases.setColorAt(i, color);
      dummy.position.set(p.x, p.y + .36, p.z + .2); dummy.updateMatrix(); backs.setMatrixAt(i, dummy.matrix); backs.setColorAt(i, color);
    });
    bases.instanceMatrix.needsUpdate = true; backs.instanceMatrix.needsUpdate = true;
    stand.add(bases, backs);

    // Pale stair strips and handrails make the seating blocks readable at pitch level.
    const stairMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), aisle, aisleCount * tier.rows);
    const stairDummy = new THREE.Object3D(); let stairIndex = 0;
    for (let aisleIndex = 0; aisleIndex < aisleCount; aisleIndex++) {
      const x = -spec.length / 2 + (aisleIndex + 1) * sectionWidth + aisleIndex * aisleWidth + aisleWidth / 2;
      const crossesPlayerEntrance = spec.side === "west" && tierIndex === 0 && Math.abs(x) < 6.5;
      if (crossesPlayerEntrance) continue;
      for (let row = 0; row < tier.rows; row++) {
        const z = tier.start + (row + .5) * tier.depth;
        const y = tier.base + (row + 1) * tier.rise;
        stairDummy.position.set(x, y + .035, z);
        stairDummy.scale.set(aisleWidth - .12, .07, tier.depth - .06);
        stairDummy.updateMatrix(); stairMesh.setMatrixAt(stairIndex++, stairDummy.matrix);
      }
      if (!lowPower) {
        const a = new THREE.Vector3(x - aisleWidth / 2, tier.base + 1.05, tier.start);
        const b = new THREE.Vector3(x - aisleWidth / 2, tier.base + tier.rows * tier.rise + 1.05, tier.start + tier.rows * tier.depth);
        stand.add(strut(a, b, .045, rail));
      }
    }
    stairMesh.count = stairIndex;
    stairMesh.instanceMatrix.needsUpdate = true; stand.add(stairMesh);
    if (tierIndex > 0) {
      const walkway = tier.start - .6;
      stand.add(block([spec.length, .36, 2.5], [0, tier.base - .36, walkway], darkConcrete));
      stand.add(block([spec.length, .58, .11], [0, tier.base + .28, walkway - 1.15], rail));
      for (let i = 0; i < Math.floor(spec.length / 7); i++) {
        const x = -spec.length / 2 + 3.5 + i * 7;
        if (i % 4 !== 1) stand.add(block([4.7, 1.4, .15], [x, tier.base - 1.3, walkway + 1.25], glass));
      }
    }
  }

  // Vomitories, front wall and fascia have their own depth instead of a thin shell.
  for (let i = 0; i < spec.columns - 1; i++) {
    const x = -spec.length / 2 + (i + 1) * spec.length / spec.columns;
    if (spec.side === "west" && Math.abs(x) < 7) continue;
    stand.add(block([2.2, 2.35, .9], [x, 1.18, 3.8], darkConcrete));
    stand.add(block([2.5, .22, 1], [x, 2.4, 3.8], concrete));
  }
  for (let x = -spec.length / 2 + 3; x < spec.length / 2; x += 8) {
    if (spec.side === "west" && Math.abs(x) < 7) continue;
    stand.add(block([.075, 1.1, .075], [x, 1.2, -.5], rail));
  }
  if (spec.side !== "west") {
    stand.add(block([spec.length, .12, .1], [0, 1.74, -.5], rail));
  }

  const roofFront = spec.side === "north" ? 2.8 : 3.8;
  const roofBack = totalDepth + 4;
  const frontY = spec.roof - 2.4;
  const rearY = spec.roof + 1.7;
  const roofDepth = roofBack - roofFront;
  const pitch = Math.atan2(rearY - frontY, roofDepth);
  const roofSegments = lowPower ? Math.ceil(spec.length / 12) : Math.ceil(spec.length / 7);
  const segmentWidth = spec.length / roofSegments;
  const panelMat = materials.roofPanel;
  for (let i = 0; i < roofSegments; i++) {
    const x = -spec.length / 2 + (i + .5) * segmentWidth;
    const panel = block([segmentWidth - .18, .12, roofDepth - .15], [x, (frontY + rearY) / 2, (roofFront + roofBack) / 2], i % 4 === 0 ? materials.solidRoof : panelMat);
    panel.rotation.x = -pitch; stand.add(panel);
  }
  stand.add(block([spec.length + 2, 1.05, .72], [0, frontY - .32, roofFront], fascia, !lowPower));
  stand.add(block([spec.length + 2, .62, .9], [0, rearY, roofBack], steel));
  const trusses = lowPower ? Math.ceil(spec.length / 14) : Math.ceil(spec.length / 8);
  const upperChords: Array<[THREE.Vector3, THREE.Vector3]> = [];
  const lowerChords: Array<[THREE.Vector3, THREE.Vector3]> = [];
  const columns: Array<[THREE.Vector3, THREE.Vector3]> = [];
  for (let i = 0; i <= trusses; i++) {
    const x = -spec.length / 2 + i * spec.length / trusses;
    const front = new THREE.Vector3(x, frontY - .35, roofFront);
    const rear = new THREE.Vector3(x, rearY - .35, roofBack);
    const centre = new THREE.Vector3(x, (frontY + rearY) / 2 - 1.4, (roofFront + roofBack) / 2);
    upperChords.push([front, centre], [centre, rear]); lowerChords.push([front, rear]);
    if (i % 2 === 0) {
      columns.push([new THREE.Vector3(x, 0, totalDepth + 2), new THREE.Vector3(x, rearY - .6, roofBack - 1)]);
      lowerChords.push([new THREE.Vector3(x, rearY - .6, roofBack - 1), centre]);
    }
  }
  stand.add(strutBatch(upperChords, .115, steel), strutBatch(lowerChords, .09, steel), strutBatch(columns, .18, steel));
  for (const z of [roofFront + 2, (roofFront + roofBack) / 2, roofBack - 2]) {
    const y = frontY + (z - roofFront) / roofDepth * (rearY - frontY) - .18;
    stand.add(block([spec.length + 1, .16, .18], [0, y, z], steel));
  }
  const signMap = signTexture(spec.name === "Kop" ? "GAFFER  •  OWN THE TOUCHLINE" : "GAFFER  •  PREPARE. PERFORM. IMPROVE.");
  textures.push(signMap);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(spec.length * .64, 60), .84), new THREE.MeshBasicMaterial({ map: signMap }));
  sign.position.set(0, frontY - .31, roofFront - .38); sign.rotation.y = Math.PI; stand.add(sign);
  return stand;
}

function makeMaterials() {
  return {
    concrete: new THREE.MeshStandardMaterial({ color: 0x626b67, roughness: .97 }),
    darkConcrete: new THREE.MeshStandardMaterial({ color: 0x252d2b, roughness: .96 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x242d2c, roughness: .58, metalness: .48 }),
    fascia: new THREE.MeshStandardMaterial({ color: 0x111917, roughness: .65, metalness: .24 }),
    seat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .87 }),
    aisle: new THREE.MeshStandardMaterial({ color: 0x858d88, roughness: .92 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x9ba8a0, roughness: .6, metalness: .34 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x6d9187, roughness: .27, metalness: .22, transparent: true, opacity: .35, depthWrite: false }),
    roofPanel: new THREE.MeshStandardMaterial({ color: 0x8da8a3, roughness: .48, metalness: .1, transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false }),
    solidRoof: new THREE.MeshStandardMaterial({ color: 0x454d4b, roughness: .72, metalness: .25 }),
  };
}

type AdvertisingBoardSegment = { axis: "x" | "z"; fixed: number; start: number; end: number };

function createAdvertisingBoards(material: THREE.Material, aisle: THREE.Material) {
  const group = new THREE.Group();
  group.name = "Pitch advertising perimeter";
  const segments: AdvertisingBoardSegment[] = [];
  const segmentGap = .14, targetLength = 6.1;

  const addRun = (axis: "x" | "z", fixed: number, start: number, end: number, openings: Array<[number, number]> = []) => {
    let spans: Array<[number, number]> = [[start, end]];
    for (const [openingStart, openingEnd] of openings) {
      spans = spans.flatMap(([spanStart, spanEnd]) => {
        if (openingEnd <= spanStart || openingStart >= spanEnd) return [[spanStart, spanEnd]];
        return [[spanStart, Math.min(spanEnd, openingStart)], [Math.max(spanStart, openingEnd), spanEnd]]
          .filter(([a, b]) => b - a > .5) as Array<[number, number]>;
      });
    }
    for (const [spanStart, spanEnd] of spans) {
      const count = Math.max(1, Math.ceil((spanEnd - spanStart) / targetLength));
      const length = (spanEnd - spanStart) / count;
      for (let i = 0; i < count; i++) {
        segments.push({
          axis,
          fixed,
          start: spanStart + i * length + segmentGap / 2,
          end: spanStart + (i + 1) * length - segmentGap / 2,
        });
      }
    }
  };

  // The west touchline has separate openings for the tunnel and home dugout.
  addRun("z", -35.7, -49.4, 49.4, [[-4.4, 4.4], [6.5, 20.5]]);
  addRun("z", 35.7, -49.4, 49.4);
  // Goal-line boards sit behind the net depth and leave each goal mouth open.
  addRun("x", -55.3, -31.2, 31.2, [[-4.8, 4.8]]);
  addRun("x", 55.3, -31.2, 31.2, [[-4.8, 4.8]]);

  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, segments.length);
  const dummy = new THREE.Object3D();
  segments.forEach((segment, index) => {
    const length = segment.end - segment.start;
    const centre = (segment.start + segment.end) / 2;
    dummy.position.set(segment.axis === "x" ? centre : segment.fixed, .52, segment.axis === "z" ? centre : segment.fixed);
    dummy.scale.set(segment.axis === "x" ? length : .24, .92, segment.axis === "z" ? length : .24);
    dummy.updateMatrix();
    boards.setMatrixAt(index, dummy.matrix);
  });
  boards.instanceMatrix.needsUpdate = true;
  boards.receiveShadow = true;
  group.add(boards, block([2.6, .12, 15], [-36.9, .07, 14], aisle));
  return group;
}

export function createGafferStadium(lowPower: boolean) {
  const group = new THREE.Group(); group.name = "Gaffer Stadium";
  const textures: THREE.Texture[] = [];
  const materials = makeMaterials();
  const specs: StandSpec[] = [
    { side: "east", name: "Main", length: 116, tiers: [{ rows: 10, start: 0, rise: .52, depth: 1.1, base: .48 }, { rows: 12, start: 13.3, rise: .7, depth: 1.08, base: 7.1 }], roof: 22.5, columns: 11 },
    { side: "west", name: "Opposite", length: 116, tiers: [{ rows: 10, start: 0, rise: .54, depth: 1.1, base: .48 }, { rows: 9, start: 13.1, rise: .72, depth: 1.12, base: 7.2 }], roof: 19.5, columns: 10 },
    { side: "north", name: "Kop", length: 79, tiers: [{ rows: 20, start: 0, rise: .68, depth: 1.13, base: .5 }], roof: 19.7, columns: 8 },
    { side: "south", name: "South", length: 79, tiers: [{ rows: 9, start: 0, rise: .58, depth: 1.13, base: .5 }, { rows: 8, start: 12, rise: .75, depth: 1.12, base: 7.1 }], roof: 18.6, columns: 8 },
  ];
  specs.forEach(spec => group.add(makeStand(spec, lowPower, materials, textures)));

  // Corner circulation towers and connecting roof edges close the rectangular skyline.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 45.2, z = sz * 63;
    group.add(block([8, 12.5, 8], [x, 6.25, z], materials.darkConcrete));
    group.add(block([8.5, .6, 8.5], [x, 12.6, z], materials.concrete));
    for (let level = 0; level < 3; level++) {
      const y = 3.15 + level * 3.05;
      group.add(block([7.2, 2.05, .12], [x, y, z - sz * 4.08], materials.glass));
      group.add(block([.12, 2.05, 7.2], [x - sx * 4.08, y, z], materials.glass));
      group.add(block([8.1, .18, .2], [x, y + 1.12, z - sz * 4.13], materials.steel));
      if (!lowPower) group.add(block([.18, .18, 8.1], [x - sx * 4.13, y + 1.12, z], materials.steel));
    }
  }

  // Suspended display below the north stand roof, braced back into its steelwork.
  const scoreboardMap = scoreboardTexture(); textures.push(scoreboardMap);
  const board = new THREE.Group(); board.position.set(0, 16.3, -57.8);
  board.add(block([12.6, 6.6, .7], [0, 0, 0], materials.steel));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 5.9), new THREE.MeshBasicMaterial({ map: scoreboardMap }));
  face.position.z = .37; board.add(face);
  for (const x of [-4.5, 4.5]) board.add(strut(new THREE.Vector3(x, 3.1, 0), new THREE.Vector3(x, 6.8, -3.6), .16, materials.steel));
  group.add(board);

  // Low, restrained LED boards follow the pitch perimeter and preserve access gaps.
  const adMap = signTexture("GAFFER  •  COACH SMARTER"); textures.push(adMap);
  const adMaterial = new THREE.MeshStandardMaterial({ map: adMap, emissive: 0x073a2a, emissiveIntensity: .22, roughness: .7 });
  group.add(createAdvertisingBoards(adMaterial, materials.aisle));
  return { group, textures };
}
