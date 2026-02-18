/**
 * panel.ts — BUI Side Panel
 *
 * Creates the floating control panel using @thatopen/ui (Web Components / Lit).
 *
 * AGENT NOTE:
 * - Always call BUI.Manager.init() BEFORE calling createPanel()
 * - The panel re-renders by calling updatePanel() — call this whenever model
 *   state changes (models loaded, models removed)
 * - To add new controls: add them inside the returned BUI.html template below
 * - Controls are conditionally shown based on fragments.list state
 *
 * BUI element reference:
 *   <bim-panel>          Floating sidebar container
 *   <bim-panel-section>  Collapsible section within a panel
 *   <bim-button>         Clickable button (supports .loading state + icons)
 *   <bim-text-input>     Text field
 *   <bim-checkbox>       Checkbox toggle
 *   <bim-number-input>   Numeric input with min/max
 *   <bim-select>         Dropdown select
 */

import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import {
  loadFragmentFromUrl,
  disposeModel,
  disposeAllModels,
  downloadAllModels,
} from "../core/fragments";

// Demo .frag files from the That Open Company CDN.
// Replace with your own model URLs when building real features.
const DEMO_MODEL_URLS = [
  "https://thatopen.github.io/engine_components/resources/frags/school_arq.frag",
  "https://thatopen.github.io/engine_components/resources/frags/school_str.frag",
];

/**
 * Creates the main side panel and returns the panel element plus a
 * function to trigger a re-render.
 *
 * @param fragments - FragmentsManager instance from setupFragments()
 * @returns [panelElement, updateFn]
 *
 * Usage:
 *   const [panel, updatePanel] = createPanel(fragments);
 *   document.body.append(panel);
 *   fragments.list.onItemSet.add(() => updatePanel());
 *   fragments.list.onItemDeleted.add(() => updatePanel());
 */
export function createPanel(
  fragments: OBC.FragmentsManager,
): [HTMLElement, () => void] {
  const [panel, updatePanel] = BUI.Component.create<BUI.PanelSection, {}>(
    (_) => {
      // ── Load button (only shown when no models are loaded) ─────────────────
      // This pattern of conditionally showing buttons is common in BUI.
      // The template re-evaluates on each updatePanel() call.
      const showLoadBtn = fragments.list.size === 0;
      const loadBtn = showLoadBtn
        ? BUI.html`
            <bim-button
              label="Load fragments"
              @click=${async ({ target }: { target: BUI.Button }) => {
                // Show spinner while loading
                target.loading = true;
                await Promise.all(
                  DEMO_MODEL_URLS.map(async (url) => {
                    // Derive modelId from filename: "school_arq.frag" → "school_arq"
                    const modelId = url.split("/").pop()?.split(".").shift();
                    if (modelId) await loadFragmentFromUrl(fragments, url, modelId);
                  }),
                );
                target.loading = false;
              }}
            ></bim-button>
          `
        : undefined;

      // ── Dispose arch model button (only shown when arch model is loaded) ───
      const hasArchModel = [...fragments.list.keys()].some((key) =>
        /arq/.test(key),
      );
      const disposeArchBtn = hasArchModel
        ? BUI.html`
            <bim-button
              label="Dispose Arch Model"
              @click=${() => {
                const modelId = [...fragments.list.keys()].find((key) =>
                  /arq/.test(key),
                );
                if (modelId) disposeModel(fragments, modelId);
              }}
            ></bim-button>
          `
        : undefined;

      // ── Dispose all + export buttons (only shown when models are loaded) ───
      const hasModels = fragments.list.size > 0;
      const disposeAllBtn = hasModels
        ? BUI.html`
            <bim-button
              label="Dispose All Models"
              @click=${() => disposeAllModels(fragments)}
            ></bim-button>
          `
        : undefined;

      const exportBtn = hasModels
        ? BUI.html`
            <bim-button
              label="Export fragments"
              @click=${() => downloadAllModels(fragments)}
            ></bim-button>
          `
        : undefined;

      // ── Panel template ──────────────────────────────────────────────────────
      // AGENT NOTE: Add new <bim-panel-section> blocks below to add feature groups.
      // Each section groups related controls and can be collapsed independently.
      return BUI.html`
        <bim-panel active label="FragmentsManager" class="options-menu">

          <bim-panel-section label="Models">
            ${loadBtn}
            ${disposeArchBtn}
            ${disposeAllBtn}
            ${exportBtn}
          </bim-panel-section>

          <!-- AGENT: Add new panel sections here. Example:
          <bim-panel-section label="Visibility">
            <bim-checkbox label="Show structure" @change=\${onToggleStructure}></bim-checkbox>
          </bim-panel-section>
          -->

        </bim-panel>
      `;
    },
    {},
  );

  return [panel, updatePanel];
}

/**
 * Creates the small floating toggle button shown on mobile.
 * Clicking it shows/hides the main panel.
 *
 * @param panel - The main panel element returned by createPanel()
 * @returns The toggle button element
 */
export function createMobileToggle(panel: HTMLElement): HTMLElement {
  return BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-button
        class="phone-menu-toggler"
        icon="solar:settings-bold"
        @click=${() => {
          panel.classList.toggle("options-menu-visible");
        }}
      ></bim-button>
    `;
  });
}
