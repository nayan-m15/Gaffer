import { useEffect, useRef } from "react";
import * as THREE from "three";

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The dashboard stadium could not create a canvas context.");
  }
  return context;
}

/**
 * The animated day/night stadium from the approved dashboard concept.
 * It is deliberately presentation-only so it cannot intercept dashboard input.
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

    const scene = new THREE.Scene();
    const darkBackground = new THREE.Color(0x060a08);
    scene.background = darkBackground.clone();
    const fog = new THREE.FogExp2(
      0x060a08,
      isMobile ? 0.0048 : 0.0032,
    );
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    let cameraAngle = 0.65;
    const cameraRadius = 165;
    const cameraHeight = 46;
    camera.position.set(
      Math.cos(cameraAngle) * cameraRadius,
      cameraHeight,
      Math.sin(cameraAngle) * cameraRadius,
    );
    camera.lookAt(0, 14, 0);

    const ambient = new THREE.AmbientLight(0x24352b, 1.5);
    scene.add(ambient);
    const sky = new THREE.DirectionalLight(0x30456a, 0.45);
    sky.position.set(80, 150, 60);
    scene.add(sky);

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
      return new THREE.CanvasTexture(textureCanvas);
    }

    function makeCrowdTexture() {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = 512;
      textureCanvas.height = 128;
      const context = getCanvasContext(textureCanvas);
      context.fillStyle = "#171D22";
      context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

      const colors = [
        "#e8b95a",
        "#3acc7d",
        "#e8ece9",
        "#7a8ba3",
        "#c46a6a",
        "#171D22",
        "#171D22",
      ];
      const rows = 10;
      const columns = 90;
      for (let row = 0; row < rows; row += 1) {
        const y = (row / rows) * textureCanvas.height;
        for (let column = 0; column < columns; column += 1) {
          if (Math.random() > 0.38) {
            const x =
              (column / columns) * textureCanvas.width + Math.random() * 3;
            context.fillStyle =
              colors[Math.floor(Math.random() * colors.length)];
            context.globalAlpha = 0.4 + Math.random() * 0.55;
            context.fillRect(x, y + Math.random() * 4, 2.4, 3.4);
          }
        }
      }
      context.globalAlpha = 1;

      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(18, 1);
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

    const pitchTexture = makePitchTexture();
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 140),
      new THREE.MeshStandardMaterial({
        map: pitchTexture,
        roughness: 0.95,
        metalness: 0,
      }),
    );
    pitch.rotation.x = -Math.PI / 2;
    scene.add(pitch);

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
    const crowdTexture = makeCrowdTexture();
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry(profile, latheSegments),
      new THREE.MeshStandardMaterial({
        map: crowdTexture,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
      }),
    );
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
    stadium.scale.set(1.55, 1, 1.05);
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
      scene.add(pole);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(16, 9, 5),
        new THREE.MeshStandardMaterial({ color: 0x1c2224, roughness: 0.6 }),
      );
      head.position.set(x, 90, z);
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

    const particleCount = isMobile ? 45 : 110;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const palette = [
      [0.98, 0.85, 0.6],
      [0.6, 0.95, 0.75],
      [0.9, 0.92, 0.9],
    ];
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = (Math.random() - 0.5) * 260;
      particlePositions[index * 3 + 1] = Math.random() * 70 + 4;
      particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 200;
      const color = palette[Math.floor(Math.random() * palette.length)];
      particleColors[index * 3] = color[0];
      particleColors[index * 3 + 1] = color[1];
      particleColors[index * 3 + 2] = color[2];
    }
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );
    particleGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(particleColors, 3),
    );
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        size: 1.4,
        vertexColors: true,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(particles);

    const starCount = isMobile ? 90 : 180;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      starPositions[index * 3] = (Math.random() - 0.5) * 900;
      starPositions[index * 3 + 1] = Math.random() * 220 + 90;
      starPositions[index * 3 + 2] = (Math.random() - 0.5) * 900;
    }
    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3),
    );
    const starMaterial = new THREE.PointsMaterial({
      size: 1,
      color: 0xcfe3ff,
      transparent: true,
      opacity: 0.5,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

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
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.5 : 2),
      );
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    const target = {
      background: darkBackground.clone(),
      fogColor: new THREE.Color(0x060a08),
      fogDensity: fog.density,
      ambientColor: new THREE.Color(0x24352b),
      ambientIntensity: 1.5,
      skyColor: new THREE.Color(0x30456a),
      skyIntensity: 0.45,
      starsOpacity: 0.5,
      glowOpacity: 0.85,
      lightIntensity: 1,
    };

    const setLightTheme = (isLight: boolean) => {
      if (isLight) {
        target.background.set(0xc7dce6);
        target.fogColor.set(0xd3e4ea);
        target.fogDensity = isMobile ? 0.0026 : 0.0018;
        target.ambientColor.set(0xffffff);
        target.ambientIntensity = 1.9;
        target.skyColor.set(0xfff2d2);
        target.skyIntensity = 1.15;
        target.starsOpacity = 0;
        target.glowOpacity = 0.12;
        target.lightIntensity = 0.15;
      } else {
        target.background.set(0x060a08);
        target.fogColor.set(0x060a08);
        target.fogDensity = isMobile ? 0.0048 : 0.0032;
        target.ambientColor.set(0x24352b);
        target.ambientIntensity = 1.5;
        target.skyColor.set(0x30456a);
        target.skyIntensity = 0.45;
        target.starsOpacity = 0.5;
        target.glowOpacity = 0.85;
        target.lightIntensity = 1;
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
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.elapsedTime;
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
      sky.color.lerp(target.skyColor, transitionAmount);
      sky.intensity +=
        (target.skyIntensity - sky.intensity) * transitionAmount;
      starMaterial.opacity +=
        (target.starsOpacity - starMaterial.opacity) * transitionAmount;

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
        cameraAngle += delta * 0.026;
        camera.position.x =
          Math.cos(cameraAngle) * cameraRadius + pointerX * 8;
        camera.position.z = Math.sin(cameraAngle) * cameraRadius;
        camera.position.y =
          cameraHeight + pointerY * 6 + Math.sin(elapsed * 0.15) * 1.5;
        camera.lookAt(0, 14, 0);

        glowSprites.forEach((glow, index) => {
          const size = 46 + Math.sin(elapsed * 1.6 + index) * 2.2;
          glow.scale.set(size, size, 1);
        });

        for (let index = 0; index < particleCount; index += 1) {
          particlePositions[index * 3 + 1] += delta * 1.2;
          if (particlePositions[index * 3 + 1] > 78) {
            particlePositions[index * 3 + 1] = 4;
          }
        }
        particleGeometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      themeObserver.disconnect();

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        } else if (object instanceof THREE.Sprite) {
          object.material.dispose();
        }
      });
      pitchTexture.dispose();
      crowdTexture.dispose();
      glowTexture.dispose();
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
