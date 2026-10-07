let softwareWebGL: boolean | undefined;

/**
 * Whether WebGL is rasterised on the CPU rather than a GPU (no GPU, or a
 * blocklisted one: SwiftShader, llvmpipe). There a single frame of the 3D
 * scenes costs hundreds of milliseconds of CPU, so animating them continuously
 * starves the rest of the page. Probed once per page load.
 */
export function hasSoftwareWebGL(): boolean {
  if (softwareWebGL !== undefined) return softwareWebGL;
  const probe = document.createElement("canvas");
  const gl = probe.getContext("webgl", { failIfMajorPerformanceCaveat: true });
  if (!gl) {
    softwareWebGL = true;
    return softwareWebGL;
  }
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  softwareWebGL = /swiftshader|llvmpipe|softpipe|software/i.test(name);
  return softwareWebGL;
}
