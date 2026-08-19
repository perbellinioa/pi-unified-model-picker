import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { ListSelection, ModelPickerState, type PickerRow } from "./picker-state.js";

const WIDE_BREAKPOINT = 78;
const MIN_WIDTH = 24;
const MODEL_WIDE_ROWS = 15;
const MODEL_NARROW_ROWS = 8;
const PROVIDER_ROWS = 12;
const PREFIX_WIDTH = 3;
const CONTEXT_WIDTH = 15;
const REASONING_WIDTH = 15;

export interface ProviderOption {
  id: string;
  label: string;
}

export interface PickerHints {
  upDown: string;
  page: string;
  tab: string;
  leftRight: string;
  confirm: string;
  cancel: string;
}

const DEFAULT_HINTS: PickerHints = {
  upDown: "↑↓",
  page: "PgUp/PgDn",
  tab: "tab",
  leftRight: "←→",
  confirm: "enter",
  cancel: "esc",
};

interface WideColumns {
  name: number;
  context: number;
  reasoning: number;
}

function wideColumns(width: number): WideColumns {
  return {
    name: Math.max(18, width - PREFIX_WIDTH - CONTEXT_WIDTH - REASONING_WIDTH - 2),
    context: CONTEXT_WIDTH,
    reasoning: REASONING_WIDTH,
  };
}

function normalizedWidth(width: number): number {
  return Math.max(1, Math.floor(width));
}

function normalizedHeight(height: number): number {
  return Math.max(1, Math.floor(height));
}

function clip(text: string, width: number): string {
  return truncateToWidth(text, normalizedWidth(width));
}

function pad(text: string, width: number): string {
  return truncateToWidth(text, Math.max(0, width), "...", true);
}

function responsiveText(full: string, compact: string, width: number): string {
  return visibleWidth(full) <= width ? full : compact;
}

function adjustable(value: string, active: boolean, available: boolean): string {
  return active && available ? `← ${value} →` : value;
}

function selectedLine(line: string, selected: boolean, width: number, theme: Theme): string {
  const clipped = clip(line, width);
  if (!selected) return clipped;
  const background = typeof theme.getBgAnsi === "function" ? theme.getBgAnsi("selectedBg") : "";
  const repaired = background ? clipped.replaceAll("\u001b[0m", `\u001b[0m${background}`) : clipped;
  const padded = repaired + " ".repeat(Math.max(0, width - visibleWidth(repaired)));
  return theme.bg("selectedBg", padded);
}

function smallViewport(width: number, height: number, theme: Theme): string[] {
  return [
    clip(theme.fg("warning", "Terminal too small"), width),
    clip(theme.fg("dim", "Resize to continue"), width),
  ].slice(0, height);
}

function rowValues(row: PickerRow, state: ModelPickerState): { context: string; reasoning: string } {
  return {
    context: adjustable(row.context, row.selected && state.field === "context", row.contextAdjustable),
    reasoning: adjustable(row.reasoning, row.selected && state.field === "reasoning", row.reasoningAdjustable),
  };
}

function renderWideRow(row: PickerRow, state: ModelPickerState, width: number, theme: Theme): string {
  const columns = wideColumns(width);
  const values = rowValues(row, state);
  const cursor = row.selected ? ">" : " ";
  const current = row.current ? "✓" : " ";
  return selectedLine(
    `${cursor}${current} ${pad(row.name, columns.name)} ${pad(values.context, columns.context)} ${pad(values.reasoning, columns.reasoning)}`,
    row.selected,
    width,
    theme,
  );
}

function renderNarrowRow(row: PickerRow, state: ModelPickerState, width: number, theme: Theme): string[] {
  const values = rowValues(row, state);
  const cursor = row.selected ? ">" : " ";
  const current = row.current ? "✓" : " ";
  const contextColor = row.selected && state.field === "context" ? "accent" : "muted";
  const reasoningColor = row.selected && state.field === "reasoning" ? "accent" : "muted";
  const details = [
    theme.fg("dim", "   Context "),
    theme.fg(contextColor, values.context),
    theme.fg("dim", "   Reasoning "),
    theme.fg(reasoningColor, values.reasoning),
  ].join("");
  return [
    selectedLine(`${cursor}${current} ${row.name}`, row.selected, width, theme),
    selectedLine(details, row.selected, width, theme),
  ];
}

export function providerPageSize(viewportHeight: number): number {
  return Math.max(1, Math.min(PROVIDER_ROWS, normalizedHeight(viewportHeight) - 4));
}

export function modelPageSize(width: number, viewportHeight: number): number {
  const narrow = normalizedWidth(width) < WIDE_BREAKPOINT;
  const available = narrow
    ? Math.floor((normalizedHeight(viewportHeight) - 4) / 2)
    : normalizedHeight(viewportHeight) - 5;
  return Math.max(1, Math.min(narrow ? MODEL_NARROW_ROWS : MODEL_WIDE_ROWS, available));
}

