# Contributing

Thanks for improving `pi-unified-model-picker`.

## Development setup

Requirements: Node.js 22.19 or newer and npm 11.

```bash
npm ci
npm run validate
npm run benchmark
```

For an isolated interactive test with multiple fixture providers:

```bash
npm run test:ui
```

## Design constraints

- Keep the picker provider-neutral. Provider discovery, authentication, and transport belong elsewhere.
- Preserve the user's model, context, and reasoning choices unless they deliberately change them.
- Keep the provider/model flow keyboard-first and lean; avoid adding mandatory dialogs.
- Respect pi's injected keybindings and theme.
- Never exceed the width or height provided by the TUI.
- Treat ANSI styling, Unicode width, narrow terminals, and resizing as correctness concerns.
- Context controls are local session/model budgets, not provider-side context changes.

## Pull requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Update JSON goldens for intentional rendering changes.
- Run `npm run validate` before submitting.
- Run `npm run benchmark` for render-path changes and document meaningful regressions or improvements.
- Do not commit credentials, auth files, sessions, local history, or screenshots containing sensitive data.
