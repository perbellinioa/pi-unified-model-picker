import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import {
  formatTokenCount,
  getContextBudgetOptions,
  getSelectableThinkingLevels,
  modelKey,
  normalizeThinkingLevel,
  sortModels,
  type RecentModel,
} from "./model-options.js";

export type PickerField = "context" | "reasoning";

export interface PickerChoice {
  model: Model<Api>;
  contextBudget: number;
  thinkingLevel: ModelThinkingLevel;
}

export interface PickerRow {
  key: string;
  name: string;
  selected: boolean;
  current: boolean;
  context: string;
  reasoning: string;
  contextAdjustable: boolean;
  reasoningAdjustable: boolean;
}

interface ModelSelection {
  model: Model<Api>;
  key: string;
  contextOptions: number[];
  contextIndex: number;
  reasoningOptions: ModelThinkingLevel[];
  reasoningIndex: number;
}

function nearestIndex(values: readonly number[], preferred: number | undefined): number {
  if (preferred === undefined) return values.length - 1;
  const exact = values.indexOf(preferred);
  if (exact >= 0) return exact;
  let nearest = 0;
  for (let index = 1; index < values.length; index++) {
    if (Math.abs(values[index]! - preferred) < Math.abs(values[nearest]! - preferred)) nearest = index;
  }
  return nearest;
}

function thinkingLabel(level: ModelThinkingLevel): string {
  return level === "xhigh" ? "X-high" : level[0]!.toUpperCase() + level.slice(1);
}

export class ListSelection<T> {
  private index: number;
  revision = 0;

  constructor(readonly items: readonly T[], initialIndex = 0) {
    if (items.length === 0) throw new Error("ListSelection requires at least one item");
    this.index = Math.max(0, Math.min(initialIndex, items.length - 1));
  }

  get selectedIndex(): number { return this.index; }
  get selected(): T { return this.items[this.index]!; }

  move(direction: number): boolean {
    if (this.items.length < 2 || direction === 0) return false;
    this.index = (this.index + Math.sign(direction) + this.items.length) % this.items.length;
    this.revision += 1;
    return true;
  }
}

export class ModelPickerState {
  readonly models: readonly Model<Api>[];
  readonly currentModelKey?: string;
  field: PickerField = "context";
  revision = 0;
  private selectedIndexValue: number;
  private readonly selections: ModelSelection[];

  constructor(options: {
    models: readonly Model<Api>[];
    recent: readonly RecentModel[];
    currentModel?: Model<Api>;
    currentThinkingLevel: ModelThinkingLevel;
  }) {
    if (options.models.length === 0) throw new Error("ModelPickerState requires at least one model");
    this.models = sortModels(options.models, options.recent);
    this.currentModelKey = options.currentModel ? modelKey(options.currentModel) : undefined;
    this.selectedIndexValue = Math.max(0, this.models.findIndex((model) => modelKey(model) === this.currentModelKey));
    this.selections = this.models.map((model) => {
      const key = modelKey(model);
      const isCurrent = key === this.currentModelKey;
      const standardContexts = getContextBudgetOptions(model);
      const currentContext = isCurrent && options.currentModel!.contextWindow <= model.contextWindow
        ? options.currentModel!.contextWindow
        : undefined;
      const contextOptions = [...new Set([...standardContexts, ...(currentContext ? [currentContext] : [])])].sort((a, b) => a - b);
      const reasoningOptions = getSelectableThinkingLevels(model);
      const preferredReasoning = isCurrent ? options.currentThinkingLevel : "medium";
      const normalizedReasoning = normalizeThinkingLevel(reasoningOptions, preferredReasoning);
      return {
        model,
        key,
        contextOptions,
        contextIndex: nearestIndex(contextOptions, currentContext),
        reasoningOptions,
        reasoningIndex: Math.max(0, reasoningOptions.indexOf(normalizedReasoning)),
      };
    });
  }

  get selectedIndex(): number { return this.selectedIndexValue; }
  get selectedModel(): Model<Api> { return this.selections[this.selectedIndexValue]!.model; }
  get size(): number { return this.selections.length; }

  move(direction: number): boolean {
    if (this.selections.length < 2 || direction === 0) return false;
    this.selectedIndexValue = (this.selectedIndexValue + Math.sign(direction) + this.selections.length) % this.selections.length;
    this.revision += 1;
    return true;
  }

  toggleField(): void {
    this.field = this.field === "context" ? "reasoning" : "context";
    this.revision += 1;
  }

  adjust(direction: number): boolean {
    const selection = this.selections[this.selectedIndexValue]!;
    const delta = Math.sign(direction);
    if (delta === 0) return false;
    if (this.field === "context") {
      if (selection.contextOptions.length < 2) return false;
      selection.contextIndex = (selection.contextIndex + delta + selection.contextOptions.length) % selection.contextOptions.length;
    } else {
      if (selection.reasoningOptions.length < 2) return false;
      selection.reasoningIndex = (selection.reasoningIndex + delta + selection.reasoningOptions.length) % selection.reasoningOptions.length;
    }
    this.revision += 1;
    return true;
  }

  choice(): PickerChoice {
    const selection = this.selections[this.selectedIndexValue]!;
    return {
      model: selection.model,
      contextBudget: selection.contextOptions[selection.contextIndex]!,
      thinkingLevel: selection.reasoningOptions[selection.reasoningIndex] ?? "off",
    };
  }

  rows(maxRows: number): { start: number; rows: PickerRow[] } {
    const count = Math.max(1, Math.floor(maxRows));
    const start = Math.max(0, Math.min(
      this.selectedIndexValue - Math.floor(count / 2),
      this.selections.length - count,
    ));
    return {
      start,
      rows: this.selections.slice(start, start + count).map((selection, offset) => {
        const index = start + offset;
        return {
          key: selection.key,
          name: selection.model.name,
          selected: index === this.selectedIndexValue,
          current: selection.key === this.currentModelKey,
          context: formatTokenCount(selection.contextOptions[selection.contextIndex]!),
          reasoning: selection.reasoningOptions.length > 0
            ? thinkingLabel(selection.reasoningOptions[selection.reasoningIndex]!)
            : "—",
          contextAdjustable: selection.contextOptions.length > 1,
          reasoningAdjustable: selection.reasoningOptions.length > 1,
        };
      }),
    };
  }
}
