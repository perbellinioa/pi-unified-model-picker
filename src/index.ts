import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import { HistoryStore } from "./history.js";
import {
  addRecentModel,
  formatTokenCount,
  modelKey,
  type RecentModel,
} from "./model-options.js";
import {
  ListSelection,
  ModelPickerState,
  type PickerChoice,
} from "./picker-state.js";
import {
  ModelPickerRenderer,
  ProviderPickerRenderer,
} from "./render.js";

const HISTORY_PATH = join(getAgentDir(), "pi-unified-model-picker", "history.json");

function availableModels(ctx: ExtensionCommandContext): Model<Api>[] {
  const models = ctx.scopedModels.length > 0
    ? ctx.scopedModels.map((entry) => entry.model)
    : ctx.modelRegistry.getAvailable();
  return [...new Map(models.map((model) => [modelKey(model), model])).values()];
}

async function showProviderPicker(
  ctx: ExtensionCommandContext,
  providers: readonly string[],
  initialProvider: string | undefined,
): Promise<string | null> {
  const initialIndex = initialProvider ? providers.indexOf(initialProvider) : 0;
  const state = new ListSelection(providers, initialIndex);
  const renderer = new ProviderPickerRenderer();

  return ctx.ui.custom<string | null>((tui, theme: Theme, _keybindings, done) => ({
    render: (width: number) => renderer.render(state, ctx.model?.provider, width, theme, tui.terminal.rows),
    invalidate: () => renderer.invalidate(),
    handleInput(data: string) {
      if (matchesKey(data, Key.up)) state.move(-1);
      else if (matchesKey(data, Key.down)) state.move(1);
      else if (matchesKey(data, Key.enter)) done(state.selected);
      else if (matchesKey(data, Key.escape)) done(null);
      tui.requestRender();
    },
  }));
}

async function showModelPicker(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  provider: string,
  providerModels: Model<Api>[],
  recent: RecentModel[],
  canGoBack: boolean,
): Promise<PickerChoice | null> {
  const state = new ModelPickerState({
    models: providerModels,
    recent,
    currentModel: ctx.model,
    currentThinkingLevel: pi.getThinkingLevel(),
  });
  const renderer = new ModelPickerRenderer(provider, canGoBack);

  return ctx.ui.custom<PickerChoice | null>((tui, theme: Theme, _keybindings, done) => ({
    render: (width: number) => renderer.render(state, width, theme, tui.terminal.rows),
    invalidate: () => renderer.invalidate(),
    handleInput(data: string) {
      if (matchesKey(data, Key.up)) state.move(-1);
      else if (matchesKey(data, Key.down)) state.move(1);
      else if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) state.toggleField();
      else if (matchesKey(data, Key.left)) state.adjust(-1);
      else if (matchesKey(data, Key.right)) state.adjust(1);
      else if (matchesKey(data, Key.enter)) done(state.choice());
      else if (matchesKey(data, Key.escape)) done(null);
      tui.requestRender();
    },
  }));
}

export default function unifiedModelPicker(pi: ExtensionAPI) {
  const history = new HistoryStore(HISTORY_PATH);
  let recent: RecentModel[] = [];

  pi.on("session_start", async (_event, ctx) => {
    recent = await history.read();
    if (ctx.model) recent = addRecentModel(recent, ctx.model);
  });

  // Model selection is the single authoritative history write path. This also
  // captures model changes made outside this picker.
  pi.on("model_select", async (event) => {
    recent = addRecentModel(recent, event.model);
    try {
      await history.write(recent);
    } catch (error) {
      console.error(`pi-unified-model-picker: failed to save history: ${String(error)}`);
    }
  });

  pi.registerCommand("model-picker", {
    description: "Select a provider, model, context, and reasoning level",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/model-picker requires TUI mode", "error");
        return;
      }

      const models = availableModels(ctx);
      if (models.length === 0) {
        ctx.ui.notify("No configured models are available", "warning");
        return;
      }

      const providers = [...new Set(models.map((model) => model.provider))].sort();
      let provider = providers.length === 1
        ? providers[0]!
        : await showProviderPicker(ctx, providers, ctx.model?.provider);

      while (provider) {
        const providerModels = models.filter((model) => model.provider === provider);
        const choice = await showModelPicker(pi, ctx, provider, providerModels, recent, providers.length > 1);

        if (choice) {
          const selected = { ...choice.model, contextWindow: choice.contextBudget } as Model<Api>;
          if (!(await pi.setModel(selected))) {
            ctx.ui.notify(`No credentials available for ${choice.model.provider}/${choice.model.id}`, "error");
            return;
          }
          pi.setThinkingLevel(choice.thinkingLevel);
          ctx.ui.notify(
            `Using ${choice.model.provider}/${choice.model.id} • context ${formatTokenCount(choice.contextBudget)} • reasoning ${choice.model.reasoning ? choice.thinkingLevel : "none"}`,
            "info",
          );
          return;
        }

        if (providers.length === 1) return;
        provider = await showProviderPicker(ctx, providers, provider);
      }
    },
  });
}
