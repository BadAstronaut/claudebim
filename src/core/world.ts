/**
 * world.ts — Scene / Camera / Renderer Setup
 *
 * Creates a fully initialized OBC "world" — the 3D environment.
 * A world is a self-contained combination of a Three.js scene,
 * a camera, and a WebGL renderer.
 *
 * AGENT NOTE: Call setupWorld() once at startup. The returned `world`
 * object is what you pass to fragment loaders, grid helpers, etc.
 */

import * as OBC from "@thatopen/components";

export type AppWorld = OBC.World & {
  scene: OBC.SimpleScene;
  camera: OBC.OrthoPerspectiveCamera;
  renderer: OBC.SimpleRenderer;
};

/**
 * Creates and configures the 3D world.
 *
 * @param components - The main OBC.Components coordinator instance
 * @param container  - The HTML div element that will host the WebGL canvas
 * @returns The configured world instance
 *
 * AGENT NOTE: This function handles the mandatory setup order:
 *   scene → renderer → camera → (caller calls components.init()) → done
 */
export async function setupWorld(
  components: OBC.Components,
  container: HTMLElement,
): Promise<AppWorld> {
  const worlds = components.get(OBC.Worlds);

  // Create a world with specific scene / camera / renderer types.
  // The generics are hints only — the real types are set below.
  const world = worlds.create<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  >();

  // --- SCENE ---
  // SimpleScene wraps THREE.Scene and sets up default lighting.
  // Always call setup() after creating.
  world.scene = new OBC.SimpleScene(components);
  world.scene.setup(); // sets ambient + directional lights
  world.scene.three.background = null; // null = transparent (shows CSS background)

  // --- RENDERER ---
  // SimpleRenderer creates a THREE.WebGLRenderer inside the container div.
  world.renderer = new OBC.SimpleRenderer(components, container);

  // --- CAMERA ---
  // OrthoPerspectiveCamera supports Orbit, First-Person, and Plan (top-down) modes.
  world.camera = new OBC.OrthoPerspectiveCamera(components);

  // Position the camera: setLookAt(cameraX, cameraY, cameraZ, targetX, targetY, targetZ)
  // Adjust these numbers to frame your model. Use BoundingBoxer to auto-fit after loading.
  await world.camera.controls.setLookAt(78, 20, -2.2, 26, -4, 25);

  return world as AppWorld;
}

/**
 * Creates a reference grid on the ground plane of a world.
 *
 * @param components - The main OBC.Components coordinator instance
 * @param world      - The world to add the grid to
 *
 * AGENT NOTE: Grids are optional visual helpers. Safe to skip.
 */
export function addGrid(components: OBC.Components, world: AppWorld): void {
  components.get(OBC.Grids).create(world);
}
