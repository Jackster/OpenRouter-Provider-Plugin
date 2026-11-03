export interface EndpointPricing {
  prompt?: string | null
  completion?: string | null
  input_cache_read?: string | null
  discount?: number
}

export interface PercentileMetric {
  p50?: number
  p75?: number
  p90?: number
  p99?: number
}

export interface OpenRouterEndpoint {
  name: string
  provider_name: string
  tag: string
  status?: number
  service_tier?: string | null
  quantization?: string | null
  pricing: EndpointPricing
  uptime_last_30m?: number | null
  uptime_last_1d?: number | null
  latency_last_30m?: number | PercentileMetric | null
  throughput_last_30m?: number | PercentileMetric | null
}

export interface ProviderInfo {
  slug: string
  name: string
  endpointTag: string
  variantCount: number
  status?: number
  quantization?: string | null
  promptPrice?: string
  completionPrice?: string
  cacheReadPrice?: string
  uptime30m?: number | null
  uptime1d?: number | null
  latency?: number | null
  throughput?: number | null
}

export interface ProviderSelection {
  modelID: string
  provider: string
  providerName: string
  selectedAt: number
}

export interface SessionModel {
  providerID: string
  modelID: string
  updatedAt: number
}

export interface SharedState {
  version: 1
  selections: Record<string, ProviderSelection>
  sessions: Record<string, SessionModel>
}
