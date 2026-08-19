import assert from "node:assert/strict";
import test from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { handleModelInput, handleProviderInput } from "../src/input.js";
import { ListSelection, ModelPickerState } from "../src/picker-state.js";

function keybindings(bindings: Record<string, string>): Pick<KeybindingsManager, "matches"> {
  return { matches: (data, action) => bindings[data] === action };
}

function model(index: number): Model<Api> {
  return {
    id: `model-${index}`,
    name: `Model ${index}`,
    api: "openai-responses",
    provider: "provider-a",
    baseUrl: "https://example.test",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  };
}

test("provider input honors injected custom bindings, paging, confirm, and cancel", () => {
  const state = new ListSelection([
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ]);
  const keys = keybindings({ j: "tui.select.down", d: "tui.select.pageDown", y: "tui.select.confirm", x: "tui.select.cancel" });
  handleProviderInput(state, "down", keys, 2);
  assert.equal(state.selected.id, "a", "raw defaults must not bypass custom bindings");
  handleProviderInput(state, "j", keys, 2);
  assert.equal(state.selected.id, "b");
  handleProviderInput(state, "d", keys, 2);
  assert.equal(state.selected.id, "c");
  assert.deepEqual(handleProviderInput(state, "y", keys, 2), { type: "confirm", value: "c" });
  assert.deepEqual(handleProviderInput(state, "x", keys, 2), { type: "cancel" });
});

test("model input honors custom field and adjustment bindings", () => {
  const state = new ModelPickerState({ models: [model(1)], recent: [], currentThinkingLevel: "medium" });
  const keys = keybindings({ t: "tui.input.tab", h: "tui.editor.cursorLeft", l: "tui.editor.cursorRight", y: "tui.select.confirm" });
  handleModelInput(state, "t", keys, 5);
  assert.equal(state.field, "reasoning");
  handleModelInput(state, "l", keys, 5);
  assert.equal(state.choice().thinkingLevel, "high");
  handleModelInput(state, "h", keys, 5);
  assert.equal(state.choice().thinkingLevel, "medium");
  assert.equal(handleModelInput(state, "y", keys, 5)?.type, "confirm");
});
