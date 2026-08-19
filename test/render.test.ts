import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { ListSelection, ModelPickerState } from "../src/picker-state.js";
import {
  MODEL_PICKER_WIDE_BREAKPOINT,
  ModelPickerRenderer,
  ProviderPickerRenderer,
  renderModelPicker,
  renderProviderPicker,
} from "../src/render.js";

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

const ansiTheme = {
  fg: (_color: string, text: string) => `\u001b[36m${text}\u001b[39m`,
  bg: (_color: string, text: string) => `\u001b[44m${text}\u001b[49m`,
  bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
} as Theme;

function model(index: number): Model<Api> {
  return {
    id: `model-${index}`,
    name: index === 9
      ? "Model 09 超長いモデル名 🚀 with an exceptionally verbose suffix"
      : `Model ${String(index).padStart(2, "0")}`,
    api: "openai-responses",
    provider: "github-copilot",
    baseUrl: "https://example.test",
    reasoning: index % 5 !== 0,
    thinkingLevelMap: index % 5 === 0
      ? undefined
      : { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  };
}

function state(): ModelPickerState {
  const models = Array.from({ length: 20 }, (_, index) => model(index + 1));
  return new ModelPickerState({
    models,
    recent: [],
    currentModel: models[9],
    currentThinkingLevel: "high",
  });
}

function assertWidth(lines: readonly string[], width: number): void {
  for (const [index, line] of lines.entries()) {
    assert.ok(visibleWidth(line) <= width, `line ${index} is ${visibleWidth(line)} cells at width ${width}: ${JSON.stringify(line)}`);
  }
}

test("proves both fields and both screens for every width from 1 through 500 cells", () => {
  const contextState = state();
  contextState.move(-1); // Select the long Unicode model.
  const reasoningState = state();
  reasoningState.move(-1);
  reasoningState.toggleField();
  const providerState = new ListSelection(["anthropic", "github-copilot", "provider-with-a-very-long-name"], 1);
  for (let width = 1; width <= 500; width++) {
    assertWidth(renderModelPicker(contextState, "github-copilot", true, width, ansiTheme), width);
    assertWidth(renderModelPicker(reasoningState, "github-copilot", false, width, ansiTheme), width);
    assertWidth(renderProviderPicker(providerState, "github-copilot", width, ansiTheme), width);
  }
});

test("fits terminal height from 6 through 80 rows", () => {
  const modelState = state();
  const providers = new ListSelection(Array.from({ length: 30 }, (_, index) => `provider-${index}`), 15);
  for (const width of [40, 77, 78, 120, 240]) {
    for (let height = 6; height <= 80; height++) {
      assert.ok(renderModelPicker(modelState, "github-copilot", true, width, ansiTheme, height).length <= height);
      assert.ok(renderProviderPicker(providers, "provider-15", width, ansiTheme, height).length <= height);
    }
  }
});

test("uses dim metadata with accent only on the active narrow field", () => {
  const calls: Array<{ color: string; text: string }> = [];
  const recordingTheme = {
    fg: (color: string, text: string) => { calls.push({ color, text }); return text; },
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as Theme;
  const picker = state();
  picker.move(-1); // Select a reasoning-capable model.
  renderModelPicker(picker, "github-copilot", true, 60, recordingTheme);
  assert.ok(calls.some((call) => call.color === "dim" && call.text === "   Context "));
  assert.ok(calls.some((call) => call.color === "accent" && call.text.includes("←")));
  assert.ok(calls.some((call) => call.color === "muted" && call.text === "Medium"));

  calls.length = 0;
  picker.toggleField();
  renderModelPicker(picker, "github-copilot", true, 60, recordingTheme);
  assert.ok(calls.some((call) => call.color === "accent" && call.text.includes("Medium")));
  assert.ok(calls.some((call) => call.color === "muted" && call.text === "1M"));
});

test("switches layout exactly at the documented breakpoint", () => {
  const narrow = renderModelPicker(state(), "github-copilot", true, MODEL_PICKER_WIDE_BREAKPOINT - 1, plainTheme);
  const wide = renderModelPicker(state(), "github-copilot", true, MODEL_PICKER_WIDE_BREAKPOINT, plainTheme);
  assert.ok(narrow.some((line) => line.trimStart().startsWith("Context")));
  assert.ok(wide.some((line) => line.includes("Model") && line.includes("Context") && line.includes("Reasoning")));
});

test("render caches survive redundant frames and invalidate on state or theme changes", () => {
  const modelState = state();
  const modelRenderer = new ModelPickerRenderer("github-copilot", true);
  const first = modelRenderer.render(modelState, 120, plainTheme, 40);
  assert.equal(modelRenderer.render(modelState, 120, plainTheme, 40), first);
  assert.notEqual(modelRenderer.render(modelState, 120, plainTheme, 41), first);
  modelState.move(1);
  const moved = modelRenderer.render(modelState, 120, plainTheme, 40);
  assert.notEqual(moved, first);
  assert.equal(modelRenderer.render(modelState, 120, plainTheme, 40), moved);
  modelRenderer.invalidate();
  assert.notEqual(modelRenderer.render(modelState, 120, plainTheme, 40), moved);

  const providers = new ListSelection(["a", "b"]);
  const providerRenderer = new ProviderPickerRenderer();
  const providerFirst = providerRenderer.render(providers, "a", 40, plainTheme);
  assert.equal(providerRenderer.render(providers, "a", 40, plainTheme), providerFirst);
  providers.move(1);
  assert.notEqual(providerRenderer.render(providers, "a", 40, plainTheme), providerFirst);
});

test("matches the provider-selection golden rendering", async () => {
  const state = new ListSelection(["anthropic", "github-copilot", "provider-with-a-very-long-name"], 1);
  const actual = renderProviderPicker(state, "github-copilot", 40, plainTheme).join("\n") + "\n";
  const expected = await readFile(new URL("golden/provider-picker-40.txt", import.meta.url), "utf8");
  assert.equal(actual, expected);
});

for (const width of [40, 77, 78, 120]) {
  test(`matches the ${width}-cell golden rendering`, async () => {
    const actual = renderModelPicker(state(), "github-copilot", true, width, plainTheme).join("\n") + "\n";
    const expected = await readFile(new URL(`golden/model-picker-${width}.txt`, import.meta.url), "utf8");
    assert.equal(actual, expected);
  });
}
