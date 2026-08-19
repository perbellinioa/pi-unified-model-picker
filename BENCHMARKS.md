# Benchmarks

Measured on 2026-08-19 under WSL2 Linux x86_64 with Node.js 24.19.0. Results are machine-specific; run `npm run benchmark` for local numbers.

The benchmark uses 250 models and 20,000 120-cell frames. Values below are medians from three sequential runs.

| Path | Per frame |
| --- | ---: |
| Cached, unchanged frame | 0.058 µs |
| Uncached pure render | 119.839 µs |
| Navigation + cached renderer | 121.536 µs |

The cache key is terminal width, terminal height, and state revision. Theme invalidation clears the cache explicitly. The interactive result includes changing the selected model, deriving the visible rows, formatting, and rendering.

These are observability baselines, not hard CI thresholds; timing assertions are intentionally avoided because shared CI runners are noisy. Correctness and width invariants are enforced separately by tests.
