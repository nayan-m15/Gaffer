import { useEffect, useRef } from "react";
import * as THREE from "three";
import { hasSoftwareWebGL } from "@/lib/software-webgl";
import { buildStadium, disposeStadium } from "./stadium-architecture";

/** Builds the scene on `canvas` and starts rendering; returns its teardown. */
function mountStadium(canvas: HTMLCanvasElement): (() => void) | undefined {
  // Software rendering gets a still, unshadowed, non-antialiased frame that
  // only re-renders on resize or theme change, like reduced motion.
  const software = hasSoftwareWebGL();
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !software, powerPreference: "low-power" });
  } catch {
    return; // Keep the dashboard usable on devices without WebGL.
  }
  // r128's outputEncoding is the supported API. Direct rendering avoids
  // full-resolution bloom/composer targets on an always-present background.
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !software;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0x101c30, 0.0018);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 1000);
  const stadium = buildStadium(renderer.capabilities.getMaxAnisotropy());
  scene.add(stadium.group);
  renderer.shadowMap.needsUpdate = true;
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x101c35) },
      horizon: { value: new THREE.Color(0x82665c) },
    },
    vertexShader: `varying vec3 direction;
      void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec3 direction; uniform vec3 top; uniform vec3 horizon;
      void main() {
        vec3 d = normalize(direction);
        float h = smoothstep(-.08, .5, d.y);
        float cloud = sin(d.x * 27. + d.z * 19.) * sin(d.z * 31. - d.y * 42.);
        vec3 color = mix(horizon, top, h) + cloud * .003 * smoothstep(.05, .3, d.y);
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMaterial));
  const fill = new THREE.HemisphereLight(0xa7bddb, 0x3c4540, 0.85);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xffdbb0, 1.8);
  sun.position.set(-45, 100, -65);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -115, right: 115, top: 100, bottom: -100, near: 1, far: 260 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.12;
  scene.add(sun);
  // Four real lights under the canopy serve hundreds of instanced lamps.
  const floodlights = [[-40, -54], [40, -54], [-40, 54], [40, 54]].map(([x, z]) => {
    const light = new THREE.SpotLight(0xe3edff, 1.8, 190, 0.85, 0.7, 1);
    light.position.set(x, 45.35, z);
    light.target.position.set(x * 0.3, 0, z * 0.2);
    scene.add(light, light.target);
    return light;
  });
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => software || motionQuery.matches;
  let mobile = false;
  let pointerX = 0;
  let pointerY = 0;
  let night = document.documentElement.classList.contains("dark") ? 1 : 0;
  let targetNight = night;
  const dayTop = new THREE.Color(0x5794c3).convertSRGBToLinear(), dayHorizon = new THREE.Color(0xbad0df).convertSRGBToLinear();
  const nightTop = new THREE.Color(0x0b142b).convertSRGBToLinear(), nightHorizon = new THREE.Color(0x343a51).convertSRGBToLinear();
  const dayFog = new THREE.Color(0xb4cad8), nightFog = new THREE.Color(0x182239);
  const daySun = new THREE.Color(0xffdeb1), nightSun = new THREE.Color(0x91b1de);
  const lookTarget = new THREE.Vector3();
  let panElapsed = 0;
  const frameCamera = () => {
    if (mobile) {
      // Portrait looks along the long axis rather than cropping the corner view.
      camera.position.set(91, 38, 8);
      lookTarget.set(-12, 8, 0);
    } else {
      camera.position.set(74, 39, 56);
      lookTarget.set(-5, 6, -5);
    }
    // Keep the orbit inside the bowl; sweep 45 degrees in 60 seconds.
    const angle = still() ? 0 : -Math.cos(panElapsed * Math.PI / 60) * Math.PI / 8;
    const x = camera.position.x - lookTarget.x;
    const z = camera.position.z - lookTarget.z;
    camera.position.x = lookTarget.x + x * Math.cos(angle) - z * Math.sin(angle);
    camera.position.z = lookTarget.z + x * Math.sin(angle) + z * Math.cos(angle);
    if (!mobile && !still()) {
      camera.position.x += pointerX * 1.4;
      camera.position.y += pointerY * 0.7;
    }
    camera.lookAt(lookTarget);
  };
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    mobile = width / height < 0.85;
    camera.aspect = width / height;
    camera.fov = mobile ? 58 : width / height < 1.4 ? 55 : 50;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 760 ? 1.25 : 1.5, Math.sqrt(2_600_000 / (width * height))));
    renderer.setSize(width, height, false);
    frameCamera();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  window.addEventListener("resize", resize);
  resize();
  const syncTheme = () => {
    targetNight = document.documentElement.classList.contains("dark") ? 1 : 0;
    invalidate();
  };
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const pointerMove = (event: PointerEvent) => {
    if (mobile || still()) return;
    pointerX = event.clientX / window.innerWidth - 0.5;
    pointerY = event.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener("pointermove", pointerMove, { passive: true });
  let animationFrame = 0, lastRender = -Infinity, lastTime = 0;
  let stopped = false;
  const render = (time: number) => {
    animationFrame = 0;
    if (stopped || document.hidden) return;
    // Cap rendering at 30fps; the animation path allocates no Three objects.
    if (time - lastRender >= 1000 / 30) {
      const delta = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      lastRender = time;
      if (!still()) panElapsed += delta;
      night += (targetNight - night) * (still() ? 1 : 1 - Math.exp(-delta * 5));
      if (Math.abs(targetNight - night) < 0.002) night = targetNight;
      (skyMaterial.uniforms.top.value as THREE.Color).copy(dayTop).lerp(nightTop, night);
      (skyMaterial.uniforms.horizon.value as THREE.Color).copy(dayHorizon).lerp(nightHorizon, night);
      fog.color.copy(dayFog).lerp(nightFog, night);
      fog.density = 0.0012 + night * 0.0006;
      fill.intensity = 1.05 - night * 0.45;
      sun.color.copy(daySun).lerp(nightSun, night);
      sun.intensity = 1.8 - night * 1.5;
      floodlights.forEach((light) => { light.intensity = 0.08 + night * 0.95; });
      stadium.setNight(night);
      renderer.toneMappingExposure = 0.92 + night * 0.16;
      frameCamera();
      renderer.render(scene, camera);
      canvas.dataset.ready = "true";
    }
    if (!still() || night !== targetNight) animationFrame = requestAnimationFrame(render);
  };
  function invalidate() {
    if (!animationFrame && !stopped && !document.hidden) {
      lastRender = -Infinity;
      animationFrame = requestAnimationFrame(render);
    }
  }
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else invalidate();
  };
  // Also wake a static reduced-motion scene after container resizing.
  const renderObserver = new ResizeObserver(invalidate);
  renderObserver.observe(canvas);
  document.addEventListener("visibilitychange", onVisibility);
  motionQuery.addEventListener("change", invalidate);
  invalidate();
  return () => {
    stopped = true;
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", pointerMove);
    document.removeEventListener("visibilitychange", onVisibility);
    motionQuery.removeEventListener("change", invalidate);
    resizeObserver.disconnect();
    renderObserver.disconnect();
    themeObserver.disconnect();
    disposeStadium(scene);
    renderer.dispose();
    // StrictMode reuses the mounted canvas during its effect replay.
    if (!canvas.isConnected) renderer.forceContextLoss();
    delete canvas.dataset.ready;
    scene.clear();
  };
}

/** Presentation-only environment shared by the coach and player dashboards. */
export function StadiumScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Decorative, so let the dashboard render and send its requests first:
    // building the stadium and compiling its shaders blocks the main thread
    // for seconds on slow devices and with software WebGL.
    let teardown: (() => void) | undefined;
    const start = () => { teardown = mountStadium(canvas); };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(start, { timeout: 1500 });
      return () => { window.cancelIdleCallback(handle); teardown?.(); };
    }
    const handle = window.setTimeout(start, 0);
    return () => { window.clearTimeout(handle); teardown?.(); };
  }, []);
  return <div className="dashboard-stadium-scene" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
