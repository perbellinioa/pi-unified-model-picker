import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type KeybindingsManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { HistoryStore } from "./history.js";
import { handleModelInput, handleProviderInput } from "./input.js";
import {
  addRecentModel,
  formatTokenCount,
  mergeRecentModels,
  modelKey,
  type RecentModel,
} from "./model-options.js";
import {
  ListSelection,
  ModelPickerState,
  type PickerChoice,
} from "./picker-state.js";
import {
  modelPageSize,
  ModelPickerRenderer,
  providerPageSize,
  ProviderPickerRenderer,
  type PickerHints,
  type ProviderOption,
} from "./render.js";

const HISTORY_PATH = join(getAgentDir(), "pi-unified-model-picker", "history.json");
const DOCK_ROWS = 2;

function availableModels(ctx: ExtensionCommandContext): Model<Api>[] {
  const models = ctx.scopedModels.length > 0
    ? ctx.scopedModels.map((entry) => entry.model)
    : ctx.modelRegistry.getAvailable();
  return [...new Map(models.map((model) => [modelKey(model), model])).values()];
}

function viewportRows(terminalRows: number): number {
  return Math.max(1, terminalRows - DOCK_ROWS);
}

function pickerHints(keybindings: KeybindingsManager): PickerHints {
  const keys = (action: Parameters<KeybindingsManager["getKeys"]>[0]) =>
    keybindings.getKeys(action).join("/");
  return {
    upDown: `${keys("tui.select.up")}/${keys("tui.select.down")}`,
    page: `${keys("tui.select.pageUp")}/${keys("tui.select.pageDown")}`,
    tab: keys("tui.input.tab"),
    leftRight: `${keys("tui.editor.cursorLeft")}/${keys("tui.editor.cursorRight")}`,
    confirm: keys("tui.select.confirm"),
    cancel: keys("tui.select.cancel"),
  };
}

async function showProviderPicker(
  ctx: ExtensionCommandContext,
  providers: readonly ProviderOption[],
  initialProvider: string | undefined,
): Promise<string | null> {
  const initialIndex = initialProvider ? providers.findIndex((provider) => provider.id === initialProvider) : 0;
  const state = new ListSelection(providers, initialIndex);

  return ctx.ui.custom<string | null>((tui, theme: Theme, keybindings: KeybindingsManager, done) => {
    const renderer = new ProviderPickerRenderer(pickerHints(keybindings));
    return {
      render: (width: number) => renderer.render(
        state,
        ctx.model?.provider,
        width,
        theme,
        viewportRows(tui.terminal.rows),
      ),
      invalidate: () => renderer.invalidate(),
      handleInput(data: string) {
        const outcome = handleProviderInput(
          state,
          data,
          keybindings,
          providerPageSize(viewportRows(tui.terminal.rows)),
        );
        if (outcome?.type === "confirm") done(outcome.value);
        else if (outcome?.type === "cancel") done(null);
        tui.requestRender();
      },
    };
  });
}

async function showModelPicker(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  provider: ProviderOption,
  providerModels: Model<Api>[],
  recent: RecentModel[],
  canGoBack: boolean,
): Promise<PickerChoice | null> {
  const preferredThinkingLevels = new Map(
    ctx.scopedModels.flatMap((entry) => entry.thinkingLevel === undefined
      ? []
      : [[modelKey(entry.model), entry.thinkingLevel] as const]),
  );
  const state = new ModelPickerState({
    models: providerModels,
    recent,
    currentModel: ctx.model,
    currentThinkingLevel: pi.getThinkingLevel(),
    preferredThinkingLevels,
  });

  return ctx.ui.custom<PickerChoice | null>((tui, theme: Theme, keybindings: KeybindingsManager, done) => {
    const renderer = new ModelPickerRenderer(provider.label, canGoBack, pickerHints(keybindings));
    let lastWidth = tui.terminal.columns;
    return {
      render: (width: number) => {
        lastWidth = width;
        return renderer.render(state, width, theme, viewportRows(tui.terminal.rows));
      },
      invalidate: () => renderer.invalidate(),
      handleInput(data: string) {
        const outcome = handleModelInput(
          state,
          data,
          keybindings,
          modelPageSize(lastWidth, viewportRows(tui.terminal.rows)),
        );
        if (outcome?.type === "confirm") done(outcome.value);
        else if (outcome?.type === "cancel") done(null);
        tui.requestRender();
      },
    };
  });
}

export default function unifiedModelPicker(pi: ExtensionAPI) {
  const history = new HistoryStore(HISTORY_PATH);
  let recent: RecentModel[] = [];

  pi.on("session_start", async (_event, ctx) => {
    recent = mergeRecentModels(recent, await history.read());
    if (ctx.model) recent = addRecentModel(recent, ctx.model);
  });

  // Model selection is the single authoritative history write path. This also
  // captures model changes made outside this picker.
  pi.on("model_select", async (event, ctx) => {
    recent = addRecentModel(recent, event.model);
    try {
      await history.write(recent);
    } catch (error) {
      ctx.ui.notify(`Could not save model history: ${String(error)}`, "error");
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

      const providerIds = [...new Set(models.map((model) => model.provider))].sort();
      const providers = providerIds.map((id) => ({
        id,
        label: ctx.modelRegistry.getProviderDisplayName(id),
      }));
      const initialProvider = providers.length === 1
        ? providers[0]!.id
        : await showProviderPicker(ctx, providers, ctx.model?.provider);
      let provider = providers.find((item) => item.id === initialProvider) ?? null;

      while (provider) {
        const providerModels = models.filter((model) => model.provider === provider!.id);
        const choice = await showModelPicker(pi, ctx, provider, providerModels, recent, providers.length > 1);

        if (choice) {
          const selected: Model<Api> = { ...choice.model, contextWindow: choice.contextBudget };
          try {
            if (!(await pi.setModel(selected))) {
              ctx.ui.notify(`No credentials available for ${choice.model.provider}/${choice.model.id}`, "error");
              continue;
            }
            pi.setThinkingLevel(choice.thinkingLevel);
            ctx.ui.notify(
              `Using ${choice.model.provider}/${choice.model.id} • context ${formatTokenCount(choice.contextBudget)} • reasoning ${choice.model.reasoning ? choice.thinkingLevel : "none"}`,
              "info",
            );
            return;
          } catch (error) {
            ctx.ui.notify(`Could not select ${choice.model.provider}/${choice.model.id}: ${String(error)}`, "error");
            continue;
          }
        }

        if (providers.length === 1) return;
        const selectedProvider = await showProviderPicker(ctx, providers, provider.id);
        provider = providers.find((item) => item.id === selectedProvider) ?? null;
      }
    },
  });
}
