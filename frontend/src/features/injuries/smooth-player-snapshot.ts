import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Renders `smooth_player.glb` to a single static front-view PNG, for the
 * Muscle recovery strip's seven body-group icons.
 *
 * Those icons used to be hand-drawn SVG silhouettes specifically so the page
 * never had to run seven live WebGL contexts for glyphs this small. Reusing
 * the real mannequin model without paying that cost means rendering it
 * exactly once — to an offscreen canvas nothing ever mounts — and caching
 * the resulting image for every icon (and every remount) to share.
 */

const MODEL_URL = "/models/smooth_player.glb";
/** Matches BodyModelViewer's frame: feet at y = 0, crown at y ≈ 1.80. */
const FIGURE_HEIGHT = 1.8;
/** Matches BODY_COLOR in BodyModelViewer, for the same neutral look. */
const BODY_COLOR = 0xe8e8e8;
/**
 * `smooth_player.glb`'s bind pose is a T-pose; rotating just the upper-arm
 * bones down before baking gets a relaxed standing pose without needing any
 * animation data (see BodyModelViewer's git history for the fuller
 * rationale — this snapshot only needs the result, not the interactivity).
 */
const RELAXED_ARM_ANGLE_FROM_DOWN_DEG = 15;
const LEFT_UPPER_ARM_BONE = "mixamorig1LeftArm_09";
const LEFT_FOREARM_BONE = "mixamorig1LeftForeArm_010";
const RIGHT_UPPER_ARM_BONE = "mixamorig1RightArm_033";
const RIGHT_FOREARM_BONE = "mixamorig1RightForeArm_034";
/** Render resolution — oversampled relative to the ~64px-tall icon so it
 * stays crisp after the browser scales it down; matches the icons' 40:72
 * aspect ratio so the captured PNG fills their viewBox exactly. */
const RENDER_WIDTH = 200;
const RENDER_HEIGHT = 360;

function orientToYUp(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.z > size.y) {
    root.rotation.x = -Math.PI / 2;
  }
}

const SKIN_COMPONENT_GETTERS = [
  (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    attr.getX(i),
  (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    attr.getY(i),
  (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    attr.getZ(i),
  (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    attr.getW(i),
];

/** Bakes a SkinnedMesh's current (bind) pose into a plain, static Mesh — see
 * BodyModelViewer's git history for why runtime skinning is avoided here. */
function bakeSkinnedMesh(mesh: THREE.SkinnedMesh): THREE.Mesh {
  mesh.skeleton.update();
  const boneMatrices = mesh.skeleton.boneMatrices;

  const sourceGeometry = mesh.geometry;
  const positionAttr = sourceGeometry.attributes.position;
  const normalAttr = sourceGeometry.attributes.normal;
  const skinIndexAttr = sourceGeometry.attributes.skinIndex;
  const skinWeightAttr = sourceGeometry.attributes.skinWeight;

  const bakedPositions = new Float32Array(positionAttr.count * 3);
  const bakedNormals = new Float32Array(positionAttr.count * 3);

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const skinMatrix = new THREE.Matrix4();
  const vertexMatrix = new THREE.Matrix4();
  const weightedSum = new Float32Array(16);

  for (let i = 0; i < positionAttr.count; i++) {
    vertex.fromBufferAttribute(positionAttr, i);
    normal.fromBufferAttribute(normalAttr, i);

    weightedSum.fill(0);
    for (let influence = 0; influence < 4; influence++) {
      const weight = SKIN_COMPONENT_GETTERS[influence](skinWeightAttr, i);
      if (weight === 0) {
        continue;
      }
      const boneOffset =
        SKIN_COMPONENT_GETTERS[influence](skinIndexAttr, i) * 16;
      for (let e = 0; e < 16; e++) {
        weightedSum[e] += boneMatrices[boneOffset + e] * weight;
      }
    }
    skinMatrix.fromArray(weightedSum);
    vertexMatrix
      .copy(mesh.bindMatrixInverse)
      .multiply(skinMatrix)
      .multiply(mesh.bindMatrix);

    vertex.applyMatrix4(vertexMatrix);
    normal.transformDirection(vertexMatrix);

    bakedPositions[i * 3] = vertex.x;
    bakedPositions[i * 3 + 1] = vertex.y;
    bakedPositions[i * 3 + 2] = vertex.z;
    bakedNormals[i * 3] = normal.x;
    bakedNormals[i * 3 + 1] = normal.y;
    bakedNormals[i * 3 + 2] = normal.z;
  }

  const bakedGeometry = new THREE.BufferGeometry();
  bakedGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(bakedPositions, 3),
  );
  bakedGeometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(bakedNormals, 3),
  );
  const uv = sourceGeometry.attributes.uv;
  if (uv) {
    bakedGeometry.setAttribute("uv", uv);
  }
  if (sourceGeometry.index) {
    bakedGeometry.setIndex(sourceGeometry.index);
  }

  const baked = new THREE.Mesh(bakedGeometry, mesh.material);
  baked.name = mesh.name;
  return baked;
}

function relaxArmBone(
  bone: THREE.Object3D,
  child: THREE.Object3D,
  angleFromDownDeg: number,
) {
  bone.updateMatrixWorld(true);
  const boneWorldPos = new THREE.Vector3();
  bone.getWorldPosition(boneWorldPos);
  const childWorldPos = new THREE.Vector3();
  child.getWorldPosition(childWorldPos);
  const currentDir = childWorldPos.sub(boneWorldPos).normalize();

  const horizontal = new THREE.Vector3(currentDir.x, 0, currentDir.z);
  if (horizontal.lengthSq() < 1e-6) {
    return;
  }
  horizontal.normalize();

  const angleRad = THREE.MathUtils.degToRad(angleFromDownDeg);
  const targetDir = new THREE.Vector3(
    horizontal.x * Math.sin(angleRad),
    -Math.cos(angleRad),
    horizontal.z * Math.sin(angleRad),
  ).normalize();

  const rotationDelta = new THREE.Quaternion().setFromUnitVectors(
    currentDir,
    targetDir,
  );
  const boneWorldQuat = new THREE.Quaternion();
  bone.getWorldQuaternion(boneWorldQuat);
  const desiredWorldQuat = rotationDelta.multiply(boneWorldQuat);

  const parentWorldQuat = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorldQuat);
  const localQuat = parentWorldQuat.invert().multiply(desiredWorldQuat);
  bone.quaternion.copy(localQuat);
  bone.updateMatrixWorld(true);
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!found && child.name === name) {
      found = child;
    }
  });
  return found;
}

