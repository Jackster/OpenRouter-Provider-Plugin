import type { ProviderInfo } from "./types.ts"

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

export function formatPrice(value?: string): string {
  if (value === undefined || value === "") return "—"
  const perMillion = Number(value) * 1_000_000
  if (!Number.isFinite(perMillion)) return "—"
  if (perMillion === 0) return "$0"
  if (perMillion < 1) {
    const trimmed = perMillion.toFixed(perMillion < 0.01 ? 5 : 3).replace(/0+$/, "").replace(/\.$/, "")
    const formatted = perMillion >= 0.01 ? trimmed.replace(/(\.\d)$/, (match) => `${match}0`) : trimmed
    return `$${formatted}`
  }
  return `$${perMillion.toFixed(2)}`
}

export function formatThroughput(value?: number | null): string {
  if (!finite(value) || value < 0) return "—"
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} t/s`
}

/** OpenRouter has emitted both fractional seconds and integer milliseconds. */
export function formatLatency(value?: number | null): string {
  if (!finite(value) || value < 0) return "—"
  const seconds = value > 100 ? value / 1000 : value
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`
}

export function formatUptime(value?: number | null): string {
  if (!finite(value)) return "—"
  return `${value.toFixed(value === 100 ? 0 : 1)}%`
}

export function priceLine(provider: ProviderInfo): string {
  return `In ${formatPrice(provider.promptPrice)} · Out ${formatPrice(provider.completionPrice)} /M`
}

export function cacheLine(provider: ProviderInfo): string {
  return `Cache read ${formatPrice(provider.cacheReadPrice)} /M`
}

export function metricsLine(provider: ProviderInfo): string {
  const uptime = provider.uptime30m ?? provider.uptime1d
  const window = provider.uptime30m == null && provider.uptime1d != null ? " 1d" : ""
  const values = [
    formatThroughput(provider.throughput),
    formatLatency(provider.latency),
    finite(uptime) ? `${formatUptime(uptime)} up${window}` : undefined,
  ].filter((value): value is string => value !== undefined && value !== "—")
  return values.length ? values.join(" · ") : "Metrics unavailable"
}
