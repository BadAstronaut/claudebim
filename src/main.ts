import Stats from "stats.js";
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";

const components = new OBC.Components();

const worlds = components.get(OBC.Worlds);
const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBC.SimpleRenderer
>();

world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

const container = document.getElementById("container")!;
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);
await world.camera.controls.setLookAt(78, 20, -2.2, 26, -4, 25);

components.init();

components.get(OBC.Grids).create(world);

const githubUrl =
  "https://thatopen.github.io/engine_fragment/resources/worker.mjs";
const fetchedUrl = await fetch(githubUrl);
const workerBlob = await fetchedUrl.blob();
const workerFile = new File([workerBlob], "worker.mjs", {
  type: "text/javascript",
});
const workerUrl = URL.createObjectURL(workerFile);

const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

world.camera.controls.addEventListener("update", () => fragments.core.update());

fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
});

fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  if (!("isLodMaterial" in material && material.isLodMaterial)) {
    material.polygonOffset = true;
    material.polygonOffsetUnits = 1;
    material.polygonOffsetFactor = Math.random();
  }
});

const loadFragments = async () => {
  const fragPaths = [
    "https://thatopen.github.io/engine_components/resources/frags/school_arq.frag",
    "https://thatopen.github.io/engine_components/resources/frags/school_str.frag",
  ];

  await Promise.all(
    fragPaths.map(async (path) => {
      const modelId = path.split("/").pop()?.split(".").shift();
      if (!modelId) return null;
      const file = await fetch(path);
      const buffer = await file.arrayBuffer();
      return fragments.core.load(buffer, { modelId });
    }),
  );
};

const downloadFragments = async () => {
  for (const [, model] of fragments.list) {
    const fragsBuffer = await model.getBuffer(false);
    const file = new File([fragsBuffer], `${model.modelId}.frag`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  }
};

const deleteArchModel = () => {
  const modelIds = [...fragments.list.keys()];
  const modelId = modelIds.find((key) => /arq/.test(key));
  if (!modelId) return;
  fragments.core.disposeModel(modelId);
};

const deleteAllModels = () => {
  for (const [modelId] of fragments.list) {
    fragments.core.disposeModel(modelId);
  }
};

BUI.Manager.init();

const [panel, updatePanel] = BUI.Component.create<BUI.PanelSection, {}>((_) => {
  const onLoadFragments = async ({ target }: { target: BUI.Button }) => {
    target.loading = true;
    await loadFragments();
    target.loading = false;
  };

  let loadFragmentsBtn: BUI.TemplateResult | undefined;
  if (fragments.list.size === 0) {
    loadFragmentsBtn = BUI.html`
      <bim-button label="Load fragments" @click=${onLoadFragments}></bim-button>
    `;
  }

  let disposeArchModelBtn: BUI.TemplateResult | undefined;
  if ([...fragments.list.keys()].some((key) => /arq/.test(key))) {
    disposeArchModelBtn = BUI.html`
      <bim-button label="Dispose Arch Model" @click=${deleteArchModel}></bim-button>
      `;
  }

  let downloadFragmentsBtn: BUI.TemplateResult | undefined;
  let disposeModelsBtn: BUI.TemplateResult | undefined;
  if (fragments.list.size > 0) {
    disposeModelsBtn = BUI.html`
      <bim-button label="Dispose All Models" @click=${deleteAllModels}></bim-button>
    `;

    downloadFragmentsBtn = BUI.html`
      <bim-button label="Export fragments" @click=${downloadFragments}></bim-button>
    `;
  }

  return BUI.html`
    <bim-panel active label="FragmentsManager Tutorial" class="options-menu">
      <bim-panel-section label="Controls">
        ${loadFragmentsBtn}
        ${disposeArchModelBtn}
        ${disposeModelsBtn}
        ${downloadFragmentsBtn}
      </bim-panel-section>
    </bim-panel>
  `;
}, {});

const updateFunction = () => updatePanel();
fragments.list.onItemSet.add(updateFunction);
fragments.list.onItemDeleted.add(updateFunction);

document.body.append(panel);

const button = BUI.Component.create<BUI.PanelSection>(() => {
  return BUI.html`
      <bim-button class="phone-menu-toggler" icon="solar:settings-bold"
        @click="${() => {
          if (panel.classList.contains("options-menu-visible")) {
            panel.classList.remove("options-menu-visible");
          } else {
            panel.classList.add("options-menu-visible");
          }
        }}">
      </bim-button>
    `;
});

document.body.append(button);

const stats = new Stats();
stats.showPanel(2);
document.body.append(stats.dom);
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "unset";
world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());
