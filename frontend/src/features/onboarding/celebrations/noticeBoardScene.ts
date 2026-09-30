import { createSceneRoot, sceneCenter, type SceneController } from "./types";

export function createNoticeBoardScene(visual: HTMLElement): SceneController {
  const root = createSceneRoot("unlock-scene-notice");
  root.innerHTML = `
    <div class="unlock-scene-notice-board">
      <span class="unlock-scene-notice-label">DRESSING ROOM</span>
      <div class="unlock-scene-note" data-kind="match" style="--note-delay: 0ms; --from-rot: -16deg; --land-rot: -7deg; left: 7%; top: 30%;">
        <span class="unlock-scene-pin"></span>
        <div class="unlock-scene-note-header">MATCH</div>
        <span class="unlock-scene-note-line"></span>
        <span class="unlock-scene-note-line unlock-scene-note-line-short"></span>
      </div>
      <div class="unlock-scene-note" data-kind="training" style="--note-delay: 150ms; --from-rot: 14deg; --land-rot: 5deg; left: 35%; top: 46%;">
        <span class="unlock-scene-pin"></span>
        <div class="unlock-scene-note-header">TRAINING</div>
        <span class="unlock-scene-note-line"></span>
        <span class="unlock-scene-note-line unlock-scene-note-line-short"></span>
      </div>
      <div class="unlock-scene-note" data-kind="meeting" style="--note-delay: 300ms; --from-rot: -12deg; --land-rot: -3deg; left: 62%; top: 28%;">
        <span class="unlock-scene-pin"></span>
        <div class="unlock-scene-note-header">MEETING</div>
        <span class="unlock-scene-note-line"></span>
        <span class="unlock-scene-note-line unlock-scene-note-line-short"></span>
      </div>
    </div>
  `;
  visual.append(root);

  return {
    root,
    play() {
      for (const note of root.querySelectorAll(".unlock-scene-note")) {
        note.classList.add("is-flying");
      }
    },
    impact() {},
    getImpactOrigin() {
      const board = root.querySelector(".unlock-scene-notice-board");
      if (board instanceof HTMLElement) return sceneCenter(board);
      return sceneCenter(root);
    },
    teardown() {},
  };
}
