import assert from "node:assert/strict";
import test from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  addRecentModel,
  filterModels,
  formatTokenCount,
  getContextBudgetOptions,
  getSelectableThinkingLevels,
  normalizeThinkingLevel,
  sortModels,
} from "../src/model-options.js";

function model(overrides: Partial<Model<Api>> = {}): Model<Api> {
  return {
    id: "model-a",
    name: "Model A",
    api: "openai-responses",
    provider: "provider-a",
    baseUrl: "https://example.test",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 16_000,
    ...overrides,
  };
}

test("formats token counts compactly", () => {
  assert.equal(formatTokenCount(128_000), "128K");
  assert.equal(formatTokenCount(1_000_000), "1M");
  assert.equal(formatTokenCount(1_500_000), "1.5M");
});

test("context budgets include the maximum and remain safe", () => {
  const options = getContextBudgetOptions(model({ contextWindow: 200_000, maxTokens: 32_000 }));
  assert.deepEqual(options, [64_000, 128_000, 200_000]);
  assert.ok(options.every((value) => value <= 200_000));
  assert.ok(options.every((value) => value >= 40_000));
});

test("small windows fall back to their advertised maximum", () => {
  assert.deepEqual(getContextBudgetOptions(model({ contextWindow: 8_192, maxTokens: 4_096 })), [8_192]);
});

test("filters across provider, id, and display name", () => {
  const models = [
    model(),
    model({ provider: "provider-b", id: "vision-b", name: "Vision Beta" }),
  ];
  assert.deepEqual(filterModels(models, undefined, "provider-b vision"), [models[1]]);
  assert.deepEqual(filterModels(models, "provider-a", "beta"), []);
});

test("recent models sort first and are de-duplicated", () => {
  const first = model();
  const second = model({ provider: "provider-b", id: "model-b", name: "Model B" });
  const recent = addRecentModel(addRecentModel([], first), second);
  assert.deepEqual(recent, [
    { provider: "provider-b", id: "model-b" },
    { provider: "provider-a", id: "model-a" },
  ]);
  assert.deepEqual(sortModels([first, second], recent), [second, first]);
});

test("omits the duplicate minimal abstraction from reasoning choices", () => {
  assert.deepEqual(
    getSelectableThinkingLevels(model({
      thinkingLevelMap: { minimal: "low", low: "low", xhigh: "xhigh", max: "max" },
    })),
    ["low", "medium", "high", "xhigh", "max"],
  );
});

test("returns no effort choices for a non-reasoning model", () => {
  assert.deepEqual(getSelectableThinkingLevels(model({ reasoning: false })), []);
});

test("preserves explicit max support for current Claude and GPT families", () => {
  const opusOrSonnet = model({ thinkingLevelMap: { xhigh: "xhigh", max: "max" } });
  const gpt56 = model({ thinkingLevelMap: { off: null, minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" } });
  assert.equal(getSelectableThinkingLevels(opusOrSonnet).at(-1), "max");
  assert.equal(getSelectableThinkingLevels(gpt56).at(-1), "max");
});

test("normalizes unsupported thinking levels", () => {
  assert.equal(normalizeThinkingLevel(["off", "low", "medium", "high"], "xhigh"), "medium");
  assert.equal(normalizeThinkingLevel(["off"], "high"), "off");
});
