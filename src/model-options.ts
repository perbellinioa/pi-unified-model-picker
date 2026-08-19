import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  type Api,
  type Model,
  type ModelThinkingLevel,
} from "@earendil-works/pi-ai";

export const RECENT_MODEL_LIMIT = 12;

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
  if (tokens < 1_000) return String(tokens);
  if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}K`;
  if (tokens < 999_500) return `${Math.round(tokens / 1_000)}K`;
  if (tokens < 10_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  return `${Math.round(tokens / 1_000_000)}M`;
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

export function sortModels(models: readonly Model<Api>[], recent: readonly RecentModel[]): Model<Api>[] {
  const rank = new Map(recent.map((entry, index) => [`${entry.provider}/${entry.id}`, index]));
  return [...models].sort((a, b) => {
    const aRank = rank.get(modelKey(a)) ?? Number.MAX_SAFE_INTEGER;
    const bRank = rank.get(modelKey(b)) ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank || a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function addRecentModel(
  recent: readonly RecentModel[],
  model: Pick<Model<Api>, "provider" | "id">,
  limit = RECENT_MODEL_LIMIT,
): RecentModel[] {
  const next = { provider: model.provider, id: model.id };
  return [next, ...recent.filter((entry) => entry.provider !== next.provider || entry.id !== next.id)].slice(0, limit);
}

export function mergeRecentModels(
  primary: readonly RecentModel[],
  secondary: readonly RecentModel[],
  limit = RECENT_MODEL_LIMIT,
): RecentModel[] {
  const merged = [...primary];
  for (const entry of secondary) {
    if (!merged.some((item) => item.provider === entry.provider && item.id === entry.id)) merged.push(entry);
  }
  return merged.slice(0, limit);
}

/**
 * Return distinct user-facing thinking choices. Provider aliases are
 * de-duplicated in favor of the level whose name matches the effective value
 * (for example low wins over a minimal→low alias). Genuine `off` and
 * `minimal` support is preserved.
 */
export function getSelectableThinkingLevels(model: Model<Api>): ModelThinkingLevel[] {
  if (!model.reasoning) return [];
  const candidates = getSupportedThinkingLevels(model);
  const effective = (level: ModelThinkingLevel): string => model.thinkingLevelMap?.[level] ?? level;
  const preferredByValue = new Map<string, ModelThinkingLevel>();
  for (const level of candidates) {
    const value = effective(level);
    const previous = preferredByValue.get(value);
    if (!previous || level === value) preferredByValue.set(value, level);
  }
  const selected = new Set(preferredByValue.values());
  return candidates.filter((level) => selected.has(level));
}

export function normalizeThinkingLevel(
  model: Model<Api>,
  levels: readonly ModelThinkingLevel[],
  preferred: ModelThinkingLevel,
): ModelThinkingLevel {
  if (levels.includes(preferred)) return preferred;
  const clamped = clampThinkingLevel(model, preferred);
  if (levels.includes(clamped)) return clamped;
  const effective = model.thinkingLevelMap?.[clamped] ?? clamped;
  return levels.find((level) => (model.thinkingLevelMap?.[level] ?? level) === effective) ?? levels[0] ?? "off";
}
