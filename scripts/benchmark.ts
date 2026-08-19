import { performance } from "node:perf_hooks";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { ModelPickerState } from "../src/picker-state.js";
import { ModelPickerRenderer, renderModelPicker } from "../src/render.js";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;
const models: Model<Api>[] = Array.from({ length: 250 }, (_, index) => ({
  id: `model-${index}`,
  name: `Benchmark Model ${index}`,
  api: "openai-responses" as const,
  provider: `provider-${index % 5}`,
  baseUrl: "https://benchmark.test",
  reasoning: true,
  thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
  input: ["text" as const],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 64_000,
}));
const state = new ModelPickerState({ models, recent: [], currentThinkingLevel: "medium" });
const renderer = new ModelPickerRenderer("benchmark", true);
const iterations = 20_000;

const measure = (operation: () => void): { totalMs: number; perFrameUs: number } => {
  const started = performance.now();
  for (let index = 0; index < iterations; index++) operation();
  const totalMs = performance.now() - started;
  return { totalMs: Number(totalMs.toFixed(3)), perFrameUs: Number((totalMs * 1_000 / iterations).toFixed(3)) };
};

renderer.render(state, 120, theme);
const cached = measure(() => { renderer.render(state, 120, theme); });
const uncached = measure(() => { renderModelPicker(state, "benchmark", true, 120, theme); });
const interactive = measure(() => {
  state.move(1);
  renderer.render(state, 120, theme);
});

console.log(JSON.stringify({ models: models.length, iterations, cached, uncached, interactive }, null, 2));
