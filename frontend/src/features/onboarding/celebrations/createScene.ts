import type { UnlockPageKey } from "../unlocks";
import { createGoalScene } from "./goalScene";
import { createMatchTimelineScene } from "./matchTimelineScene";
import { createMedicalScanScene } from "./medicalScanScene";
import { createNoticeBoardScene } from "./noticeBoardScene";
import { createPlayerRadarScene } from "./playerRadarScene";
import { createTacticsBoardScene } from "./tacticsBoardScene";
import type { SceneController } from "./types";

export function createUnlockScene(
  pageKey: UnlockPageKey,
  visual: HTMLElement,
): SceneController {
  switch (pageKey) {
    case "events":
      return createNoticeBoardScene(visual);
    case "team":
      return createTacticsBoardScene(visual);
    case "injuries":
      return createMedicalScanScene(visual);
    case "live-logger":
      return createMatchTimelineScene(visual);
    case "statistics":
      return createPlayerRadarScene(visual);
    default:
      return createGoalScene(visual);
  }
}
