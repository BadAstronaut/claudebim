/**
 * fragments.ts — FragmentsManager Setup & Operations
 *
 * All fragment-related setup and utility functions live here.
 * Import from this file whenever you need to work with models.
 *
 * AGENT NOTE: The initialization flow is:
 *   1. fetchWorkerUrl()   — download the worker script
 *   2. setupFragments()   — init FragmentsManager with the worker URL
 *   3. Load models with   loadFragmentFromUrl() or loadFragmentFromBuffer()
 *
 * Never call fragments.core.load() before setupFragments() has run.
 */

import * as OBC from "@thatopen/components";
import type { AppWorld } from "./world";

// ─── Worker URL ───────────────────────────────────────────────────────────────
// Hosted by That Open Company. Do NOT change this URL or host it locally.
const FRAGMENTS_WORKER_URL =
  "https://thatopen.github.io/engine_fragment/resources/worker.mjs";

// ─── Worker Setup ─────────────────────────────────────────────────────────────

/**
 * Downloads the fragments Web Worker and returns a Blob URL.
 *
 * The worker is needed for background (non-blocking) processing of fragment
 * geometry and LOD. Must be called before setupFragments().
 */
export async function fetchWorkerUrl(): Promise<string> {
  const response = await fetch(FRAGMENTS_WORKER_URL);
  const blob = await response.blob();
  const file = new File([blob], "worker.mjs", { type: "text/javascript" });
  return URL.createObjectURL(file);
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initializes the FragmentsManager component with a worker and wires up
 * the mandatory event handlers that make models appear in the scene.
 *
 * AGENT NOTE: Call this once after components.init().
 * Do NOT call fragments.core.load() before this function returns.
 *
 * @param components - The main OBC.Components coordinator
 * @param world      - The world where models will be rendered
 * @param workerUrl  - Blob URL from fetchWorkerUrl()
 * @returns The configured FragmentsManager instance
 */
export function setupFragments(
  components: OBC.Components,
  world: AppWorld,
  workerUrl: string,
): OBC.FragmentsManager {
  const fragments = components.get(OBC.FragmentsManager);

  // Initialize the worker — MUST happen before any model loading
  fragments.init(workerUrl);

  // ── Required: add every loaded model to the 3D scene ──────────────────────
  // This fires automatically each time fragments.core.load() completes.
  // Without this handler models load but are completely invisible.
  fragments.list.onItemSet.add(({ value: model }) => {
    // 1. Link this model's LOD system to the current camera.
    //    Without this, detail levels won't update as you zoom in/out.
    model.useCamera(world.camera.three);

    // 2. Add the model's Three.js Object3D to the scene.
    //    model.object is the root mesh group for this model.
    world.scene.three.add(model.object);

    // 3. Force an immediate fragments system update so the model renders
    //    at the correct detail level for the current camera position.
    fragments.core.update(true);
  });

  // ── Optional: fix z-fighting between overlapping models ───────────────────
  // When multiple models share geometry space, their materials compete for
  // depth. polygonOffset gives each material a unique depth bias.
  fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
    // Skip internal LOD materials — they should not be offset
    if (!("isLodMaterial" in material && material.isLodMaterial)) {
      material.polygonOffset = true;
      material.polygonOffsetUnits = 1;
      material.polygonOffsetFactor = Math.random(); // unique per material
    }
  });

  // ── Required: sync LOD with camera movement ────────────────────────────────
  // fragments.core.update() recalculates which LOD level to show based on
  // current camera distance. Must be called on every camera move.
  world.camera.controls.addEventListener("update", () => {
    fragments.core.update();
  });

  return fragments;
}

// ─── Model Loading ───────────────────────────────────────────────────────────

/**
 * Loads a .frag model from a URL.
 *
 * The model is automatically added to the scene via the onItemSet handler
 * registered in setupFragments(). You do not need to add it manually.
 *
 * @param fragments - FragmentsManager instance from setupFragments()
 * @param url       - URL to the .frag file
 * @param modelId   - Unique ID for this model (used to reference/dispose it later)
 */
export async function loadFragmentFromUrl(
  fragments: OBC.FragmentsManager,
  url: string,
  modelId: string,
): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  await fragments.core.load(buffer, { modelId });
  // onItemSet fires here → model appears in scene automatically
}

/**
 * Loads a .frag model from an ArrayBuffer (e.g. from a File input).
 *
 * @param fragments - FragmentsManager instance from setupFragments()
 * @param buffer    - Raw binary data of the .frag file
 * @param modelId   - Unique ID for this model
 */
export async function loadFragmentFromBuffer(
  fragments: OBC.FragmentsManager,
  buffer: ArrayBuffer,
  modelId: string,
): Promise<void> {
  await fragments.core.load(buffer, { modelId });
}

// ─── Model Management ────────────────────────────────────────────────────────

/**
 * Removes a single model from the scene and frees its memory.
 *
 * After calling this, the model is removed from fragments.list
 * and the onItemDeleted event fires.
 */
export function disposeModel(
  fragments: OBC.FragmentsManager,
  modelId: string,
): void {
  fragments.core.disposeModel(modelId);
}

/**
 * Removes ALL loaded models from the scene and frees their memory.
 */
export function disposeAllModels(fragments: OBC.FragmentsManager): void {
  for (const [modelId] of fragments.list) {
    fragments.core.disposeModel(modelId);
  }
}

// ─── Model Export ────────────────────────────────────────────────────────────

/**
 * Exports all currently loaded models as .frag files (browser download).
 *
 * @param fragments - FragmentsManager instance
 */
export async function downloadAllModels(
  fragments: OBC.FragmentsManager,
): Promise<void> {
  for (const [, model] of fragments.list) {
    // getBuffer(false) = no compression — set to true for smaller files
    const buffer = await model.getBuffer(false);
    const file = new File([buffer], `${model.modelId}.frag`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
