import { BUILD_MS } from "./timings";
import { createSceneRoot, sceneCenter, type SceneController } from "./types";

export function createNoticeBoardScene(visual: HTMLElement): SceneController {
  const root = createSceneRoot("unlock-scene-notice");
  const noteDuration = Math.round(BUILD_MS * 0.42);
  const noteGap = Math.round((BUILD_MS - noteDuration) / 2);
  const pinDelay = Math.round(noteDuration * 0.82);
  const notes = [
    { kind: "match", from: "-16deg", land: "-7deg", left: "7%", top: "30%", delay: 0 },
    {
      kind: "training",
      from: "14deg",
      land: "5deg",
      left: "35%",
      top: "46%",
      delay: noteGap,
    },
    {
      kind: "meeting",
      from: "-12deg",
      land: "-3deg",
      left: "62%",
      top: "28%",
      delay: noteGap * 2,
    },
  ] as const;

  root.innerHTML = `
    <div class="unlock-scene-notice-board">
      <span class="unlock-scene-notice-label">DRESSING ROOM</span>
      ${notes
        .map(
          (note) => `
      <div class="unlock-scene-note" data-kind="${note.kind}" style="--note-delay: ${note.delay}ms; --note-duration: ${noteDuration}ms; --pin-delay: ${pinDelay}ms; --from-rot: ${note.from}; --land-rot: ${note.land}; left: ${note.left}; top: ${note.top};">
        <span class="unlock-scene-pin"></span>
        <div class="unlock-scene-note-header">${note.kind.toUpperCase()}</div>
        <span class="unlock-scene-note-line"></span>
        <span class="unlock-scene-note-line unlock-scene-note-line-short"></span>
      </div>`,
        )
        .join("")}
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
