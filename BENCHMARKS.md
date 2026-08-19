# Benchmarks

Measured on 2026-08-19 under WSL2 Linux x86_64 with Node.js 24.19.0. Results are machine-specific; run `npm run benchmark` for local numbers.

The benchmark uses 250 models and 20,000 120-cell frames. Values below are medians from three sequential `npm run benchmark` executions; each command emits one independently reproducible sample.

| Path | Per frame |
| --- | ---: |
| Cached, unchanged frame | 0.097 µs |
| Uncached pure render | 186.359 µs |
| Navigation + cached renderer | 224.627 µs |

The cache key is terminal width, terminal height, and state revision. Theme invalidation clears the cache explicitly. The interactive result includes changing the selected model, deriving the visible rows, formatting, and rendering.

These are observability baselines, not hard CI thresholds; timing assertions are intentionally avoided because shared CI runners are noisy. Correctness and width invariants are enforced separately by tests.
