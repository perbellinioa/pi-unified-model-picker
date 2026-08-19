import assert from "node:assert/strict";
import test from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai";
import { ListSelection, ModelPickerState } from "../src/picker-state.js";

function model(index: number, overrides: Partial<Model<Api>> = {}): Model<Api> {
  return {
    id: `model-${index}`,
    name: `Model ${String(index).padStart(2, "0")}`,
    api: "openai-responses",
    provider: "provider-a",
    baseUrl: "https://example.test",
    reasoning: true,
    thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 64_000,
    ...overrides,
  };
}

test("model navigation wraps and increments revision only on changes", () => {
  const state = new ModelPickerState({ models: [model(1), model(2)], recent: [], currentThinkingLevel: "medium" });
  assert.equal(state.selectedModel.id, "model-1");
  assert.equal(state.revision, 0);
  assert.equal(state.move(-1), true);
  assert.equal(state.selectedModel.id, "model-2");
  assert.equal(state.revision, 1);
});

test("context and reasoning adjustment reach exact provider max", () => {
  const state = new ModelPickerState({ models: [model(1)], recent: [], currentThinkingLevel: "medium" });
  assert.equal(state.choice().contextBudget, 1_000_000);
  assert.equal(state.adjust(1), false, "context must clamp at its maximum instead of wrapping");
  assert.equal(state.choice().contextBudget, 1_000_000);
  state.adjust(-1);
  assert.equal(state.choice().contextBudget, 400_000);
  state.toggleField();
  assert.equal(state.choice().thinkingLevel, "medium");
  state.adjust(1);
  state.adjust(1);
  state.adjust(1);
  assert.equal(state.choice().thinkingLevel, "max");
});

test("non-reasoning models expose a dash and select off internally", () => {
  const state = new ModelPickerState({
    models: [model(1, { reasoning: false, thinkingLevelMap: undefined })],
    recent: [],
    currentThinkingLevel: "high",
  });
  assert.equal(state.window(1).rows[0]?.reasoning, "—");
  assert.equal(state.choice().thinkingLevel, "off");
  state.toggleField();
  assert.equal(state.adjust(1), false);
});

test("current model retains its custom context and thinking effort", () => {
  const registryModel = model(1);
  const currentModel = { ...registryModel, contextWindow: 256_000 };
  const state = new ModelPickerState({
    models: [registryModel],
    recent: [],
    currentModel,
    currentThinkingLevel: "xhigh",
  });
  assert.equal(state.choice().contextBudget, 256_000);
  assert.equal(state.choice().thinkingLevel, "xhigh");
  assert.equal(state.window(1).rows[0]?.current, true);
});

test("uses scoped preferred thinking levels for non-current models", () => {
  const target = model(2);
  const state = new ModelPickerState({
    models: [model(1), target],
    recent: [{ provider: target.provider, id: target.id }],
    currentThinkingLevel: "medium",
    preferredThinkingLevels: new Map([[`${target.provider}/${target.id}`, "xhigh"]]),
  });
  assert.equal(state.selectedModel.id, target.id);
  assert.equal(state.choice().thinkingLevel, "xhigh");
});

test("untouched current model preserves disabled reasoning exactly", () => {
  const registryModel = model(1, {
    thinkingLevelMap: { off: "none", minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null },
  });
  const state = new ModelPickerState({
    models: [registryModel],
    recent: [],
    currentModel: registryModel,
    currentThinkingLevel: "off",
  });
  assert.equal(state.choice().thinkingLevel, "off");
  assert.equal(state.window(1).rows[0]?.reasoning, "Disabled");
});

test("generic list selection clamps, wraps, pages, and remains stable for one item", () => {
  const many = new ListSelection(["a", "b", "c"], 99);
  assert.equal(many.selected, "c");
  many.move(1);
  assert.equal(many.selected, "a");
  many.page(1, 2);
  assert.equal(many.selected, "c");
  const one = new ListSelection(["only"]);
  assert.equal(one.move(1), false);
  assert.equal(one.revision, 0);
});
