/**
 * main.ts — Application Entry Point
 *
 * This file wires together the three main concerns:
 *   1. 3D World   → src/core/world.ts
 *   2. Fragments  → src/core/fragments.ts
 *   3. UI Panel   → src/ui/panel.ts
 *
 * AGENT NOTE: Keep this file thin. Put feature logic in src/core/ or src/ui/.
 * Initialization order here is mandatory — see CLAUDE.md §4 for details.
 *
 * See also:
 *   CLAUDE.md              — full API reference and patterns
 *   src/core/fragments.ts  — model loading and management functions
 *   src/core/world.ts      — scene/camera/renderer setup
 *   src/ui/panel.ts        — BUI side panel and controls
 *   src/snippets/          — copy-paste patterns (IFC loading, etc.)
 */

import Stats from "stats.js";
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";

import { setupWorld, addGrid } from "./core/world";
import { fetchWorkerUrl, setupFragments } from "./core/fragments";
import { createPanel, createMobileToggle } from "./ui/panel";

// ─── 1. Bootstrap ─────────────────────────────────────────────────────────────

// OBC.Components is the central coordinator. All tools are accessed through it.
// There is only ever one instance per application.
const components = new OBC.Components();

// Grab the viewport div from index.html (#container).
// The renderer will draw into this element.
const container = document.getElementById("container")!;

// ─── 2. Create the 3D World ───────────────────────────────────────────────────

// Sets up scene (lights), renderer (WebGL canvas), and camera (orbit controls).
// MUST happen before components.init().
const world = await setupWorld(components, container);

// ─── 3. Start the Render Loop ─────────────────────────────────────────────────

// components.init() starts the Three.js render loop and the component system.
// MUST be called after scene + camera + renderer are all assigned to the world.
components.init();

// ─── 4. Add Scene Helpers ─────────────────────────────────────────────────────

// Optional: reference grid on the ground plane
addGrid(components, world);

// ─── 5. Initialize FragmentsManager ──────────────────────────────────────────

// The fragments worker must be fetched remotely before fragment loading can begin.
// setupFragments() also registers the mandatory onItemSet handler that adds
// loaded models to the scene automatically.
const workerUrl = await fetchWorkerUrl();
const fragments = setupFragments(components, world, workerUrl);

// ─── 6. Build the UI ──────────────────────────────────────────────────────────

// BUI.Manager.init() MUST be called before any BUI.Component.create() calls.
BUI.Manager.init();

const [panel, updatePanel] = createPanel(fragments);
const mobileToggle = createMobileToggle(panel);

// Re-render the panel whenever the model list changes
fragments.list.onItemSet.add(() => updatePanel());
fragments.list.onItemDeleted.add(() => updatePanel());

document.body.append(panel, mobileToggle);

// ─── 7. Performance Monitor ───────────────────────────────────────────────────

// stats.js panel: shows memory usage (panel 2). Drag to move.
// Remove this block if you don't need frame stats.
const stats = new Stats();
stats.showPanel(2); // 0=fps, 1=ms, 2=MB
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "unset";
document.body.append(stats.dom);

world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());
