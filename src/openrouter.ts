import { endpointUrl } from "./model.ts"
import type { OpenRouterEndpoint, ProviderInfo } from "./types.ts"

export function providerSlug(tag: string): string {
  return tag.split("/", 1)[0]
}

function representative(endpoints: OpenRouterEndpoint[], slug: string): OpenRouterEndpoint {
  return [...endpoints].sort((a, b) => {
    const score = (endpoint: OpenRouterEndpoint) => {
      let value = endpoint.tag === slug ? 0 : endpoint.service_tier == null || endpoint.service_tier === "default" ? 1 : 2
      if (endpoint.status !== undefined && endpoint.status !== 0) value += 10
      return value
    }
    return score(a) - score(b)
  })[0]
}

function firstMetric<K extends keyof OpenRouterEndpoint>(
  endpoints: OpenRouterEndpoint[],
  key: K,
): OpenRouterEndpoint[K] | undefined {
  return endpoints.find((endpoint) => endpoint[key] != null)?.[key]
}

/** Group region and service-tier endpoints into the provider slugs OpenRouter can route to. */
export function groupProviders(endpoints: OpenRouterEndpoint[]): ProviderInfo[] {
  const groups = new Map<string, OpenRouterEndpoint[]>()
  for (const endpoint of endpoints) {
    if (!endpoint || typeof endpoint.tag !== "string" || !endpoint.tag) continue
    const slug = providerSlug(endpoint.tag)
    const group = groups.get(slug) ?? []
    group.push(endpoint)
    groups.set(slug, group)
  }

  return [...groups.entries()].map(([slug, group]) => {
    const endpoint = representative(group, slug)
    const scalar = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) return value
      if (typeof value === "object" && value !== null && "p50" in value) {
        const p50 = value.p50
        if (typeof p50 === "number" && Number.isFinite(p50)) return p50
      }
      return undefined
    }
    const provider: ProviderInfo = {
      slug,
      name: endpoint.provider_name || endpoint.name.split("|", 1)[0].trim() || slug,
      endpointTag: endpoint.tag,
      variantCount: group.length,
      status: endpoint.status,
      quantization: endpoint.quantization,
      promptPrice: endpoint.pricing?.prompt ?? undefined,
      completionPrice: endpoint.pricing?.completion ?? undefined,
      cacheReadPrice: endpoint.pricing?.input_cache_read ?? undefined,
      uptime30m: endpoint.uptime_last_30m ?? firstMetric(group, "uptime_last_30m"),
      uptime1d: endpoint.uptime_last_1d ?? firstMetric(group, "uptime_last_1d"),
      latency: scalar(endpoint.latency_last_30m ?? firstMetric(group, "latency_last_30m")),
      throughput: scalar(endpoint.throughput_last_30m ?? firstMetric(group, "throughput_last_30m")),
    }
    // JSON-schema RPC validation treats present undefined properties as invalid.
    return Object.fromEntries(Object.entries(provider).filter(([, value]) => value !== undefined)) as ProviderInfo
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export interface FetchProvidersOptions {
  apiKey?: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export async function fetchProviders(modelID: string, options: FetchProvidersOptions = {}): Promise<ProviderInfo[]> {
  const request = options.fetchImpl ?? fetch
  const response = await request(endpointUrl(modelID, options.baseUrl), {
    headers: {
      Accept: "application/json",
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  })
  if (!response.ok) throw new Error(`OpenRouter endpoints API returned HTTP ${response.status}`)
  const payload = await response.json() as { data?: { endpoints?: OpenRouterEndpoint[] } }
  if (!Array.isArray(payload.data?.endpoints)) throw new Error("OpenRouter returned an invalid endpoints response")
  return groupProviders(payload.data.endpoints)
}
