export type ImpactOrigin = { x: number; y: number };

export type SceneController = {
  root: HTMLElement;
  play: () => void;
  impact: () => void;
  getImpactOrigin: () => ImpactOrigin;
  teardown: () => void;
};

export function createSceneRoot(extraClass?: string): HTMLElement {
  const root = document.createElement("div");
  root.className = extraClass
    ? `goal-unlock-goal ${extraClass}`
    : "goal-unlock-goal";
  return root;
}

export function sceneCenter(root: HTMLElement): ImpactOrigin {
  const rect = root.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}
