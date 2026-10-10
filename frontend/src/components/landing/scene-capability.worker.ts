// Probe without blocking input or loading Three.js on software-rendered devices.
try {
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) self.postMessage(true);
  else {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER));
    self.postMessage(!/swiftshader|llvmpipe|software/i.test(renderer));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
} catch {
  // Unsupported worker WebGL is inconclusive; retain the main-thread fallback.
  self.postMessage(true);
}
