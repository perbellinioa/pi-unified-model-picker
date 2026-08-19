import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { ListSelection, ModelPickerState, type PickerRow } from "./picker-state.js";

const WIDE_BREAKPOINT = 78;
const WIDE_VISIBLE_ROWS = 15;
const NARROW_VISIBLE_ROWS = 8;

function normalizedWidth(width: number): number {
  return Math.max(1, Math.floor(width));
}

function clip(text: string, width: number): string {
  return truncateToWidth(text, normalizedWidth(width));
}

function pad(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width));
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function responsiveText(full: string, compact: string, width: number): string {
  return visibleWidth(full) <= width ? full : compact;
}

function adjustable(value: string, active: boolean, available: boolean): string {
  return active && available ? `← ${value} →` : value;
}

function selectedLine(line: string, selected: boolean, width: number, theme: Theme): string {
  const clipped = clip(line, width);
  return selected ? theme.bg("selectedBg", clipped) : clipped;
}

function rowValues(row: PickerRow, state: ModelPickerState): { context: string; reasoning: string } {
  return {
    context: adjustable(row.context, row.selected && state.field === "context", row.contextAdjustable),
    reasoning: adjustable(row.reasoning, row.selected && state.field === "reasoning", row.reasoningAdjustable),
  };
}

function renderWideRow(row: PickerRow, state: ModelPickerState, width: number, theme: Theme): string {
  const contextWidth = 15;
  const reasoningWidth = 15;
  const nameWidth = Math.max(18, width - contextWidth - reasoningWidth - 5);
  const values = rowValues(row, state);
  const cursor = row.selected ? ">" : " ";
  const current = row.current ? "✓" : " ";
  return selectedLine(
    `${cursor}${current} ${pad(row.name, nameWidth)} ${pad(values.context, contextWidth)} ${pad(values.reasoning, reasoningWidth)}`,
    row.selected,
    width,
    theme,
  );
}

function renderNarrowRow(row: PickerRow, state: ModelPickerState, width: number, theme: Theme): string[] {
  const values = rowValues(row, state);
  const cursor = row.selected ? ">" : " ";
  const current = row.current ? "✓" : " ";
  return [
    selectedLine(`${cursor}${current} ${row.name}`, row.selected, width, theme),
    selectedLine(`   Context ${values.context}   Reasoning ${values.reasoning}`, row.selected, width, theme),
  ];
}

export function renderProviderPicker(
  state: ListSelection<string>,
  currentProvider: string | undefined,
  widthInput: number,
  theme: Theme,
  viewportHeight = Number.POSITIVE_INFINITY,
): string[] {
  const width = normalizedWidth(widthInput);
  const maxRows = Number.isFinite(viewportHeight)
    ? Math.max(1, Math.floor(viewportHeight) - 4)
    : state.items.length;
  const start = Math.max(0, Math.min(
    state.selectedIndex - Math.floor(maxRows / 2),
    state.items.length - maxRows,
  ));
  const visible = state.items.slice(start, start + maxRows);
  return [
    clip(theme.fg("accent", theme.bold("Select provider")), width),
    "",
    ...visible.map((provider, offset) => {
      const index = start + offset;
      const cursor = index === state.selectedIndex ? ">" : " ";
      const current = provider === currentProvider ? "✓" : " ";
      return selectedLine(`${cursor} ${current} ${provider}`, index === state.selectedIndex, width, theme);
    }),
    "",
    clip(theme.fg("dim", responsiveText(
      "↑↓ select • enter continue • esc close",
      "↑↓ • enter • esc",
      width,
    )), width),
  ];
}

export function renderModelPicker(
  state: ModelPickerState,
  provider: string,
  canGoBack: boolean,
  widthInput: number,
  theme: Theme,
  viewportHeight = Number.POSITIVE_INFINITY,
): string[] {
  const width = normalizedWidth(widthInput);
  const narrow = width < WIDE_BREAKPOINT;
  const defaultRows = narrow ? NARROW_VISIBLE_ROWS : WIDE_VISIBLE_ROWS;
  const heightRows = Number.isFinite(viewportHeight)
    ? narrow
      ? Math.max(1, Math.floor((viewportHeight - 4) / 2))
      : Math.max(1, Math.floor(viewportHeight) - 5)
    : defaultRows;
  const view = state.rows(Math.min(defaultRows, heightRows));
  const title = `${provider} models  ${state.selectedIndex + 1}/${state.size}`;
  const lines: string[] = [clip(theme.fg("accent", theme.bold(title)), width), ""];

  if (narrow) {
    for (const row of view.rows) lines.push(...renderNarrowRow(row, state, width, theme));
  } else {
    const contextWidth = 15;
    const reasoningWidth = 15;
    const nameWidth = Math.max(18, width - contextWidth - reasoningWidth - 5);
    lines.push(clip(theme.fg("dim", `  ${pad("Model", nameWidth)} ${pad("Context", contextWidth)} ${pad("Reasoning", reasoningWidth)}`), width));
    for (const row of view.rows) lines.push(renderWideRow(row, state, width, theme));
  }

  const help = `↑↓ model • tab field • ←→ change • enter select • esc ${canGoBack ? "back" : "close"}`;
  lines.push(
    "",
    clip(theme.fg("dim", responsiveText(help, "↑↓ • tab • ←→ • enter • esc", width)), width),
  );
  return lines;
}

interface RenderCache {
  width: number;
  height: number;
  revision: number;
  lines: string[];
}

export class ProviderPickerRenderer {
  private cache?: RenderCache;

  render(
    state: ListSelection<string>,
    currentProvider: string | undefined,
    width: number,
    theme: Theme,
    viewportHeight = Number.POSITIVE_INFINITY,
  ): string[] {
    const normalized = normalizedWidth(width);
    const height = Math.max(1, Math.floor(viewportHeight));
    if (this.cache?.width === normalized && this.cache.height === height && this.cache.revision === state.revision) return this.cache.lines;
    const lines = renderProviderPicker(state, currentProvider, normalized, theme, height);
    this.cache = { width: normalized, height, revision: state.revision, lines };
    return lines;
  }

  invalidate(): void { this.cache = undefined; }
}

export class ModelPickerRenderer {
  private cache?: RenderCache;

  constructor(
    private readonly provider: string,
    private readonly canGoBack: boolean,
  ) {}

  render(
    state: ModelPickerState,
    width: number,
    theme: Theme,
    viewportHeight = Number.POSITIVE_INFINITY,
  ): string[] {
    const normalized = normalizedWidth(width);
    const height = Math.max(1, Math.floor(viewportHeight));
    if (this.cache?.width === normalized && this.cache.height === height && this.cache.revision === state.revision) return this.cache.lines;
    const lines = renderModelPicker(state, this.provider, this.canGoBack, normalized, theme, height);
    this.cache = { width: normalized, height, revision: state.revision, lines };
    return lines;
  }

  invalidate(): void { this.cache = undefined; }
}

export const MODEL_PICKER_WIDE_BREAKPOINT = WIDE_BREAKPOINT;