function renderSnapshot(): Promise<string> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        try {
          const root = gltf.scene;
          orientToYUp(root);
          root.updateMatrixWorld(true);

          const leftUpperArm = findByName(root, LEFT_UPPER_ARM_BONE);
          const leftForearm = findByName(root, LEFT_FOREARM_BONE);
          const rightUpperArm = findByName(root, RIGHT_UPPER_ARM_BONE);
          const rightForearm = findByName(root, RIGHT_FOREARM_BONE);
          if (leftUpperArm && leftForearm) {
            relaxArmBone(leftUpperArm, leftForearm, RELAXED_ARM_ANGLE_FROM_DOWN_DEG);
          }
          if (rightUpperArm && rightForearm) {
            relaxArmBone(rightUpperArm, rightForearm, RELAXED_ARM_ANGLE_FROM_DOWN_DEG);
          }

          const skinnedReplacements: Array<{
            parent: THREE.Object3D;
            skinned: THREE.SkinnedMesh;
            baked: THREE.Mesh;
          }> = [];
          root.traverse((child) => {
            if ((child as THREE.SkinnedMesh).isSkinnedMesh && child.parent) {
              const skinned = child as THREE.SkinnedMesh;
              skinnedReplacements.push({
                parent: child.parent,
                skinned,
                baked: bakeSkinnedMesh(skinned),
              });
            }
          });
          const bodyMaterial = new THREE.MeshStandardMaterial({
            color: BODY_COLOR,
            roughness: 0.7,
            metalness: 0.02,
          });
          for (const { parent, skinned, baked } of skinnedReplacements) {
            baked.position.copy(skinned.position);
            baked.rotation.copy(skinned.rotation);
            baked.scale.copy(skinned.scale);
            baked.material = bodyMaterial;
            parent.add(baked);
            parent.remove(skinned);
          }

          root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(root);
          const height = box.max.y - box.min.y || 1;
          const scale = FIGURE_HEIGHT / height;
          const centerX = (box.min.x + box.max.x) / 2;
          root.scale.setScalar(scale);
          root.position.set(-centerX * scale, -box.min.y * scale, 0);
          root.updateMatrixWorld(true);

          const scene = new THREE.Scene();
          scene.add(root);
          scene.add(new THREE.AmbientLight(0xffffff, 0.55));
          const key = new THREE.DirectionalLight(0xffffff, 0.9);
          key.position.set(1.2, 2.4, 3);
          scene.add(key);
          const fill = new THREE.DirectionalLight(0xffffff, 0.35);
          fill.position.set(-1.6, 1, -2);
          scene.add(fill);

          // Orthographic top/bottom/left/right are offsets from the
          // camera's own look direction, not absolute world Y — centering
          // the frustum on the same point the camera looks at (mid-figure)
          // is what actually frames feet-to-head with even padding.
          const halfHeight = (FIGURE_HEIGHT / 2) * 1.06;
          const halfWidth = halfHeight * (RENDER_WIDTH / RENDER_HEIGHT);
          const camera = new THREE.OrthographicCamera(
            -halfWidth,
            halfWidth,
            halfHeight,
            -halfHeight,
            0.1,
            20,
          );
          camera.position.set(0, FIGURE_HEIGHT / 2, 4);
          camera.lookAt(0, FIGURE_HEIGHT / 2, 0);

          const canvas = document.createElement("canvas");
          const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
          });
          renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT, false);
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1;
          renderer.render(scene, camera);

          const dataUrl = canvas.toDataURL("image/png");

          root.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
            }
          });
          bodyMaterial.dispose();
          renderer.dispose();

          resolve(dataUrl);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

let cachedSnapshot: Promise<string> | null = null;

/** The rendered snapshot, computed once per page session and shared by
 * every caller (including remounts) from then on. */
export function getSmoothPlayerSnapshot(): Promise<string> {
  if (!cachedSnapshot) {
    cachedSnapshot = renderSnapshot().catch((error) => {
      // Let the next caller try again rather than permanently caching a
      // failure (e.g. a transient network blip fetching the .glb).
      cachedSnapshot = null;
      throw error;
    });
  }
  return cachedSnapshot;
}