export function renderProviderPicker(
  state: ListSelection<ProviderOption>,
  currentProvider: string | undefined,
  widthInput: number,
  theme: Theme,
  viewportHeight = Number.POSITIVE_INFINITY,
  hints: PickerHints = DEFAULT_HINTS,
): string[] {
  const width = normalizedWidth(widthInput);
  const height = normalizedHeight(viewportHeight);
  if (width < MIN_WIDTH || height < 5) return smallViewport(width, height, theme);
  const maxRows = Number.isFinite(viewportHeight) ? providerPageSize(height) : Math.min(PROVIDER_ROWS, state.items.length);
  const start = Math.max(0, Math.min(
    state.selectedIndex - Math.floor(maxRows / 2),
    state.items.length - maxRows,
  ));
  const visible = state.items.slice(start, start + maxRows);
  return [
    clip(theme.fg("accent", theme.bold(`Select provider  ${state.selectedIndex + 1}/${state.items.length}`)), width),
    "",
    ...visible.map((provider, offset) => {
      const index = start + offset;
      const cursor = index === state.selectedIndex ? ">" : " ";
      const current = provider.id === currentProvider ? "✓" : " ";
      return selectedLine(`${cursor} ${current} ${provider.label}`, index === state.selectedIndex, width, theme);
    }),
    "",
    clip(theme.fg("dim", responsiveText(
      `${hints.upDown} select • ${hints.page} page • ${hints.confirm} continue • ${hints.cancel} close`,
      `${hints.upDown} • ${hints.confirm} • ${hints.cancel}`,
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
  hints: PickerHints = DEFAULT_HINTS,
): string[] {
  const width = normalizedWidth(widthInput);
  const height = normalizedHeight(viewportHeight);
  if (width < MIN_WIDTH || height < 6) return smallViewport(width, height, theme);
  const narrow = width < WIDE_BREAKPOINT;
  const visibleRows = Number.isFinite(viewportHeight)
    ? modelPageSize(width, height)
    : narrow ? MODEL_NARROW_ROWS : MODEL_WIDE_ROWS;
  const view = state.window(visibleRows);
  const title = `${provider} models  ${state.selectedIndex + 1}/${state.size}`;
  const lines: string[] = [clip(theme.fg("accent", theme.bold(title)), width), ""];

  if (narrow) {
    for (const row of view.rows) lines.push(...renderNarrowRow(row, state, width, theme));
  } else {
    const columns = wideColumns(width);
    lines.push(theme.fg("dim", [
      " ".repeat(PREFIX_WIDTH),
      pad("Model", columns.name),
      " ",
      pad("Context", columns.context),
      " ",
      pad("Reasoning", columns.reasoning),
    ].join("")));
    for (const row of view.rows) lines.push(renderWideRow(row, state, width, theme));
  }

  const help = [
    `${hints.upDown} model`,
    `${hints.page} page`,
    `${hints.tab} field`,
    `${hints.leftRight} change`,
    `${hints.confirm} select`,
    `${hints.cancel} ${canGoBack ? "back" : "close"}`,
  ].join(" • ");
  lines.push(
    "",
    clip(theme.fg("dim", responsiveText(
      help,
      `${hints.upDown} • ${hints.tab} • ${hints.leftRight} • ${hints.confirm} • ${hints.cancel}`,
      width,
    )), width),
  );
  return lines;
}

interface RenderCache {
  width: number;
  height: number;
  revision: number;
  context: string;
  lines: string[];
}

export class ProviderPickerRenderer {
  private cache?: RenderCache;

  constructor(private readonly hints: PickerHints = DEFAULT_HINTS) {}

  render(
    state: ListSelection<ProviderOption>,
    currentProvider: string | undefined,
    width: number,
    theme: Theme,
    viewportHeight = Number.POSITIVE_INFINITY,
  ): string[] {
    const normalized = normalizedWidth(width);
    const height = normalizedHeight(viewportHeight);
    const context = currentProvider ?? "";
    if (
      this.cache?.width === normalized &&
      this.cache.height === height &&
      this.cache.revision === state.revision &&
      this.cache.context === context
    ) return this.cache.lines;
    const lines = renderProviderPicker(state, currentProvider, normalized, theme, height, this.hints);
    this.cache = { width: normalized, height, revision: state.revision, context, lines };
    return lines;
  }

  invalidate(): void { this.cache = undefined; }
}

export class ModelPickerRenderer {
  private cache?: RenderCache;

  constructor(
    private readonly provider: string,
    private readonly canGoBack: boolean,
    private readonly hints: PickerHints = DEFAULT_HINTS,
  ) {}

  render(
    state: ModelPickerState,
    width: number,
    theme: Theme,
    viewportHeight = Number.POSITIVE_INFINITY,
  ): string[] {
    const normalized = normalizedWidth(width);
    const height = normalizedHeight(viewportHeight);
    if (
      this.cache?.width === normalized &&
      this.cache.height === height &&
      this.cache.revision === state.revision
    ) return this.cache.lines;
    const lines = renderModelPicker(
      state,
      this.provider,
      this.canGoBack,
      normalized,
      theme,
      height,
      this.hints,
    );
    this.cache = { width: normalized, height, revision: state.revision, context: "", lines };
    return lines;
  }

  invalidate(): void { this.cache = undefined; }
}

export const MODEL_PICKER_WIDE_BREAKPOINT = WIDE_BREAKPOINT;
export const MODEL_PICKER_MIN_WIDTH = MIN_WIDTH;
