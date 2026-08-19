import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function register(
  pi: ExtensionAPI,
  id: string,
  name: string,
  models: ProviderModelConfig[],
): void {
  pi.registerProvider(id, {
    name,
    baseUrl: "http://127.0.0.1:1/v1",
    apiKey: "manual-ui-test-no-network",
    api: "openai-completions",
    models,
  });
}

export default function manualMultiProvider(pi: ExtensionAPI): void {
  register(pi, "ui-test-alpha", "Alpha Lab", [
    {
      id: "alpha-small",
      name: "Alpha Small",
      reasoning: false,
      input: ["text"],
      contextWindow: 32_000,
      maxTokens: 4_000,
      cost,
    },
  ]);

  register(
    pi,
    "ui-test-large-catalog",
    "A Provider with an Exceptionally Long Display Name",
    Array.from({ length: 30 }, (_, index): ProviderModelConfig => ({
      id: `catalog-model-${index + 1}`,
      name: index === 8
        ? "Model 09 超長いモデル名 🚀 with an exceptionally verbose suffix"
        : `Catalog Model ${String(index + 1).padStart(2, "0")}`,
      reasoning: true,
      thinkingLevelMap: {
        off: "none",
        minimal: index % 2 === 0 ? "minimal" : null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: index % 3 === 0 ? "xhigh" : null,
        max: index % 5 === 0 ? "max" : null,
      },
      input: index % 2 === 0 ? ["text", "image"] : ["text"],
      contextWindow: index % 3 === 0 ? 1_000_000 : index % 3 === 1 ? 200_000 : 128_000,
      maxTokens: index % 3 === 0 ? 64_000 : 16_000,
      cost,
    })),
  );

  register(pi, "ui-test-unicode", "日本語プロバイダー 🚀", [
    {
      id: "unicode-no-reasoning",
      name: "推論なしモデル",
      reasoning: false,
      input: ["text"],
      contextWindow: 8_192,
      maxTokens: 2_048,
      cost,
    },
    {
      id: "unicode-reasoning",
      name: "思考モデル 🧠",
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: null,
        max: "max",
      },
      input: ["text", "image"],
      contextWindow: 256_000,
      maxTokens: 32_000,
      cost,
    },
  ]);

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorText("/model-picker");
    ctx.ui.notify("Manual UI fixture loaded. Press Enter to open /model-picker.", "info");
  });
}
