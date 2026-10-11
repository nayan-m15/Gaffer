/** Preserve the original 60 Hz easing while catching up equally fast at 30 Hz. */
export function advanceSceneProgress(current: number, target: number, elapsedMs: number, lowPower: boolean): number {
  const difference = target - current;
  if (Math.abs(difference) < .00008) return target;
  // Bound long resume/stall gaps so returning to the page does not teleport.
  const frames = Math.max(0, Math.min(elapsedMs, 100)) / (1000 / 60);
  const blend = 1 - Math.pow(1 - (lowPower ? .12 : .095), frames);
  const next = current + difference * blend;
  return Math.abs(target - next) < .00008 ? target : next;
}
