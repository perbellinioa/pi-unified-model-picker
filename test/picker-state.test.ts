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
  assert.equal(state.rows(1).rows[0]?.reasoning, "—");
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
  assert.equal(state.rows(1).rows[0]?.current, true);
});

test("generic list selection clamps, wraps, and remains stable for one item", () => {
  const many = new ListSelection(["a", "b", "c"], 99);
  assert.equal(many.selected, "c");
  many.move(1);
  assert.equal(many.selected, "a");
  const one = new ListSelection(["only"]);
  assert.equal(one.move(1), false);
  assert.equal(one.revision, 0);
});
