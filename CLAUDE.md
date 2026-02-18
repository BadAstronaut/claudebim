# CLAUDE.md — AI Agent Reference for claudebim

This document is the **primary reference for AI agents** (Claude, OpenClaw, etc.) working on this project.
Read it fully before writing any code. Every pattern here reflects working, tested code.

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

*Last updated: 2026-02-18. Stack: @thatopen/components@3.3.x, @thatopen/fragments@3.3.x, three@0.175.x*
