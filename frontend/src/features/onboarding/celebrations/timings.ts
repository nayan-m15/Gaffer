/** Delay after the unlock click before `scene.play()`. */
export const SCENE_PLAY_DELAY_MS = 280;
/** Goal-kick flight only — do not lengthen this when stretching the build-up. */
export const BALL_MS = 620;
/** Click → impact. */
export const IMPACT_MS = 1200;
/** When the goal kick starts (`IMPACT_MS - BALL_MS`). */
export const BALL_DELAY_MS = IMPACT_MS - BALL_MS;
/** Play → impact; non-goal scenes spread their build-up across this window. */
export const BUILD_MS = IMPACT_MS - SCENE_PLAY_DELAY_MS;
/** Same gap after impact as before (was 2300 − 900). */
export const REVEAL_MS = IMPACT_MS + 1400;
export const SECOND_WAVE_MS = IMPACT_MS + 280;
export const BACKDROP_OUT_MS = 380;
export const STAMP_MS = 1600;
export const CONFETTI_LIFE_MS = 3000;
export const CONFETTI_FADE_MS = 600;
export const MAX_PIECES = 550;
export const BALL_SIZE_PX = 20;
