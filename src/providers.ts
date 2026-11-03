import type { ProviderInfo } from "./types.ts"

export type ProviderSort =
  | "name"
  | "input-asc"
  | "input-desc"
  | "output-asc"
  | "output-desc"
  | "cache-asc"
  | "cache-desc"
  | "latency-asc"
  | "throughput-desc"

export type PriceKey = "promptPrice" | "completionPrice" | "cacheReadPrice"
export type PriceExtreme = "cheapest" | "most-expensive" | undefined

export const providerSortOptions: ReadonlyArray<{ value: ProviderSort; label: string }> = [
  { value: "name", label: "Provider name" },
  { value: "input-asc", label: "Cheapest input" },
  { value: "input-desc", label: "Most expensive input" },
  { value: "output-asc", label: "Cheapest output" },
  { value: "output-desc", label: "Most expensive output" },
  { value: "cache-asc", label: "Cheapest cache" },
  { value: "cache-desc", label: "Most expensive cache" },
  { value: "latency-asc", label: "Lowest latency" },
  { value: "throughput-desc", label: "Highest TPS" },
]

export function providerSortLabel(sort: ProviderSort): string {
  return providerSortOptions.find((option) => option.value === sort)?.label ?? providerSortOptions[0].label
}

export function nextProviderSort(sort: ProviderSort): ProviderSort {
  const index = providerSortOptions.findIndex((option) => option.value === sort)
  return providerSortOptions[(index + 1 + providerSortOptions.length) % providerSortOptions.length].value
}

function numeric(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  const result = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value)
  return Number.isFinite(result) ? result : undefined
}

const sortKey: Record<Exclude<ProviderSort, "name">, { key: keyof ProviderInfo; direction: 1 | -1 }> = {
  "input-asc": { key: "promptPrice", direction: 1 },
  "input-desc": { key: "promptPrice", direction: -1 },
  "output-asc": { key: "completionPrice", direction: 1 },
  "output-desc": { key: "completionPrice", direction: -1 },
  "cache-asc": { key: "cacheReadPrice", direction: 1 },
  "cache-desc": { key: "cacheReadPrice", direction: -1 },
  "latency-asc": { key: "latency", direction: 1 },
  "throughput-desc": { key: "throughput", direction: -1 },
}

export function sortProviders(providers: ProviderInfo[], sort: ProviderSort): ProviderInfo[] {
  const result = [...providers]
  if (sort === "name") return result.sort((a, b) => a.name.localeCompare(b.name))
  const { key, direction } = sortKey[sort]
  return result.sort((a, b) => {
    const left = numeric(a[key] as string | number | null | undefined)
    const right = numeric(b[key] as string | number | null | undefined)
    if (left === undefined && right === undefined) return a.name.localeCompare(b.name)
    if (left === undefined) return 1
    if (right === undefined) return -1
    return (left - right) * direction || a.name.localeCompare(b.name)
  })
}

export type PriceExtremes = Record<PriceKey, { min?: number; max?: number }>

export function priceExtremes(providers: ProviderInfo[]): PriceExtremes {
  const result: PriceExtremes = { promptPrice: {}, completionPrice: {}, cacheReadPrice: {} }
  for (const key of Object.keys(result) as PriceKey[]) {
    const values = providers.map((provider) => numeric(provider[key])).filter((value): value is number => value !== undefined)
    if (values.length === 0) continue
    result[key] = { min: Math.min(...values), max: Math.max(...values) }
  }
  return result
}

export function priceExtreme(provider: ProviderInfo, key: PriceKey, extremes: PriceExtremes): PriceExtreme {
  const value = numeric(provider[key])
  const { min, max } = extremes[key]
  if (value === undefined || min === undefined || max === undefined || min === max) return undefined
  if (value === min) return "cheapest"
  if (value === max) return "most-expensive"
  return undefined
}
