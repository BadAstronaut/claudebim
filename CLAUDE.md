# CLAUDE.md — AI Agent Reference for claudebim

This document is the **primary reference for AI agents** (Claude, OpenClaw, etc.) working on this project.
Read it fully before writing any code. Every pattern here reflects working, tested code.

---

> ## ⚠️ CRITICAL: You Must Be Using the Correct API Version
>
> There are **two completely incompatible versions** of this library in the wild.
> Many AI training examples, tutorials, and Stack Overflow answers use the **old v1 API**.
> This project uses **v3**. Writing v1 code in a v3 project will always fail silently or crash.
>
> | Signal | API Version |
> |--------|------------|
> | `import * as OBC from "openbim-components"` | ❌ v1 — **DO NOT USE** |
> | `import * as OBC from "@thatopen/components"` | ✅ v3 — **THIS PROJECT** |
>
> See [Section 13](#13-v1-api-openbim-components-vs-v3-api-thatopencomponents) for the full migration table.

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [Tech Stack & Versions](#2-tech-stack--versions)
3. [Project File Structure](#3-project-file-structure)
4. [Initialization Order — Critical](#4-initialization-order--critical)
5. [Component System](#5-component-system)
6. [Worlds System (Scene / Camera / Renderer)](#6-worlds-system)
7. [FragmentsManager — Deep Dive](#7-fragmentsmanager--deep-dive)
8. [UI System (@thatopen/ui)](#8-ui-system-thatopenui)
9. [Common Patterns (Copy-Paste Ready)](#9-common-patterns)
10. [Common Mistakes — Do Not Do These](#10-common-mistakes)
11. [How to Add a New Feature](#11-how-to-add-a-new-feature)
12. [API Quick Reference](#12-api-quick-reference)
13. [V1 API vs V3 API — Full Comparison](#13-v1-api-openbim-components-vs-v3-api-thatopencomponents)
14. [WASM Loading Options (web-ifc)](#14-wasm-loading-options-web-ifc)

---

## 1. What This Project Is

A browser-based BIM (Building Information Modeling) viewer built on:
- **@thatopen/components** — the main BIM component system
- **@thatopen/fragments** — the binary 3D model format used for IFC models
- **Three.js** — 3D rendering engine underneath everything
- **@thatopen/ui** — Web Component UI library (built on Lit)
- **Vite** — build tool and dev server

The app loads `.frag` files (pre-converted IFC models) and renders them in a 3D WebGL viewport.

---

## 2. Tech Stack & Versions

```json
{
  "@thatopen/components": "^3.3.2",
  "@thatopen/fragments": "~3.3.0",
  "@thatopen/ui": "~3.3.0",
  "three": "^0.175.0",
  "stats.js": "^0.17.0"
}
```

**DevDependencies:**
```json
{
  "typescript": "^5.7.3",
  "vite": "^6.0.11"
}
```

**Important version notes:**
- `three` must be `>=0.175.0` — fragments library requires this exact API surface
- `@thatopen/fragments` and `@thatopen/components` must stay on the same `~3.3.x` minor version
- `web-ifc` (only needed if converting IFC files to fragments) must be `>=0.0.74`

---

## 3. Project File Structure

```
claudebim/
├── CLAUDE.md                    ← You are here. Read first.
├── index.html                   ← HTML shell. Has #container div for 3D viewport.
├── package.json
├── tsconfig.json                ← strict mode, ES2022, bundler resolution
├── vite.config.ts               ← base: "./" (relative paths for GH Pages)
└── src/
    ├── main.ts                  ← Entry point. Wires everything together.
    ├── core/
    │   ├── world.ts             ← Creates OBC world (scene + camera + renderer)
    │   └── fragments.ts         ← Sets up FragmentsManager (worker + events)
    ├── ui/
    │   └── panel.ts             ← BUI side panel with controls
    └── snippets/
        └── ifc-loader.ts        ← Reference: converting .ifc files to .frag
```

**Where to add new things:**
- New 3D features (tools, overlays) → add a new file in `src/core/`
- New UI controls → add to `src/ui/panel.ts` or create a new panel file
- New model operations → add functions to `src/core/fragments.ts`

---

## 4. Initialization Order — Critical

**This order is mandatory. Any deviation causes silent failures or crashes.**

```typescript
// Step 1: Create the main coordinator
const components = new OBC.Components();

// Step 2: Get the Worlds manager and create a world
const worlds = components.get(OBC.Worlds);
const world = worlds.create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>();

// Step 3: Assign scene, renderer, camera to the world (ALL THREE must be set)
world.scene = new OBC.SimpleScene(components);
world.scene.setup(); // initializes default lighting + environment
world.scene.three.background = null; // transparent background (optional)

world.renderer = new OBC.SimpleRenderer(components, container); // container = #container div
world.camera = new OBC.OrthoPerspectiveCamera(components);

// Step 4: Set camera position BEFORE init (optional but cleaner)
await world.camera.controls.setLookAt(78, 20, -2.2, 26, -4, 25);
// setLookAt(cameraX, cameraY, cameraZ, targetX, targetY, targetZ)

// Step 5: Init the component system — starts the render loop
components.init(); // MUST come after scene + camera + renderer are all set

// Step 6: Add helpers (optional, after init)
components.get(OBC.Grids).create(world);

// Step 7: Set up FragmentsManager (MUST come after components.init())
const workerUrl = await fetchFragmentsWorker(); // see section 7
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl); // MUST be called before loading any model
```

---

## 5. Component System

The `Components` class is the central registry. All tools are accessed through it.

### Getting a component

```typescript
import * as OBC from "@thatopen/components";

const components = new OBC.Components();

// Pattern: components.get(ComponentClass) → returns singleton instance
const worlds = components.get(OBC.Worlds);
const fragments = components.get(OBC.FragmentsManager);
const grids = components.get(OBC.Grids);
```

`components.get()` always returns the **same instance** — it creates it on first call,
then caches it. Never instantiate components directly (e.g. `new OBC.FragmentsManager()`).

### Available core components

| Class | Purpose |
|-------|---------|
| `OBC.Worlds` | Manages 3D environments |
| `OBC.FragmentsManager` | Loads and manages .frag model files |
| `OBC.Grids` | Renders reference grid planes |
| `OBC.Raycasters` | Mouse-based object picking |
| `OBC.Viewpoints` | Save/restore camera positions |
| `OBC.BoundingBoxer` | Compute bounding boxes for models |
| `OBC.Classifier` | Classify model elements by property |
| `OBC.Hider` | Show/hide elements in a model |
| `OBC.IfcLoader` | Convert .ifc files to fragments (see snippets/) |

### Component lifecycle events

Most components expose typed events:

```typescript
// Example: listen for when any model is added
fragments.list.onItemSet.add(({ value: model }) => {
  console.log("Model loaded:", model.modelId);
});

// Example: listen for when any model is removed
fragments.list.onItemDeleted.add(({ value: model }) => {
  console.log("Model removed:", model.modelId);
});

// Remove a listener
const myHandler = () => { ... };
fragments.list.onItemSet.add(myHandler);
fragments.list.onItemSet.remove(myHandler); // clean up
```

---

## 6. Worlds System

A "world" is a self-contained 3D environment. You can have multiple worlds (e.g., main view + minimap).

### Scene

```typescript
world.scene = new OBC.SimpleScene(components);
world.scene.setup(); // REQUIRED — sets up ambient + directional lights
world.scene.three.background = null; // OBC.SimpleScene wraps THREE.Scene

// Access raw Three.js scene:
world.scene.three // → THREE.Scene
world.scene.three.add(someThreeObject);
world.scene.three.remove(someThreeObject);
```

### Camera

```typescript
world.camera = new OBC.OrthoPerspectiveCamera(components);
// Wraps camera-controls for smooth orbit/pan/zoom

// Set where camera is and what it looks at:
await world.camera.controls.setLookAt(x, y, z, targetX, targetY, targetZ);

// Access raw Three.js camera:
world.camera.three // → THREE.PerspectiveCamera or THREE.OrthographicCamera

// Camera control events:
world.camera.controls.addEventListener("update", () => {
  // fires every frame when camera moves
  fragments.core.update(); // must call this to update LOD
});
```

### Renderer

```typescript
const container = document.getElementById("container")!; // the viewport div
world.renderer = new OBC.SimpleRenderer(components, container);

// Hook into render loop:
world.renderer.onBeforeUpdate.add(() => stats.begin()); // called before each frame
world.renderer.onAfterUpdate.add(() => stats.end());    // called after each frame

// Access raw Three.js renderer:
world.renderer.three // → THREE.WebGLRenderer
```

---

## 7. FragmentsManager — Deep Dive

This is the most important component. It loads, manages, and disposes `.frag` binary model files.

### Step 1: Fetch the worker

FragmentsManager uses a Web Worker for background processing. The worker is hosted on GitHub.
You must fetch it, create a Blob URL, and pass it to `init()`.

```typescript
const WORKER_URL = "https://thatopen.github.io/engine_fragment/resources/worker.mjs";

async function fetchFragmentsWorker(): Promise<string> {
  const response = await fetch(WORKER_URL);
  const blob = await response.blob();
  const file = new File([blob], "worker.mjs", { type: "text/javascript" });
  return URL.createObjectURL(file);
}

const workerUrl = await fetchFragmentsWorker();
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl); // call this ONCE, before any model loading
```

### Step 2: Register the model-added event

**This event handler is mandatory.** Without it, loaded models won't appear in the scene.

```typescript
fragments.list.onItemSet.add(({ value: model }) => {
  // 1. Link this model's LOD system to the camera
  model.useCamera(world.camera.three);

  // 2. Add the model's 3D object to the Three.js scene
  world.scene.three.add(model.object);

  // 3. Force a fragments system update
  fragments.core.update(true);
});
```

### Step 3: (Optional) Prevent z-fighting between models

When multiple models overlap, materials fight for z-depth. Fix this with polygon offset:

```typescript
fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  // Don't apply to LOD materials (internal materials used for level-of-detail)
  if (!("isLodMaterial" in material && material.isLodMaterial)) {
    material.polygonOffset = true;
    material.polygonOffsetUnits = 1;
    material.polygonOffsetFactor = Math.random(); // unique per material = no z-fight
  }
});
```

### Step 4: Keep LOD in sync with camera

```typescript
// Fragments uses LOD (level of detail) to optimize rendering.
// You MUST call fragments.core.update() whenever the camera moves.
world.camera.controls.addEventListener("update", () => {
  fragments.core.update();
});
```

### Loading a .frag model

```typescript
async function loadModel(url: string, modelId: string) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  // The onItemSet event fires automatically after this
  const model = await fragments.core.load(buffer, { modelId });
  return model;
}
```

### Accessing loaded models

```typescript
// fragments.list is a Map<string, FragmentsModel>

// Get all models:
for (const [modelId, model] of fragments.list) {
  console.log(modelId, model);
}

// Get a specific model:
const model = fragments.list.get("my-model-id");

// Check if a model is loaded:
const isLoaded = fragments.list.has("my-model-id");

// Get all model IDs:
const ids = [...fragments.list.keys()];
```

### Disposing (removing) models

```typescript
// Remove one model:
fragments.core.disposeModel("my-model-id");
// This fires fragments.list.onItemDeleted automatically

// Remove all models:
for (const [modelId] of fragments.list) {
  fragments.core.disposeModel(modelId);
}
```

### Exporting a model back to .frag binary

```typescript
async function exportModel(modelId: string) {
  const model = fragments.list.get(modelId);
  if (!model) return;

  const buffer = await model.getBuffer(false); // false = no compression
  const file = new File([buffer], `${modelId}.frag`);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(link.href);
}
```

### FragmentsModel properties

```typescript
model.modelId           // string — the ID you passed to load()
model.object            // THREE.Object3D — add/remove from scene
model.useCamera(camera) // links LOD system to a Three.js camera
model.getBuffer(false)  // Promise<ArrayBuffer> — serialize back to .frag
```

---

## 8. UI System (@thatopen/ui)

Uses Web Components built on Lit. Must call `BUI.Manager.init()` once before any BUI usage.

### Setup

```typescript
import * as BUI from "@thatopen/ui";

BUI.Manager.init(); // MUST be called once, before any BUI components
```

### Creating a reactive component

```typescript
// BUI.Component.create returns [element, updateFn]
const [panel, updatePanel] = BUI.Component.create<BUI.PanelSection, {}>(() => {
  return BUI.html`
    <bim-panel active label="My Panel" class="options-menu">
      <bim-panel-section label="Controls">
        <bim-button label="Do something" @click=${() => doSomething()}></bim-button>
      </bim-panel-section>
    </bim-panel>
  `;
}, {});

document.body.append(panel);

// Call updatePanel() to re-render the component when state changes
fragments.list.onItemSet.add(() => updatePanel());
fragments.list.onItemDeleted.add(() => updatePanel());
```

### Available BIM UI elements

```html
<!-- Panel (floating sidebar) -->
<bim-panel active label="Panel Title">
  <bim-panel-section label="Section Name">
    <!-- controls go here -->
  </bim-panel-section>
</bim-panel>

<!-- Button -->
<bim-button label="Click Me" @click=${handler}></bim-button>
<bim-button label="Loading..." .loading=${true}></bim-button>  <!-- loading state -->
<bim-button icon="solar:settings-bold" @click=${handler}></bim-button>  <!-- icon only -->

<!-- Text input -->
<bim-text-input label="Name" placeholder="Enter name" @change=${handler}></bim-text-input>

<!-- Checkbox -->
<bim-checkbox label="Enable feature" @change=${handler}></bim-checkbox>

<!-- Number input -->
<bim-number-input label="Size" value="1" min="0" max="100" @change=${handler}></bim-number-input>

<!-- Select/dropdown -->
<bim-select label="Mode" @change=${handler}>
  <bim-option label="Option 1" value="1"></bim-option>
  <bim-option label="Option 2" value="2"></bim-option>
</bim-select>
```

### Conditional rendering in templates

```typescript
// Show a button only when models are loaded
const hasModels = fragments.list.size > 0;
const disposeBtn = hasModels
  ? BUI.html`<bim-button label="Dispose All" @click=${disposeAll}></bim-button>`
  : undefined;

return BUI.html`
  <bim-panel>
    ${disposeBtn}
  </bim-panel>
`;
```

### Async button with loading state

```typescript
const onLoad = async ({ target }: { target: BUI.Button }) => {
  target.loading = true;    // shows spinner
  await loadModels();
  target.loading = false;   // hides spinner
};

BUI.html`<bim-button label="Load" @click=${onLoad}></bim-button>`
```

---

## 9. Common Patterns

### Full setup (minimal working viewer)

```typescript
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";

// 1. Init component system and world
const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);
const world = worlds.create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer>();

world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

const container = document.getElementById("container")!;
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);
await world.camera.controls.setLookAt(0, 10, 20, 0, 0, 0);

components.init();

// 2. Set up fragments
const WORKER_URL = "https://thatopen.github.io/engine_fragment/resources/worker.mjs";
const res = await fetch(WORKER_URL);
const blob = await res.blob();
const workerUrl = URL.createObjectURL(new File([blob], "worker.mjs", { type: "text/javascript" }));

const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

// 3. Auto-add models to scene when loaded
fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
});

// 4. Keep LOD in sync with camera
world.camera.controls.addEventListener("update", () => fragments.core.update());

// 5. Load a model
const response = await fetch("https://example.com/my-model.frag");
const buffer = await response.arrayBuffer();
await fragments.core.load(buffer, { modelId: "my-model" });
```

### Load model from file input

```typescript
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".frag";
fileInput.onchange = async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  await fragments.core.load(buffer, { modelId: file.name.replace(".frag", "") });
};
fileInput.click();
```

### Load IFC file (convert on the fly)

See `src/snippets/ifc-loader.ts` for the full IFC → fragment conversion flow.

### Fit camera to loaded models

```typescript
// After loading a model, fit camera to see it all
const bbox = components.get(OBC.BoundingBoxer);
bbox.reset();
for (const [, model] of fragments.list) {
  bbox.addModel(model); // expand bounding box to include this model
}
const sphere = bbox.getSphere();
await world.camera.controls.fitToSphere(sphere, true); // true = animate
```

### Hide/Show elements

```typescript
const hider = components.get(OBC.Hider);

// Hide all elements with a specific expressID
hider.set(false, { "my-model-id": new Set([123, 456]) });

// Show them again
hider.set(true, { "my-model-id": new Set([123, 456]) });
```

---

## 10. Common Mistakes

### ❌ Calling fragments.init() before components.init()

```typescript
// WRONG
fragments.init(workerUrl);
components.init(); // too late

// RIGHT
components.init();
fragments.init(workerUrl);
```

### ❌ Forgetting to add model to scene in onItemSet

```typescript
// WRONG — model loads but is invisible
fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  // forgot: world.scene.three.add(model.object)
});

// RIGHT
fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object); // ← required
  fragments.core.update(true);
});
```

### ❌ Forgetting model.useCamera()

Without this, LOD (level of detail) doesn't work. Models may render at wrong detail levels or crash.

```typescript
// WRONG
fragments.list.onItemSet.add(({ value: model }) => {
  world.scene.three.add(model.object);
  // forgot: model.useCamera(world.camera.three)
});
```

### ❌ Calling components.init() before world is fully set up

```typescript
// WRONG — renderer/camera not assigned yet
components.init();
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);

// RIGHT — all three must be assigned first
world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);
components.init(); // then init
```

### ❌ Using new OBC.FragmentsManager() instead of components.get()

```typescript
// WRONG — creates an orphaned, unregistered instance
const fragments = new OBC.FragmentsManager(components);

// RIGHT — always use the registry
const fragments = components.get(OBC.FragmentsManager);
```

### ❌ Forgetting BUI.Manager.init()

```typescript
// WRONG — BUI components won't render
const [panel] = BUI.Component.create(...);

// RIGHT
BUI.Manager.init(); // must come first
const [panel] = BUI.Component.create(...);
```

### ❌ Not calling world.scene.setup()

```typescript
// WRONG — scene has no lighting, everything is black
world.scene = new OBC.SimpleScene(components);
// forgot: world.scene.setup()

// RIGHT
world.scene = new OBC.SimpleScene(components);
world.scene.setup(); // sets up ambient + directional lights
```

### ❌ Using absolute paths in vite.config.ts for GitHub Pages

The `vite.config.ts` has `base: "./"` — this means all asset paths must be relative.
If you add new static assets, reference them with relative paths.

---

## 11. How to Add a New Feature

### Adding a new tool (e.g., measurement, clipping)

1. Create `src/core/my-tool.ts`
2. Import `components` from your world setup
3. Use `components.get(OBC.MyTool)` to get the tool
4. Wire tool events to UI in `src/ui/panel.ts`

### Adding a new UI control

In `src/ui/panel.ts`, inside the template function, add a new `<bim-button>` or other element.
Call `updatePanel()` after state changes to re-render.

### Adding a new model source

In `src/core/fragments.ts`, add a new async function that fetches from the new source,
converts to `ArrayBuffer`, and calls `fragments.core.load(buffer, { modelId })`.

---

## 12. API Quick Reference

### OBC.FragmentsManager

```typescript
fragments.init(workerUrl: string): void
fragments.core.load(buffer: ArrayBuffer, opts: { modelId: string }): Promise<FragmentsModel>
fragments.core.disposeModel(modelId: string): void
fragments.core.update(force?: boolean): void
fragments.list: Map<string, FragmentsModel>          // all loaded models
fragments.list.onItemSet: Event<{ value: FragmentsModel }>
fragments.list.onItemDeleted: Event<{ value: FragmentsModel }>
fragments.core.models.materials.list.onItemSet: Event<{ value: THREE.Material }>
```

### FragmentsModel (from fragments.list)

```typescript
model.modelId: string                               // ID passed to load()
model.object: THREE.Object3D                        // add to scene
model.useCamera(camera: THREE.Camera): void         // link LOD to camera
model.getBuffer(compress: boolean): Promise<ArrayBuffer>
```

### OBC.OrthoPerspectiveCamera

```typescript
camera.three: THREE.PerspectiveCamera | THREE.OrthographicCamera
camera.controls: CameraControls                     // from camera-controls lib
camera.controls.setLookAt(ex, ey, ez, tx, ty, tz): Promise<void>
camera.controls.fitToSphere(sphere, animate): Promise<void>
camera.controls.addEventListener("update", handler)
```

### OBC.SimpleScene

```typescript
scene.three: THREE.Scene
scene.setup(): void                                  // sets up lights
scene.three.add(object: THREE.Object3D): void
scene.three.remove(object: THREE.Object3D): void
scene.three.background: THREE.Color | null
```

### OBC.SimpleRenderer

```typescript
renderer.three: THREE.WebGLRenderer
renderer.onBeforeUpdate: Event<void>                 // fires before each frame
renderer.onAfterUpdate: Event<void>                  // fires after each frame
```

### OBC.Worlds / World

```typescript
worlds.create<Scene, Camera, Renderer>(): World
world.scene: SimpleScene
world.camera: OrthoPerspectiveCamera
world.renderer: SimpleRenderer
```

### BUI

```typescript
BUI.Manager.init(): void
BUI.Component.create<T, S>(templateFn, initialState): [HTMLElement, updateFn]
BUI.html`...`                                        // tagged template for HTML
```

---

## Worker URL (do not change)

```
https://thatopen.github.io/engine_fragment/resources/worker.mjs
```

This is the official That Open Company hosted worker. Do not host it locally or change the URL.

---

## 13. V1 API (`openbim-components`) vs V3 API (`@thatopen/components`)

The library was rewritten between v1 and v3. **Every single pattern changed.**
If you see any of the v1 patterns below in your own code, replace them with the v3 equivalents.

### Package name

```typescript
// ❌ V1 — wrong package, DO NOT USE
import * as OBC from "openbim-components";

// ✅ V3 — correct
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front"; // for frontend-only tools
```

### Core setup

| V1 pattern | V3 equivalent |
|------------|---------------|
| `const viewer = new OBC.Components()` | `const components = new OBC.Components()` |
| `viewer.onInitialized.add(() => {})` | No equivalent — use `components.init()` directly |
| `viewer.scene = new OBC.SimpleScene(viewer)` | `world.scene = new OBC.SimpleScene(components)` (via worlds system) |
| `viewer.renderer = new OBC.PostproductionRenderer(viewer, el)` | `world.renderer = new OBC.SimpleRenderer(components, el)` |
| `viewer.camera = new OBC.OrthoPerspectiveCamera(viewer)` | `world.camera = new OBC.OrthoPerspectiveCamera(components)` |
| `viewer.raycaster = new OBC.SimpleRaycaster(viewer)` | `components.get(OBC.Raycasters)` |
| `viewer.init()` | `components.init()` (after world setup) |
| No worlds concept | **Required:** `components.get(OBC.Worlds).create()` |

### Component instantiation

```typescript
// ❌ V1 — direct instantiation
const ifcLoader = new OBC.FragmentIfcLoader(viewer);
const highlighter = new OBC.FragmentHighlighter(viewer);
const grid = new OBC.SimpleGrid(viewer, new THREE.Color(0x666666));

// ✅ V3 — always use the component registry
const ifcLoader = components.get(OBC.IfcLoader);
const highlighter = components.get(OBCF.Highlighter); // from @thatopen/components-front
components.get(OBC.Grids).create(world);
```

### IFC loading

```typescript
// ❌ V1
const ifcLoader = new OBC.FragmentIfcLoader(viewer);
ifcLoader.onIfcLoaded.add(async (model) => {
  // model is available here
});

// ✅ V3 — IFC loading goes through FragmentsManager
// The model appears in fragments.list.onItemSet, not in ifcLoader events
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({ wasm: { path: "/", absolute: false } });

// Model appears here when loaded (regardless of whether loaded via IfcLoader or directly as .frag)
fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
});

// Load the IFC: load(data, coordinate, name)
const data = new Uint8Array(await file.arrayBuffer());
await ifcLoader.load(data, true, "my-model");
```

### Highlighting (requires @thatopen/components-front)

```typescript
// ❌ V1
const highlighter = new OBC.FragmentHighlighter(viewer);
highlighter.setup();
highlighter.events.select.onHighlight.add((selection) => { ... });

// ✅ V3 — from @thatopen/components-front
import * as OBCF from "@thatopen/components-front";
const highlighter = components.get(OBCF.Highlighter);
await highlighter.setup({ world });
highlighter.events.select.onHighlight.add((fragmentIdMap) => { ... });
```

### Renderer with post-processing

```typescript
// ❌ V1
const renderer = new OBC.PostproductionRenderer(viewer, container);
viewer.renderer = renderer;
renderer.postproduction.enabled = true;

// ✅ V3 — PostproductionRenderer is in @thatopen/components-front
import * as OBCF from "@thatopen/components-front";
world.renderer = new OBCF.PostproductionRenderer(components, container);
// After components.init():
(world.renderer as OBCF.PostproductionRenderer).postproduction.enabled = true;
```

### UI / Toolbar

```typescript
// ❌ V1 — built-in toolbar system
const toolbar = new OBC.Toolbar(viewer);
toolbar.addChild(ifcLoader.uiElement.get("main"));
viewer.ui.addToolbar(toolbar);

// ✅ V3 — use @thatopen/ui (BUI) Web Components
import * as BUI from "@thatopen/ui";
BUI.Manager.init();
const [panel] = BUI.Component.create(() => BUI.html`
  <bim-panel label="Controls">
    <bim-panel-section label="Models">
      <bim-button label="Load IFC" @click=${loadHandler}></bim-button>
    </bim-panel-section>
  </bim-panel>
`, {});
document.body.append(panel);
```

### Properties / element data

```typescript
// ❌ V1
const processor = new OBC.IfcPropertiesProcessor(viewer);
processor.process(model);
processor.renderProperties(model, expressID);

// ✅ V3 — access properties directly from the model
// FragmentsModel has built-in property access
const props = await model.getProperties(expressID);
```

### Scene background color

```typescript
// ❌ V1
scene.background = new THREE.Color("#202932"); // direct THREE.Color

// ✅ V3 — same, but access through world.scene.three
world.scene.three.background = new THREE.Color("#202932");
// or null for transparent:
world.scene.three.background = null;
```

---

## 14. WASM Loading Options (web-ifc)

`web-ifc` requires `.wasm` binary files to be accessible at runtime.
You only need this if you're loading raw `.ifc` files — not needed for pre-built `.frag` files.

There are two ways to provide the WASM files:

### Option A: UNPKG CDN (recommended for quick setup / GitHub Pages)

No local files needed. The WASM is fetched from the npm CDN.
Use `absolute: true` when providing a full URL.

```typescript
await ifcLoader.setup({
  wasm: {
    path: "https://unpkg.com/web-ifc@0.0.74/",  // trailing slash required
    absolute: true,   // true because this is a full URL, not a relative path
  },
});
```

**Which version to use:** Must match the `web-ifc` version in your `package.json`.
This project uses `web-ifc@0.0.74`, so the UNPKG URL is `https://unpkg.com/web-ifc@0.0.74/`.

The UNPKG package contains:
- `web-ifc.wasm` — main WebAssembly module
- `web-ifc-mt.wasm` — multi-threaded variant
- `web-ifc-node.wasm` — Node.js variant (not used in browser)

### Option B: Local files (better for offline / production)

Copy the WASM files from `node_modules/web-ifc/` to your `public/` directory,
then reference them with a relative path.

**With Vite:** Add `vite-plugin-static-copy` to `vite.config.ts`:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  base: "./",
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "node_modules/web-ifc/web-ifc.wasm", dest: "" },
        { src: "node_modules/web-ifc/web-ifc-mt.wasm", dest: "" },
      ],
    }),
  ],
});
```

Then set up IfcLoader with a relative path:

```typescript
await ifcLoader.setup({
  wasm: {
    path: "./",       // WASM files are at the root of the deployed site
    absolute: false,  // false = relative path
  },
});
```

**Or manually:** Copy the files to `public/` yourself:
```bash
cp node_modules/web-ifc/web-ifc.wasm public/
cp node_modules/web-ifc/web-ifc-mt.wasm public/
```

### Option C: Let autoSetWasm handle it (development only)

`IfcFragmentSettings.autoSetWasm` defaults to `true`, which tries to locate
the WASM files automatically. This works in local development but is unreliable
in production. Always set explicit paths for builds that will be deployed.

```typescript
// Development only — may not work in production
await ifcLoader.setup(); // autoSetWasm: true is the default
```

### Summary

| Scenario | Recommended option |
|----------|--------------------|
| Quick prototype / GitHub Pages | UNPKG CDN (`absolute: true`) |
| Production app, offline support | Local files (`absolute: false`) |
| Local dev only | `autoSetWasm: true` (default, no config needed) |

---

*Last updated: 2026-02-18. Stack: @thatopen/components@3.3.x, @thatopen/fragments@3.3.x, three@0.175.x*
