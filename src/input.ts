import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { ListSelection, ModelPickerState, type PickerChoice } from "./picker-state.js";
import type { ProviderOption } from "./render.js";

export type InputOutcome<T> =
  | { type: "confirm"; value: T }
  | { type: "cancel" }
  | undefined;

type KeyMatcher = Pick<KeybindingsManager, "matches">;

export function handleProviderInput(
  state: ListSelection<ProviderOption>,
  data: string,
  keybindings: KeyMatcher,
  pageSize: number,
): InputOutcome<string> {
  if (keybindings.matches(data, "tui.select.up")) state.move(-1);
  else if (keybindings.matches(data, "tui.select.down")) state.move(1);
  else if (keybindings.matches(data, "tui.select.pageUp")) state.page(-1, pageSize);
  else if (keybindings.matches(data, "tui.select.pageDown")) state.page(1, pageSize);
  else if (keybindings.matches(data, "tui.select.confirm")) return { type: "confirm", value: state.selected.id };
  else if (keybindings.matches(data, "tui.select.cancel")) return { type: "cancel" };
  return undefined;
}

export function handleModelInput(
  state: ModelPickerState,
  data: string,
  keybindings: KeyMatcher,
  pageSize: number,
): InputOutcome<PickerChoice> {
  if (keybindings.matches(data, "tui.select.up")) state.move(-1);
  else if (keybindings.matches(data, "tui.select.down")) state.move(1);
  else if (keybindings.matches(data, "tui.select.pageUp")) state.page(-1, pageSize);
  else if (keybindings.matches(data, "tui.select.pageDown")) state.page(1, pageSize);
  else if (keybindings.matches(data, "tui.input.tab")) state.toggleField();
  else if (keybindings.matches(data, "tui.editor.cursorLeft")) state.adjust(-1);
  else if (keybindings.matches(data, "tui.editor.cursorRight")) state.adjust(1);
  else if (keybindings.matches(data, "tui.select.confirm")) return { type: "confirm", value: state.choice() };
  else if (keybindings.matches(data, "tui.select.cancel")) return { type: "cancel" };
  return undefined;
}
