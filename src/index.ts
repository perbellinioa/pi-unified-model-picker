import { join } from "node:path";
import {
  getSupportedThinkingLevels,
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
  filterModels,
  formatTokenCount,
  getContextBudgetOptions,
  modelKey,
  normalizeThinkingLevel,
  sortModels,
  type RecentModel,
} from "./model-options.js";

type Field = "provider" | "budget" | "reasoning";

interface PickerChoice {
  model: Model<Api>;
  contextBudget: number;
  thinkingLevel: ModelThinkingLevel;
}

const HISTORY_PATH = join(getAgentDir(), "pi-unified-model-picker", "history.json");
const FIELD_ORDER: Field[] = ["provider", "budget", "reasoning"];

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

function availableModels(ctx: ExtensionCommandContext): Model<Api>[] {
  const models = ctx.scopedModels.length > 0
    ? ctx.scopedModels.map((entry) => entry.model)
    : ctx.modelRegistry.getAvailable();
  return [...new Map(models.map((model) => [modelKey(model), model])).values()];
}

async function showPicker(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  models: Model<Api>[],
  recent: RecentModel[],
): Promise<PickerChoice | null> {
  const ordered = sortModels(models, recent);
  const providers = [undefined, ...new Set(ordered.map((model) => model.provider).sort())] as const;
  let providerIndex = 0;
  let query = "";
  let searchMode = false;
  let field: Field = "provider";
  let selected = Math.max(0, ordered.findIndex((model) => modelKey(model) === (ctx.model ? modelKey(ctx.model) : "")));

  const budgets = new Map<string, number>();
  const thinking = new Map<string, ModelThinkingLevel>();

  for (const model of ordered) {
    const options = getContextBudgetOptions(model);
    const isCurrent = ctx.model && modelKey(ctx.model) === modelKey(model);
    const currentBudget = isCurrent ? ctx.model!.contextWindow : undefined;
    budgets.set(modelKey(model), currentBudget && currentBudget <= model.contextWindow ? currentBudget : options.at(-1)!);

    const levels = getSupportedThinkingLevels(model);
    const preferred = isCurrent ? pi.getThinkingLevel() : "medium";
    thinking.set(modelKey(model), normalizeThinkingLevel(levels, preferred));
  }

  const currentProvider = () => providers[providerIndex];
  const visibleModels = () => filterModels(ordered, currentProvider(), query);
  const selectedModel = () => visibleModels()[selected];
  const clampSelection = (preferredKey?: string) => {
    const visible = visibleModels();
    if (preferredKey) {
      const next = visible.findIndex((model) => modelKey(model) === preferredKey);
      if (next >= 0) selected = next;
    }
    selected = Math.max(0, Math.min(selected, visible.length - 1));
  };

  return ctx.ui.custom<PickerChoice | null>((tui, theme: Theme, _keybindings, done) => ({
    render(width: number): string[] {
      const visible = visibleModels();
      const model = selectedModel();
      const providerName = currentProvider() ?? "All";
      const providerControl = field === "provider" && !searchMode ? `← ${providerName} →` : providerName;
      const searchControl = searchMode ? `${query}▌` : query || "type / to search";
      const title = theme.fg("accent", theme.bold("Unified model picker"));
      const controls = `Provider: ${providerControl}   Search: ${searchControl}`;

      const providerWidth = width >= 105 ? 18 : 13;
      const trailingWidth = width >= 105 ? 47 : 34;
      const nameWidth = Math.max(16, width - providerWidth - trailingWidth - 5);
      const header = `  ${pad("Provider", providerWidth)} ${pad("Model", nameWidth)} ${pad("Window", 8)} ${pad("Budget", 9)} ${pad("Reason", 9)} Caps`;
      const start = Math.max(0, Math.min(selected - 7, visible.length - 15));
      const rows = visible.slice(start, start + 15).map((item, rowIndex) => {
        const index = start + rowIndex;
        const active = ctx.model && modelKey(ctx.model) === modelKey(item) ? "✓" : " ";
        const cursor = index === selected ? ">" : " ";
        const key = modelKey(item);
        const budget = budgets.get(key)!;
        const budgetText = field === "budget" && index === selected && !searchMode
          ? `←${formatTokenCount(budget)}→`
          : formatTokenCount(budget);
        const reason = thinkingLabel(thinking.get(key)!);
        const reasonText = field === "reasoning" && index === selected && !searchMode ? `←${reason}→` : reason;
        const capabilities = [item.input.includes("image") ? "vision" : "", item.reasoning ? "reason" : ""]
          .filter(Boolean)
          .join(" ") || "text";
        const line = `${cursor}${active} ${pad(truncateToWidth(item.provider, providerWidth), providerWidth)} ${pad(truncateToWidth(item.name, nameWidth), nameWidth)} ${pad(formatTokenCount(item.contextWindow), 8)} ${pad(budgetText, 9)} ${pad(reasonText, 9)} ${capabilities}`;
        const clipped = truncateToWidth(line, width);
        return index === selected ? theme.bg("selectedBg", clipped) : clipped;
      });

      const details = model
        ? `Selected: ${model.provider}/${model.id} • API: ${model.api} • max output: ${formatTokenCount(model.maxTokens)}`
        : "No models match the current provider and search.";
      const budgetHelp = model
        ? `Context budget is local to pi; advertised model maximum: ${formatTokenCount(model.contextWindow)}.`
        : "";
      const help = searchMode
        ? "Search mode • type to filter • backspace delete • enter/esc finish search"
        : "↑↓ model • tab field • ←→ change • / search • enter select • esc cancel";

      return [
        truncateToWidth(title, width),
        truncateToWidth(theme.fg("muted", controls), width),
        truncateToWidth(theme.fg("dim", header), width),
        ...(rows.length ? rows : [theme.fg("warning", "  No matching models")]),
        "",
        truncateToWidth(theme.fg("accent", details), width),
        truncateToWidth(theme.fg("dim", budgetHelp), width),
        truncateToWidth(theme.fg("dim", help), width),
        truncateToWidth(theme.fg("dim", `Field: ${field === "budget" ? "context budget" : field}`), width),
      ];
    },
    invalidate() {},
    handleInput(data: string) {
      if (searchMode) {
        const previousKey = selectedModel() ? modelKey(selectedModel()!) : undefined;
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) {
          searchMode = false;
        } else if (matchesKey(data, Key.backspace) || matchesKey(data, Key.delete)) {
          query = query.slice(0, -1);
          clampSelection(previousKey);
        } else if (/^[\x20-\x7e]+$/.test(data)) {
          query += data;
          clampSelection(previousKey);
        }
        tui.requestRender();
        return;
      }

      const visible = visibleModels();
      if (matchesKey(data, Key.up) && visible.length) selected = (selected - 1 + visible.length) % visible.length;
      else if (matchesKey(data, Key.down) && visible.length) selected = (selected + 1) % visible.length;
      else if (matchesKey(data, Key.tab)) field = cycle(FIELD_ORDER, field, 1);
      else if (matchesKey(data, Key.shift("tab"))) field = cycle(FIELD_ORDER, field, -1);
      else if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
        const direction = matchesKey(data, Key.left) ? -1 : 1;
        const before = selectedModel();
        if (field === "provider") {
          providerIndex = (providerIndex + direction + providers.length) % providers.length;
          clampSelection(before ? modelKey(before) : undefined);
        } else if (before) {
          const key = modelKey(before);
          if (field === "budget") {
            const options = getContextBudgetOptions(before);
            const current = budgets.get(key)!;
            const withCurrent = [...new Set([...options, current])].sort((a, b) => a - b);
            budgets.set(key, cycle(withCurrent, current, direction));
          } else {
            const levels = getSupportedThinkingLevels(before);
            thinking.set(key, cycle(levels, thinking.get(key)!, direction));
          }
        }
      } else if (data === "/" || (/^[\x20-\x7e]$/.test(data) && !matchesKey(data, Key.space))) {
        searchMode = true;
        if (data !== "/") query += data;
        clampSelection();
      } else if (matchesKey(data, Key.enter)) {
        const choice = selectedModel();
        if (choice) {
          const key = modelKey(choice);
          done({ model: choice, contextBudget: budgets.get(key)!, thinkingLevel: thinking.get(key)! });
        }
      } else if (matchesKey(data, Key.escape)) {
        if (query) {
          query = "";
          clampSelection();
        } else {
          done(null);
        }
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
    description: "Select a provider, model, context budget, and reasoning level",
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

      const choice = await showPicker(pi, ctx, models, recent);
      if (!choice) return;

      const selected = { ...choice.model, contextWindow: choice.contextBudget } as Model<Api>;
      if (!(await pi.setModel(selected))) {
        ctx.ui.notify(`No credentials available for ${choice.model.provider}/${choice.model.id}`, "error");
        return;
      }
      pi.setThinkingLevel(choice.thinkingLevel);
      recent = addRecentModel(recent, choice.model);
      await writeHistory(HISTORY_PATH, recent).catch(() => undefined);
      ctx.ui.notify(
        `Using ${choice.model.provider}/${choice.model.id} • budget ${formatTokenCount(choice.contextBudget)} • reasoning ${choice.thinkingLevel}`,
        "info",
      );
    },
  });
}
