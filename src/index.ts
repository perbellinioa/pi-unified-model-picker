import { join } from "node:path";
import {
  type Api,
  type Model,
  type ModelThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { readHistory, writeHistory } from "./history.js";
import {
  addRecentModel,
  formatTokenCount,
  getContextBudgetOptions,
  getSelectableThinkingLevels,
  modelKey,
  normalizeThinkingLevel,
  sortModels,
  type RecentModel,
} from "./model-options.js";

type Field = "context" | "reasoning";

interface PickerChoice {
  model: Model<Api>;
  contextBudget: number;
  thinkingLevel: ModelThinkingLevel;
}

const HISTORY_PATH = join(getAgentDir(), "pi-unified-model-picker", "history.json");

function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function cycle<T>(values: readonly T[], current: T, direction: number): T {
  const index = Math.max(0, values.indexOf(current));
  return values[(index + direction + values.length) % values.length]!;
}

function thinkingLabel(level: ModelThinkingLevel): string {
  return level === "xhigh" ? "X-high" : level[0]!.toUpperCase() + level.slice(1);
}

function adjustableValue(value: string, active: boolean, hasAlternatives: boolean): string {
  return active && hasAlternatives ? `← ${value} →` : value;
}

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
  let selected = Math.max(0, initialProvider ? providers.indexOf(initialProvider) : 0);

  return ctx.ui.custom<string | null>((tui, theme: Theme, _keybindings, done) => ({
    render(width: number): string[] {
      return [
        truncateToWidth(theme.fg("accent", theme.bold("Select provider")), width),
        "",
        ...providers.map((provider, index) => {
          const cursor = index === selected ? ">" : " ";
          const active = provider === ctx.model?.provider ? "✓" : " ";
          const line = truncateToWidth(`${cursor} ${active} ${provider}`, width);
          return index === selected ? theme.bg("selectedBg", line) : line;
        }),
        "",
        truncateToWidth(theme.fg("dim", "↑↓ select • enter continue • esc close"), width),
      ];
    },
    invalidate() {},
    handleInput(data: string) {
      if (matchesKey(data, Key.up)) selected = (selected - 1 + providers.length) % providers.length;
      else if (matchesKey(data, Key.down)) selected = (selected + 1) % providers.length;
      else if (matchesKey(data, Key.enter)) done(providers[selected]!);
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
  const models = sortModels(providerModels, recent);
  let selected = Math.max(0, models.findIndex((model) => ctx.model && modelKey(model) === modelKey(ctx.model)));
  let field: Field = "context";
  const budgets = new Map<string, number>();
  const thinking = new Map<string, ModelThinkingLevel>();

  for (const model of models) {
    const options = getContextBudgetOptions(model);
    const isCurrent = ctx.model && modelKey(ctx.model) === modelKey(model);
    const currentBudget = isCurrent ? ctx.model!.contextWindow : undefined;
    budgets.set(modelKey(model), currentBudget && currentBudget <= model.contextWindow ? currentBudget : options.at(-1)!);

    const levels = getSelectableThinkingLevels(model);
    const preferred = isCurrent ? pi.getThinkingLevel() : "medium";
    thinking.set(modelKey(model), normalizeThinkingLevel(levels, preferred));
  }

  return ctx.ui.custom<PickerChoice | null>((tui, theme: Theme, _keybindings, done) => ({
    render(width: number): string[] {
      const narrow = width < 78;
      const visibleRows = narrow ? 8 : 15;
      const start = Math.max(0, Math.min(selected - Math.floor(visibleRows / 2), models.length - visibleRows));
      const visible = models.slice(start, start + visibleRows);
      const lines: string[] = [theme.fg("accent", theme.bold(`${provider} models`)), ""];

      if (!narrow) {
        const contextWidth = 15;
        const reasoningWidth = 15;
        const nameWidth = Math.max(18, width - contextWidth - reasoningWidth - 4);
        lines.push(theme.fg("dim", truncateToWidth(`  ${pad("Model", nameWidth)} ${pad("Context", contextWidth)} Reasoning`, width)));

        for (let row = 0; row < visible.length; row++) {
          const model = visible[row]!;
          const index = start + row;
          const key = modelKey(model);
          const contextOptions = getContextBudgetOptions(model);
          const currentBudget = budgets.get(key)!;
          const budgetOptions = [...new Set([...contextOptions, currentBudget])].sort((a, b) => a - b);
          const levels = getSelectableThinkingLevels(model);
          const context = adjustableValue(formatTokenCount(currentBudget), index === selected && field === "context", budgetOptions.length > 1);
          const reasoning = adjustableValue(thinkingLabel(thinking.get(key)!), index === selected && field === "reasoning", levels.length > 1);
          const cursor = index === selected ? ">" : " ";
          const active = ctx.model && modelKey(ctx.model) === key ? "✓" : " ";
          const line = `${cursor}${active} ${pad(truncateToWidth(model.name, nameWidth), nameWidth)} ${pad(context, contextWidth)} ${reasoning}`;
          const clipped = truncateToWidth(line, width);
          lines.push(index === selected ? theme.bg("selectedBg", clipped) : clipped);
        }
      } else {
        for (let row = 0; row < visible.length; row++) {
          const model = visible[row]!;
          const index = start + row;
          const key = modelKey(model);
          const contextOptions = getContextBudgetOptions(model);
          const currentBudget = budgets.get(key)!;
          const budgetOptions = [...new Set([...contextOptions, currentBudget])].sort((a, b) => a - b);
          const levels = getSelectableThinkingLevels(model);
          const context = adjustableValue(formatTokenCount(currentBudget), index === selected && field === "context", budgetOptions.length > 1);
          const reasoning = adjustableValue(thinkingLabel(thinking.get(key)!), index === selected && field === "reasoning", levels.length > 1);
          const cursor = index === selected ? ">" : " ";
          const active = ctx.model && modelKey(ctx.model) === key ? "✓" : " ";
          const title = truncateToWidth(`${cursor}${active} ${model.name}`, width);
          const values = truncateToWidth(`   Context ${context}   Reasoning ${reasoning}`, width);
          if (index === selected) {
            lines.push(theme.bg("selectedBg", title), theme.bg("selectedBg", values));
          } else {
            lines.push(title, values);
          }
        }
      }

      lines.push(
        "",
        truncateToWidth(
          theme.fg("dim", `↑↓ model • tab field • ←→ change • enter select • esc ${canGoBack ? "back" : "close"}`),
          width,
        ),
      );
      return lines;
    },
    invalidate() {},
    handleInput(data: string) {
      if (matchesKey(data, Key.up)) selected = (selected - 1 + models.length) % models.length;
      else if (matchesKey(data, Key.down)) selected = (selected + 1) % models.length;
      else if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
        field = field === "context" ? "reasoning" : "context";
      } else if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
        const direction = matchesKey(data, Key.left) ? -1 : 1;
        const model = models[selected]!;
        const key = modelKey(model);
        if (field === "context") {
          const current = budgets.get(key)!;
          const options = [...new Set([...getContextBudgetOptions(model), current])].sort((a, b) => a - b);
          if (options.length > 1) budgets.set(key, cycle(options, current, direction));
        } else {
          const levels = getSelectableThinkingLevels(model);
          if (levels.length > 1) thinking.set(key, cycle(levels, thinking.get(key)!, direction));
        }
      } else if (matchesKey(data, Key.enter)) {
        const model = models[selected]!;
        const key = modelKey(model);
        done({ model, contextBudget: budgets.get(key)!, thinkingLevel: thinking.get(key)! });
      } else if (matchesKey(data, Key.escape)) {
        done(null);
      }
      tui.requestRender();
    },
  }));
}

export default function unifiedModelPicker(pi: ExtensionAPI) {
  let recent: RecentModel[] = [];

  pi.on("session_start", async (_event, ctx) => {
    recent = await readHistory(HISTORY_PATH);
    if (ctx.model) recent = addRecentModel(recent, ctx.model);
  });

  pi.on("model_select", async (event) => {
    recent = addRecentModel(recent, event.model);
    try {
      await writeHistory(HISTORY_PATH, recent);
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
          recent = addRecentModel(recent, choice.model);
          await writeHistory(HISTORY_PATH, recent).catch(() => undefined);
          ctx.ui.notify(
            `Using ${choice.model.provider}/${choice.model.id} • context ${formatTokenCount(choice.contextBudget)} • reasoning ${choice.thinkingLevel}`,
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
