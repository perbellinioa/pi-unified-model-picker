import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";

export const STANDARD_CONTEXT_BUDGETS = [
  16_000,
  32_000,
  64_000,
  128_000,
  200_000,
  256_000,
  400_000,
  1_000_000,
] as const;

export interface RecentModel {
  provider: string;
  id: string;
}

export function modelKey(model: Pick<Model<Api>, "provider" | "id">): string {
  return `${model.provider}/${model.id}`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
  }
  return String(tokens);
}

/**
 * Return local context budgets that never exceed the model's advertised
 * context window and leave room beyond its maximum output allocation.
 */
export function getContextBudgetOptions(model: Pick<Model<Api>, "contextWindow" | "maxTokens">): number[] {
  const maximum = Math.max(1, Math.floor(model.contextWindow));
  const minimumSafe = Math.min(maximum, Math.max(16_000, Math.floor(model.maxTokens) + 8_000));
  return [...new Set([...STANDARD_CONTEXT_BUDGETS.filter((value) => value >= minimumSafe && value <= maximum), maximum])]
    .sort((a, b) => a - b);
}

export function filterModels(models: readonly Model<Api>[], provider: string | undefined, query: string): Model<Api>[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return models.filter((model) => {
    if (provider && model.provider !== provider) return false;
    const haystack = `${model.provider} ${model.id} ${model.name}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function sortModels(models: readonly Model<Api>[], recent: readonly RecentModel[]): Model<Api>[] {
  const rank = new Map(recent.map((entry, index) => [`${entry.provider}/${entry.id}`, index]));
  return [...models].sort((a, b) => {
    const aRank = rank.get(modelKey(a)) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(modelKey(b)) ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank || a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function addRecentModel(recent: readonly RecentModel[], model: Pick<Model<Api>, "provider" | "id">, limit = 12): RecentModel[] {
  const next = { provider: model.provider, id: model.id };
  return [next, ...recent.filter((entry) => entry.provider !== next.provider || entry.id !== next.id)].slice(0, limit);
}

export function normalizeThinkingLevel(
  levels: readonly ModelThinkingLevel[],
  preferred: ModelThinkingLevel,
): ModelThinkingLevel {
  if (levels.includes(preferred)) return preferred;
  if (levels.includes("medium")) return "medium";
  return levels[0] ?? "off";
}
