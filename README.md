# pi-unified-model-picker

A provider-agnostic model picker for [pi](https://github.com/earendil-works/pi-mono). Choose the provider, model, local context budget, and supported reasoning level in one terminal screen.

![Unified model picker preview](docs/model-picker.svg)

## Features

- Models from every configured provider
- Respects pi's scoped-model configuration
- Provider filtering and text search
- Model context window, maximum output, API, vision, and reasoning capabilities
- Reasoning levels from pi's native `getSupportedThinkingLevels()` API
- Safe context-budget options that never exceed the advertised model window
- Recent-model ordering persisted locally
- One-step selection through `/model-picker`

> **Context budget:** this changes pi's local context/compaction budget for the selected model. It does not change the remote model's actual context window. The picker never offers a budget above the model's advertised maximum.

## Requirements

- pi 0.84 or newer
- Node.js 20 or newer
- Interactive TUI mode

## Install

From npm after publication:

```bash
pi install npm:pi-unified-model-picker
```

From GitHub:

```bash
pi install git:github.com/perbellinioa/pi-unified-model-picker
```

For local development:

```bash
pi install /absolute/path/to/pi-unified-model-picker
```

Then run `/reload` in an existing pi session.

## Usage

Open the picker:

```text
/model-picker
```

Keys:

| Key | Action |
| --- | --- |
| `↑` / `↓` | Select a model |
| `Tab` / `Shift+Tab` | Switch provider, context-budget, and reasoning fields |
| `←` / `→` | Change the active field |
| `/` or printable text | Enter search mode |
| `Enter` | Finish search or select the highlighted model |
| `Esc` | Finish search, clear a filter, or cancel |

Recent-model history is stored in:

```text
~/.pi/agent/pi-unified-model-picker/history.json
```

It contains only provider and model identifiers—no credentials.

## Development

```bash
npm install
npm run validate
```

The package uses pi's current APIs:

- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`

## Design principles

- Provider-neutral: discovery and authentication remain the responsibility of pi and provider extensions.
- Non-invasive: the picker does not register or replace providers.
- Capability-aware: reasoning choices come from the selected model definition.
- Honest context controls: the UI calls the setting a local context budget rather than implying a provider-side context change.

## License

MIT
