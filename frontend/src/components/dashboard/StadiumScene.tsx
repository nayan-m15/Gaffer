import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { GammaCorrectionShader } from "three/examples/jsm/shaders/GammaCorrectionShader.js";

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The dashboard stadium could not create a canvas context.");
  }
  return context;
}

/**
 * The animated day/night stadium from the approved dashboard concept.
 *
 * Hyper-realistic pass over the original:
 * - PBR materials (roughness/bump) + soft PCF shadows from a sun/moon light
 * - Bloom pass so the floodlights and roof trim actually glow
 * - A gradient sky dome instead of a flat background color
 * - Camera only sweeps side-to-side across the stadium front (no full orbit)
 * - Camera radius tracks the elliptical bowl boundary at each pan angle,
 *   so it never drifts outside the stands (the bowl is an ellipse, not a
 *   circle, so a fixed-radius pan would poke outside it at some angles)
 *
 * It remains deliberately presentation-only so it cannot intercept dashboard input.
 */
export function StadiumScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isMobile = window.innerWidth < 760;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      // The dashboard remains fully usable when WebGL is unavailable.
      return;
    }

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2),
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    // No renderer-level color-space flag needed here — the final
    // GammaCorrectionShader pass below converts the composite to sRGB,
    // and tone mapping is already applied when RenderPass draws the scene.

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    const darkBackground = new THREE.Color(0x060a08);
    scene.background = darkBackground.clone();
    const fog = new THREE.FogExp2(0x060a08, isMobile ? 0.0048 : 0.0032);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    const cameraCenterAngle = 0.65;
    const cameraSweep = 0.5; // radians each side of center — total pan, not a full orbit
    const cameraHeight = 46;

    // --- Stadium footprint (bowl is an ellipse, not a circle) ---
    // The lathed bowl profile below peaks around radius 136, then the
    // whole bowl group is scaled by (bowlScaleX, 1, bowlScaleZ). To keep
    // the panning camera inside the stands at every angle, we compute the
    // elliptical boundary radius at that angle and stay a fixed clearance
    // inside it, rather than using one constant radius for the whole pan.
    const bowlScaleX = 1.55;
    const bowlScaleZ = 1.05;
    const bowlOuterRadius = 136; // widest point of the lathed bowl profile
    const cameraClearance = 28; // stay this far inside the stands at every pan angle

    function bowlBoundaryRadius(angle: number) {
      const a = bowlOuterRadius * bowlScaleX;
      const b = bowlOuterRadius * bowlScaleZ;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return 1 / Math.sqrt((cos * cos) / (a * a) + (sin * sin) / (b * b));
    }

    function cameraRadiusForAngle(angle: number) {
      return bowlBoundaryRadius(angle) - cameraClearance;
    }

    let cameraAngle = cameraCenterAngle;
    camera.position.set(
      Math.cos(cameraAngle) * cameraRadiusForAngle(cameraAngle),
      cameraHeight,
      Math.sin(cameraAngle) * cameraRadiusForAngle(cameraAngle),
    );
    camera.lookAt(0, 14, 0);

    // --- Sky dome (replaces the flat background with a soft gradient) ---
    const skyDomeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0a1220) },
        bottomColor: { value: new THREE.Color(0x141a16) },
        offset: { value: 40 },
        exponent: { value: 0.7 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 16),
      skyDomeMaterial,
    );
    scene.add(skyDome);

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0x24352b, 1.1);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0x30456a, 0.5);
    sun.position.set(80, 150, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);

    function makePitchTexture() {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = 1024;
      textureCanvas.height = 680;
      const context = getCanvasContext(textureCanvas);
      const stripeCount = 12;
      const stripeWidth = textureCanvas.width / stripeCount;

      for (let index = 0; index < stripeCount; index += 1) {
        context.fillStyle = index % 2 === 0 ? "#1B5233" : "#15452A";
        context.fillRect(
          index * stripeWidth,
          0,
          stripeWidth,
          textureCanvas.height,
        );
      }

      // Subtle per-blade color noise so the turf reads as grass, not paint.
      const noise = context.getImageData(
        0,
        0,
        textureCanvas.width,
        textureCanvas.height,
      );
      for (let i = 0; i < noise.data.length; i += 4) {
        const variance = (Math.random() - 0.5) * 14;
        noise.data[i] = Math.max(0, Math.min(255, noise.data[i] + variance));
        noise.data[i + 1] = Math.max(
          0,
          Math.min(255, noise.data[i + 1] + variance),
        );
        noise.data[i + 2] = Math.max(
          0,
          Math.min(255, noise.data[i + 2] + variance * 0.6),
        );
      }
      context.putImageData(noise, 0, 0);

      context.strokeStyle = "rgba(255,255,255,0.55)";
      context.lineWidth = 3;
      context.strokeRect(
        36,
        36,
        textureCanvas.width - 72,
        textureCanvas.height - 72,
      );
      context.beginPath();
      context.moveTo(textureCanvas.width / 2, 36);
      context.lineTo(
        textureCanvas.width / 2,
        textureCanvas.height - 36,
      );
      context.stroke();
      context.beginPath();
      context.arc(
        textureCanvas.width / 2,
        textureCanvas.height / 2,
        66,
        0,
        Math.PI * 2,
      );
      context.stroke();
      context.strokeRect(36, textureCanvas.height / 2 - 118, 128, 236);
      context.strokeRect(
        textureCanvas.width - 164,
        textureCanvas.height / 2 - 118,
        128,
        236,
      );
      context.strokeRect(36, textureCanvas.height / 2 - 56, 54, 112);
      context.strokeRect(
        textureCanvas.width - 90,
        textureCanvas.height / 2 - 56,
        54,
        112,
      );

      // Soft contact-shadow vignette where the stands meet the pitch.
      const vignette = context.createRadialGradient(
        textureCanvas.width / 2,
        textureCanvas.height / 2,
        textureCanvas.height * 0.32,
        textureCanvas.width / 2,
        textureCanvas.height / 2,
        textureCanvas.height * 0.62,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.35)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

      return new THREE.CanvasTexture(textureCanvas);
    }

    function makePitchBumpTexture() {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = 512;
      textureCanvas.height = 512;
      const context = getCanvasContext(textureCanvas);
      const image = context.createImageData(512, 512);
      for (let i = 0; i < image.data.length; i += 4) {
        const value = 150 + Math.random() * 45;
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(6, 4);
      return texture;
    }

    function makeCrowdTexture(isLowPower: boolean) {
      const textureCanvas = document.createElement("canvas");
      // The bowl surface is roughly 16 times wider around its circumference
      // than it is tall. Matching that ratio avoids stretched spectators and
      // lets one panoramic texture cover the whole stadium without obvious
      // repeated tiles. Mobile gets the same composition at quarter memory.
      textureCanvas.width = isLowPower ? 1024 : 2048;
      textureCanvas.height = isLowPower ? 64 : 128;
      const context = getCanvasContext(textureCanvas);
      const width = textureCanvas.width;
      const height = textureCanvas.height;
      const scale = height / 128;

      const standGradient = context.createLinearGradient(0, 0, 0, height);
      standGradient.addColorStop(0, "#20282b");
      standGradient.addColorStop(0.55, "#151c1f");
      standGradient.addColorStop(1, "#0c1214");
      context.fillStyle = standGradient;
      context.fillRect(0, 0, width, height);

      // Seeded randomness keeps the crowd stable between mounts and avoids a
      // distracting new colour pattern whenever the dashboard is revisited.
      let randomState = 0x5f3759df;
      const random = () => {
        randomState = (randomState + 0x6d2b79f5) | 0;
        let value = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };

      const shirtColors = [
        "#38b978",
        "#43cf86",
        "#d9e0dc",
        "#aeb9b6",
        "#d5a94f",
        "#a75555",
        "#536f91",
        "#704f83",
        "#263b35",
        "#202a2d",
      ];
      const skinColors = ["#f0c7a1", "#dca77d", "#bd805d", "#8e5d45", "#593c32"];
      const rowCount = 9;
      const sectionCount = 14;
      const sectionWidth = width / sectionCount;
      const aisleHalfWidth = 5 * scale;
      const rowStep = height / rowCount;

      for (let row = 0; row < rowCount; row += 1) {
        const rowTop = row * rowStep;
        const personHeight = (7.2 + (row / rowCount) * 1.6) * scale;
        const spacing = (6.2 + random() * 1.4) * scale;

        // Seat lips and risers give the figures a physical place in the bowl
        // and remain readable after mipmapping.
        context.fillStyle = row % 2 === 0 ? "#273236" : "#20292d";
        context.fillRect(0, rowTop + rowStep - 1.3 * scale, width, 1.3 * scale);
        context.fillStyle = "rgba(109, 130, 126, 0.22)";
        context.fillRect(0, rowTop + rowStep - 2.1 * scale, width, 0.65 * scale);

        for (let x = spacing * 0.5; x < width; x += spacing) {
          const distanceFromAisle = Math.abs(
            ((x + sectionWidth * 0.5) % sectionWidth) - sectionWidth * 0.5,
          );
          const isAisle = distanceFromAisle < aisleHalfWidth;
          const isEmptySeat = random() < 0.085;
          if (isAisle || isEmptySeat) continue;

          const jitterX = (random() - 0.5) * 1.5 * scale;
          const jitterY = (random() - 0.5) * 1.1 * scale;
          const figureX = x + jitterX;
          const feetY = rowTop + rowStep - 1.8 * scale + jitterY;
          const headRadius = (1.05 + random() * 0.28) * scale;
          const torsoWidth = (3.1 + random() * 0.9) * scale;
          const torsoHeight = personHeight * (0.48 + random() * 0.08);
          const shirtIndex = Math.floor(random() * shirtColors.length);
          const skinIndex = Math.floor(random() * skinColors.length);
          const pose = Math.floor(random() * 6);

          context.globalAlpha = 0.86 + random() * 0.14;
          context.fillStyle = shirtColors[shirtIndex];
          context.beginPath();
          context.moveTo(figureX - torsoWidth * 0.55, feetY);
          context.lineTo(figureX - torsoWidth * 0.42, feetY - torsoHeight);
          context.quadraticCurveTo(
            figureX,
            feetY - torsoHeight - 0.7 * scale,
            figureX + torsoWidth * 0.42,
            feetY - torsoHeight,
          );
          context.lineTo(figureX + torsoWidth * 0.55, feetY);
          context.closePath();
          context.fill();

          // A small proportion of raised or offset arms breaks up the row
          // silhouette without introducing animation or extra geometry.
          if (pose === 0 || pose === 1) {
            context.strokeStyle = shirtColors[shirtIndex];
            context.lineWidth = Math.max(1, 1.05 * scale);
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(figureX - torsoWidth * 0.35, feetY - torsoHeight * 0.72);
            context.lineTo(
              figureX + (pose === 0 ? -2.8 : 2.8) * scale,
              feetY - torsoHeight - (pose === 0 ? 2.5 : 0.7) * scale,
            );
            context.stroke();
          }

          context.fillStyle = skinColors[skinIndex];
          context.beginPath();
          context.arc(
            figureX,
            feetY - torsoHeight - headRadius * 1.25,
            headRadius,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }

      // Dark stair aisles separate the audience into believable sections and
      // also hide the panoramic UV seam at the edge of the lathed geometry.
      context.globalAlpha = 1;
      context.fillStyle = "rgba(8, 13, 15, 0.72)";
      for (let section = 0; section <= sectionCount; section += 1) {
        const aisleX = section * sectionWidth;
        context.fillRect(aisleX - aisleHalfWidth, 0, aisleHalfWidth * 2, height);
      }
      context.fillStyle = "rgba(116, 139, 134, 0.28)";
      for (let section = 0; section <= sectionCount; section += 1) {
        const aisleX = section * sectionWidth;
        context.fillRect(aisleX - aisleHalfWidth, 0, 0.75 * scale, height);
        context.fillRect(aisleX + aisleHalfWidth, 0, 0.75 * scale, height);
      }
      context.globalAlpha = 1;

      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(1, 1);
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // Three r128 uses `encoding`; `colorSpace` was introduced much later.
      texture.encoding = THREE.sRGBEncoding;
      texture.name = isLowPower ? "Crowd panorama (mobile)" : "Crowd panorama";
      return texture;
    }

    function makeGlowTexture() {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = 128;
      textureCanvas.height = 128;
      const context = getCanvasContext(textureCanvas);
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(255,244,214,0.9)");
      gradient.addColorStop(0.4, "rgba(255,224,160,0.35)");
      gradient.addColorStop(1, "rgba(255,224,160,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(textureCanvas);
    }

    function makeAdvertisementTexture(isLowPower: boolean) {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = isLowPower ? 512 : 1024;
      textureCanvas.height = isLowPower ? 64 : 128;
      const context = getCanvasContext(textureCanvas);
      const width = textureCanvas.width;
      const height = textureCanvas.height;
      const scale = height / 128;

      const background = context.createLinearGradient(0, 0, width, 0);
      background.addColorStop(0, "#071713");
      background.addColorStop(0.5, "#0c2a21");
      background.addColorStop(1, "#071713");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.fillStyle = "#38d789";
      context.fillRect(0, 5 * scale, width, 3 * scale);
      context.fillRect(0, height - 8 * scale, width, 3 * scale);

      const markX = width * 0.32;
      context.strokeStyle = "#38d789";
      context.lineWidth = 5 * scale;
      context.beginPath();
      context.arc(markX, height / 2, 31 * scale, 0.3, Math.PI * 1.78);
      context.stroke();

      context.fillStyle = "#effff7";
      context.font = `800 ${54 * scale}px Inter, Arial, sans-serif`;
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText("GAFFER", width * 0.39, height / 2 + 1 * scale);

      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.encoding = THREE.sRGBEncoding;
      texture.name = isLowPower
        ? "Gaffer advertisement (mobile)"
        : "Gaffer advertisement";
      return texture;
    }

    const pitchTexture = makePitchTexture();
    const pitchBumpTexture = makePitchBumpTexture();
    pitchTexture.anisotropy = maxAnisotropy;
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 140),
      new THREE.MeshStandardMaterial({
        map: pitchTexture,
        bumpMap: pitchBumpTexture,
        bumpScale: 0.12,
        roughness: 0.92,
        metalness: 0,
      }),
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    scene.add(pitch);

    // --- Perimeter advertising ---
    // Every panel shares one geometry/material and is submitted as a single
    // instanced draw call. A gap in the far touchline reveals the dugout.
    const adTexture = makeAdvertisementTexture(isMobile);
    adTexture.anisotropy = Math.min(maxAnisotropy, isMobile ? 4 : 8);
    const adPanelGeometry = new THREE.BoxGeometry(16, 2.8, 0.65);
    const adPanelMaterial = new THREE.MeshStandardMaterial({
      map: adTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: adTexture,
      emissiveIntensity: 0.22,
      roughness: 0.48,
      metalness: 0.12,
    });
    const adPanelTransforms: Array<{
      x: number;
      z: number;
      rotationY: number;
    }> = [];
    const longSideZ = 72.6;
    for (let index = 0; index < 14; index += 1) {
      const x = -104 + index * 16;
      adPanelTransforms.push({ x, z: longSideZ, rotationY: 0 });
      if (Math.abs(x) > 24) {
        adPanelTransforms.push({ x, z: -longSideZ, rotationY: Math.PI });
      }
    }
    for (let index = 0; index < 9; index += 1) {
      const z = -64 + index * 16;
      adPanelTransforms.push({ x: -112.6, z, rotationY: Math.PI / 2 });
      adPanelTransforms.push({ x: 112.6, z, rotationY: -Math.PI / 2 });
    }

    const adPanels = new THREE.InstancedMesh(
      adPanelGeometry,
      adPanelMaterial,
      adPanelTransforms.length,
    );
    const adPanelTransform = new THREE.Object3D();
    adPanelTransforms.forEach((transform, index) => {
      adPanelTransform.position.set(transform.x, 1.4, transform.z);
      adPanelTransform.rotation.set(0, transform.rotationY, 0);
      adPanelTransform.updateMatrix();
      adPanels.setMatrixAt(index, adPanelTransform.matrix);
    });
    adPanels.instanceMatrix.needsUpdate = true;
    adPanels.castShadow = true;
    adPanels.receiveShadow = true;
    scene.add(adPanels);

    // --- Far-touchline dugout ---
    // A compact glass-and-metal shelter gives the stadium a professional
    // technical area while staying below the dashboard's visual hierarchy.
    const dugout = new THREE.Group();
    dugout.position.set(0, 0, -79.2);

    const dugoutMetal = new THREE.MeshStandardMaterial({
      color: 0x101719,
      roughness: 0.42,
      metalness: 0.72,
    });
    const dugoutConcrete = new THREE.MeshStandardMaterial({
      color: 0x303839,
      roughness: 0.92,
      metalness: 0,
    });
    const dugoutGlass = new THREE.MeshPhysicalMaterial({
      color: 0x86c9b4,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const seatMaterial = new THREE.MeshStandardMaterial({
      color: 0x16734f,
      roughness: 0.62,
      metalness: 0.08,
    });

    const dugoutBase = new THREE.Mesh(
      new THREE.BoxGeometry(44, 0.55, 8.4),
      dugoutConcrete,
    );
    dugoutBase.position.y = 0.28;
    dugoutBase.receiveShadow = true;
    dugout.add(dugoutBase);

    const dugoutRoof = new THREE.Mesh(
      new THREE.BoxGeometry(44, 0.55, 8.2),
      dugoutMetal,
    );
    dugoutRoof.position.set(0, 7.1, -0.15);
    dugoutRoof.rotation.x = -0.045;
    dugoutRoof.castShadow = true;
    dugout.add(dugoutRoof);

    const dugoutBack = new THREE.Mesh(
      new THREE.BoxGeometry(42, 6.2, 0.18),
      dugoutGlass,
    );
    dugoutBack.position.set(0, 3.75, -3.85);
    dugout.add(dugoutBack);

    [-21.1, 21.1].forEach((x) => {
      const side = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 6.2, 7.5),
        dugoutGlass,
      );
      side.position.set(x, 3.75, -0.1);
      dugout.add(side);
    });

    const frontBeam = new THREE.Mesh(
      new THREE.BoxGeometry(43, 0.38, 0.38),
      dugoutMetal,
    );
    frontBeam.position.set(0, 6.65, 3.6);
    frontBeam.castShadow = true;
    dugout.add(frontBeam);

    const postGeometry = new THREE.BoxGeometry(0.3, 6.2, 0.3);
    const postPositions = [-21, -16, -11, -6, -1, 4, 9, 14, 19, 21];
    const dugoutPosts = new THREE.InstancedMesh(
      postGeometry,
      dugoutMetal,
      postPositions.length,
    );
    const postTransform = new THREE.Object3D();
    postPositions.forEach((x, index) => {
      postTransform.position.set(x, 3.65, -3.68);
      postTransform.updateMatrix();
      dugoutPosts.setMatrixAt(index, postTransform.matrix);
    });
    dugoutPosts.instanceMatrix.needsUpdate = true;
    dugoutPosts.castShadow = true;
    dugout.add(dugoutPosts);

    const seatCount = isMobile ? 8 : 10;
    const seatGeometry = new THREE.BoxGeometry(3.2, 0.55, 2.15);
    const seatBackGeometry = new THREE.BoxGeometry(3.2, 2.1, 0.42);
    const dugoutSeats = new THREE.InstancedMesh(
      seatGeometry,
      seatMaterial,
      seatCount,
    );
    const dugoutSeatBacks = new THREE.InstancedMesh(
      seatBackGeometry,
      seatMaterial,
      seatCount,
    );
    const seatTransform = new THREE.Object3D();
    const seatSpacing = 3.65;
    const firstSeatX = -((seatCount - 1) * seatSpacing) / 2;
    for (let index = 0; index < seatCount; index += 1) {
      const x = firstSeatX + index * seatSpacing;
      seatTransform.position.set(x, 1.35, -0.55);
      seatTransform.rotation.set(0, 0, 0);
      seatTransform.updateMatrix();
      dugoutSeats.setMatrixAt(index, seatTransform.matrix);

      seatTransform.position.set(x, 2.55, -1.55);
      seatTransform.rotation.set(-0.1, 0, 0);
      seatTransform.updateMatrix();
      dugoutSeatBacks.setMatrixAt(index, seatTransform.matrix);
    }
    dugoutSeats.instanceMatrix.needsUpdate = true;
    dugoutSeatBacks.instanceMatrix.needsUpdate = true;
    dugoutSeats.castShadow = true;
    dugoutSeatBacks.castShadow = true;
    dugout.add(dugoutSeats, dugoutSeatBacks);
    scene.add(dugout);

    const profile = [
      [90, 0],
      [92, 4],
      [100, 10],
      [109, 17],
      [117, 25],
      [125, 33],
      [131, 40],
      [136, 46],
      [132, 50],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const latheSegments = isMobile ? 26 : 44;
    const crowdTexture = makeCrowdTexture(isMobile);
    // Oblique stadium views benefit from anisotropy, but sampling at the
    // device maximum is wasteful for a background crowd texture.
    crowdTexture.anisotropy = Math.min(maxAnisotropy, isMobile ? 4 : 8);
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry(profile, latheSegments),
      new THREE.MeshStandardMaterial({
        map: crowdTexture,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
      }),
    );
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    const roof = new THREE.Mesh(
      new THREE.TorusGeometry(133, 2.4, 6, isMobile ? 26 : 44),
      new THREE.MeshBasicMaterial({
        color: 0x3acc7d,
        transparent: true,
        opacity: 0.5,
      }),
    );
    roof.rotation.x = Math.PI / 2;
    roof.position.y = 49;

    const stadium = new THREE.Group();
    stadium.add(bowl, roof);
    stadium.scale.set(bowlScaleX, 1, bowlScaleZ);
    scene.add(stadium);

    const glowTexture = makeGlowTexture();
    const towerPositions = [
      [225, 150],
      [225, -150],
      [-225, 150],
      [-225, -150],
    ];
    const glowSprites: THREE.Sprite[] = [];
    const pointLights: THREE.PointLight[] = [];

    towerPositions.forEach(([x, z]) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 2, 88, 8),
        new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.7 }),
      );
      pole.position.set(x, 44, z);
      pole.castShadow = true;
      scene.add(pole);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(16, 9, 5),
        new THREE.MeshStandardMaterial({ color: 0x1c2224, roughness: 0.6 }),
      );
      head.position.set(x, 90, z);
      head.castShadow = true;
      scene.add(head);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0xfff0c8,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.set(46, 46, 1);
      glow.position.set(x, 90, z);
      scene.add(glow);
      glowSprites.push(glow);

      const light = new THREE.PointLight(0xfff0c8, 1, 320, 2);
      light.position.set(x * 0.72, 78, z * 0.72);
      scene.add(light);
      pointLights.push(light);
    });

    // --- Post-processing (bloom makes the floodlights & roof trim glow) ---
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      isMobile ? 0.55 : 0.85,
      0.55,
      0.82,
    );
    composer.addPass(bloomPass);
    // Converts the composite back from linear to sRGB for display — the
    // widely-available equivalent of OutputPass (added later, in r152).
    composer.addPass(new ShaderPass(GammaCorrectionShader));

    let pointerX = 0;
    let pointerY = 0;
    const handlePointerMove = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
    };
    if (!isMobile && !reducedMotion) {
      window.addEventListener("pointermove", handlePointerMove);
    }

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        window.innerWidth < 760 ? 1.5 : 2,
      );
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    const target = {
      background: darkBackground.clone(),
      fogColor: new THREE.Color(0x060a08),
      fogDensity: fog.density,
      ambientColor: new THREE.Color(0x24352b),
      ambientIntensity: 1.1,
      sunColor: new THREE.Color(0x30456a),
      sunIntensity: 0.5,
      skyTop: new THREE.Color(0x0a1220),
      skyBottom: new THREE.Color(0x141a16),
      glowOpacity: 0.85,
      lightIntensity: 1,
      bloomStrength: isMobile ? 0.55 : 0.85,
      exposure: 1.05,
    };

    const setLightTheme = (isLight: boolean) => {
      if (isLight) {
        // Keep daylight colourful and readable without washing the stadium
        // out: richer sky/fog hues paired with lower exposure and key-light
        // intensity preserve contrast in the pitch, crowd and dugout glass.
        target.background.set(0xa9cbd5);
        target.fogColor.set(0xbcd8da);
        target.fogDensity = isMobile ? 0.0026 : 0.0018;
        target.ambientColor.set(0xcfe5d9);
        target.ambientIntensity = 1.12;
        target.sunColor.set(0xffe2a8);
        target.sunIntensity = 1.6;
        target.skyTop.set(0x65a7d8);
        target.skyBottom.set(0xc6dfcf);
        target.glowOpacity = 0.12;
        target.lightIntensity = 0.15;
        target.bloomStrength = 0.07;
        target.exposure = 0.9;
      } else {
        target.background.set(0x060a08);
        target.fogColor.set(0x060a08);
        target.fogDensity = isMobile ? 0.0048 : 0.0032;
        target.ambientColor.set(0x24352b);
        target.ambientIntensity = 1.1;
        target.sunColor.set(0x30456a);
        target.sunIntensity = 0.5;
        target.skyTop.set(0x0a1220);
        target.skyBottom.set(0x141a16);
        target.glowOpacity = 0.85;
        target.lightIntensity = 1;
        target.bloomStrength = isMobile ? 0.55 : 0.85;
        target.exposure = 1.05;
      }
    };

    const syncTheme = () => {
      setLightTheme(!document.documentElement.classList.contains("dark"));
    };
    syncTheme();
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const clock = new THREE.Clock();
    let animationFrame = 0;
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const transitionAmount = 0.035;

      (scene.background as THREE.Color).lerp(
        target.background,
        transitionAmount,
      );
      fog.color.lerp(target.fogColor, transitionAmount);
      fog.density += (target.fogDensity - fog.density) * transitionAmount;
      ambient.color.lerp(target.ambientColor, transitionAmount);
      ambient.intensity +=
        (target.ambientIntensity - ambient.intensity) * transitionAmount;
      sun.color.lerp(target.sunColor, transitionAmount);
      sun.intensity += (target.sunIntensity - sun.intensity) * transitionAmount;
      (skyDomeMaterial.uniforms.topColor.value as THREE.Color).lerp(
        target.skyTop,
        transitionAmount,
      );
      (skyDomeMaterial.uniforms.bottomColor.value as THREE.Color).lerp(
        target.skyBottom,
        transitionAmount,
      );
      bloomPass.strength +=
        (target.bloomStrength - bloomPass.strength) * transitionAmount;
      renderer.toneMappingExposure +=
        (target.exposure - renderer.toneMappingExposure) * transitionAmount;

      glowSprites.forEach((glow) => {
        const material = glow.material as THREE.SpriteMaterial;
        material.opacity +=
          (target.glowOpacity - material.opacity) * transitionAmount;
      });
      pointLights.forEach((light) => {
        light.intensity +=
          (target.lightIntensity - light.intensity) * transitionAmount;
      });

      if (!reducedMotion) {
        // Side-to-side pan only: the angle oscillates between two bounds
        // around the stadium front instead of orbiting all the way around.
        // The radius is recomputed per-frame from the elliptical bowl
        // boundary at the current angle, so the camera stays inside the
        // stands no matter where in the sweep it is.
        const panPhase = Math.sin(elapsed * 0.09);
        cameraAngle = cameraCenterAngle + panPhase * cameraSweep;
        const radius = cameraRadiusForAngle(cameraAngle);

        camera.position.x = Math.cos(cameraAngle) * radius + pointerX * 8;
        camera.position.z = Math.sin(cameraAngle) * radius;
        camera.position.y =
          cameraHeight + pointerY * 6 + Math.sin(elapsed * 0.15) * 1.5;
        camera.lookAt(0, 14, 0);

        sun.target.position.set(0, 14, 0);

        glowSprites.forEach((glow, index) => {
          const size = 46 + Math.sin(elapsed * 1.6 + index) * 2.2;
          glow.scale.set(size, size, 1);
        });

      }

      composer.render();
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      themeObserver.disconnect();

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        } else if (object instanceof THREE.Sprite) {
          object.material.dispose();
        }
      });
      skyDomeMaterial.dispose();
      pitchTexture.dispose();
      pitchBumpTexture.dispose();
      crowdTexture.dispose();
      adTexture.dispose();
      glowTexture.dispose();
      // Cast to a loose shape: EffectComposer/UnrealBloomPass gained an
      // explicit `dispose()` in later three.js releases than these
      // @types cover, but calling it when present avoids leaking the
      // internal render targets these passes allocate.
      const disposableBloomPass = bloomPass as unknown as {
        dispose?: () => void;
      };
      const disposableComposer = composer as unknown as {
        dispose?: () => void;
        renderTarget1?: THREE.WebGLRenderTarget;
        renderTarget2?: THREE.WebGLRenderTarget;
      };
      disposableBloomPass.dispose?.();
      if (disposableComposer.dispose) {
        disposableComposer.dispose();
      } else {
        disposableComposer.renderTarget1?.dispose();
        disposableComposer.renderTarget2?.dispose();
      }
      renderer.dispose();
      scene.clear();
    };
  }, []);

  return (
    <div className="dashboard-stadium-scene" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="dashboard-stadium-vignette" />
    </div>
  );
}
