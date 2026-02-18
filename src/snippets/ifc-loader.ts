/**
 * ifc-loader.ts — IFC to Fragment Conversion Reference
 *
 * This file shows how to load a raw .ifc file (instead of a pre-built .frag)
 * and convert it to the fragments format on the fly in the browser.
 *
 * AGENT NOTE: This file is a REFERENCE SNIPPET, not imported by main.ts.
 * Copy the relevant parts into your feature when you need IFC loading.
 *
 * When to use:
 *   - User uploads a .ifc file directly
 *   - You need to convert IFC → .frag for saving/caching
 *
 * When NOT to use:
 *   - You already have .frag files (use loadFragmentFromUrl/loadFragmentFromBuffer instead)
 *   - IFC conversion is much slower than loading pre-built .frag files
 *
 * Dependencies (add to package.json if not present):
 *   "web-ifc": ">=0.0.74"
 */

import * as OBC from "@thatopen/components";

// WASM files for web-ifc can be loaded in two ways:
//
// OPTION A — UNPKG CDN (easiest, no local files needed):
//   path: "https://unpkg.com/web-ifc@0.0.74/", absolute: true
//   Version must match web-ifc in package.json (currently 0.0.74)
//
// OPTION B — Local files (better for offline / production):
//   Copy from node_modules/web-ifc/ to public/:
//     web-ifc.wasm
//     web-ifc-mt.wasm
//   Then: path: "./", absolute: false
//
// See CLAUDE.md §14 for full details on both options.

/**
 * Sets up the IfcLoader component with WASM paths.
 *
 * Call this once after components.init(). The IfcLoader uses web-ifc
 * (WebAssembly) to parse IFC files, so it needs to know where the
 * .wasm files are served from.
 *
 * @param components - The main OBC.Components coordinator
 * @returns Configured IfcLoader instance
 */
export async function setupIfcLoader(
  components: OBC.Components,
): Promise<OBC.IfcLoader> {
  const ifcLoader = components.get(OBC.IfcLoader);

  // IfcFragmentSettings shape:
  //   wasm.path     — directory where web-ifc .wasm files are served (e.g. "/")
  //   wasm.absolute — true if path is an absolute URL, false for relative
  //   autoSetWasm   — when true, the loader finds WASM automatically (default true)
  //
  // With Vite, copy WASM files to public/ and set wasm.path to "/".
  // If autoSetWasm is true (default), you can often skip the wasm config entirely.
  // UNPKG CDN — recommended for quick setup and GitHub Pages deploys.
  // Change the version to match web-ifc in package.json.
  await ifcLoader.setup({
    wasm: {
      path: "https://unpkg.com/web-ifc@0.0.74/", // trailing slash required
      absolute: true,  // true = full URL, not a relative path
    },
  });

  // ALTERNATIVE: local WASM files in public/ (better for offline/production)
  // Copy web-ifc.wasm + web-ifc-mt.wasm from node_modules/web-ifc/ to public/
  // await ifcLoader.setup({
  //   wasm: { path: "./", absolute: false },
  // });

  return ifcLoader;
}

/**
 * Loads an IFC file from a URL, converts it to a FragmentsModel, and
 * returns the model. The model is automatically added to the scene if
 * the onItemSet handler is registered (see core/fragments.ts).
 *
 * AGENT NOTE: IFC loading is significantly slower than .frag loading.
 * Consider converting once and saving the .frag output for reuse.
 *
 * @param ifcLoader - IfcLoader instance from setupIfcLoader()
 * @param url       - URL to the .ifc file
 * @returns The loaded model (or null on failure)
 */
export async function loadIfcFromUrl(
  ifcLoader: OBC.IfcLoader,
  url: string,
) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  // load(data, coordinate, name)
  //   data       — Uint8Array of the raw IFC file
  //   coordinate — true = align model to world origin (recommended)
  //   name       — model ID used to identify it in fragments.list
  const model = await ifcLoader.load(data, true, url.split("/").pop() ?? "model");
  return model;
}

/**
 * Loads an IFC file from a browser File object (e.g. from a file input).
 *
 * @param ifcLoader - IfcLoader instance from setupIfcLoader()
 * @param file      - File object from an <input type="file"> element
 */
export async function loadIfcFromFile(
  ifcLoader: OBC.IfcLoader,
  file: File,
) {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  // file.name is used as the model name/ID (e.g. "myBuilding.ifc")
  const model = await ifcLoader.load(data, true, file.name);
  return model;
}

// ─── Example: Full IFC loader UI flow ────────────────────────────────────────
//
// This shows how to wire up a file input button for IFC files.
// Paste into your UI panel template when needed.
//
// In panel.ts:
//
//   BUI.html`
//     <bim-button
//       label="Load IFC"
//       @click=${async ({ target }: { target: BUI.Button }) => {
//         const input = document.createElement("input");
//         input.type = "file";
//         input.accept = ".ifc";
//         input.onchange = async () => {
//           const file = input.files?.[0];
//           if (!file) return;
//           target.loading = true;
//           await loadIfcFromFile(ifcLoader, file);
//           target.loading = false;
//         };
//         input.click();
//       }}
//     ></bim-button>
//   `
//
// ─────────────────────────────────────────────────────────────────────────────

// ─── Example: Save IFC model as .frag for faster future loads ────────────────
//
// After loading an IFC, export it as .frag so next time you can use
// the faster loadFragmentFromBuffer() instead of converting again.
//
//   const model = await loadIfcFromUrl(ifcLoader, ifcUrl);
//   if (model) {
//     const buffer = await model.getBuffer(false);
//     const file = new File([buffer], "my-model.frag");
//     const link = document.createElement("a");
//     link.href = URL.createObjectURL(file);
//     link.download = file.name;
//     link.click();
//     URL.revokeObjectURL(link.href);
//   }
//
// ─────────────────────────────────────────────────────────────────────────────
