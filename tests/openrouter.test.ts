import assert from "node:assert/strict"
import test from "node:test"
import { fetchProviders, groupProviders, providerSlug } from "../src/openrouter.ts"
import type { OpenRouterEndpoint } from "../src/types.ts"

const endpoint = (values: Partial<OpenRouterEndpoint>): OpenRouterEndpoint => ({
  name: "Provider | model",
  provider_name: "Provider",
  tag: "provider",
  status: 0,
  pricing: { prompt: "0.000001", completion: "0.000002" },
  ...values,
})

test("extracts routable provider slugs", () => {
  assert.equal(providerSlug("azure/swedencentral"), "azure")
  assert.equal(providerSlug("anthropic"), "anthropic")
})

test("groups endpoint variants and preserves live metrics", () => {
  const providers = groupProviders([
    endpoint({ tag: "azure/global", provider_name: "Azure", pricing: { prompt: "0.000002", completion: "0.000004" } }),
    endpoint({
      tag: "azure", provider_name: "Azure", latency_last_30m: 800, throughput_last_30m: 42, uptime_last_30m: 99.9,
      pricing: { prompt: "0.000001", completion: "0.000002", input_cache_read: "0.00000000441" },
    }),
    endpoint({ tag: "google-ai-studio/flex", provider_name: "Google AI Studio", service_tier: "flex" }),
  ])
  assert.equal(providers.length, 2)
  const azure = providers.find((item) => item.slug === "azure")!
  assert.equal(azure.endpointTag, "azure")
  assert.equal(azure.variantCount, 2)
  assert.equal(azure.cacheReadPrice, "0.00000000441")
  assert.equal(azure.latency, 800)
  assert.equal(azure.throughput, 42)
  assert.equal(azure.uptime30m, 99.9)
  assert.equal(providers.find((item) => item.slug === "google-ai-studio")?.endpointTag, "google-ai-studio/flex")
})

test("normalizes unavailable null prices for the RPC contract", () => {
  const [provider] = groupProviders([endpoint({
    pricing: { prompt: null, completion: null, input_cache_read: null },
  })])
  assert.equal("promptPrice" in provider, false)
  assert.equal("completionPrice" in provider, false)
  assert.equal("cacheReadPrice" in provider, false)
})

test("uses p50 latency and throughput from percentile metrics", () => {
  const [provider] = groupProviders([endpoint({
    latency_last_30m: { p50: 289, p90: 917.4 },
    throughput_last_30m: { p50: 370, p90: 157 },
  })])
  assert.equal(provider.latency, 289)
  assert.equal(provider.throughput, 370)
})

test("fetches with the existing key without persisting it", async () => {
  let seenUrl = ""
  let seenAuth = ""
  const fetchImpl = async (input: any, init?: any) => {
    seenUrl = String(input)
    seenAuth = init?.headers?.Authorization
    return new Response(JSON.stringify({ data: { endpoints: [endpoint({})] } }), { status: 200 })
  }
  const providers = await fetchProviders("openai/gpt-5", { apiKey: "secret-test-key", fetchImpl: fetchImpl as typeof fetch })
  assert.equal(providers.length, 1)
  assert.ok(seenUrl.endsWith("/models/openai/gpt-5/endpoints"))
  assert.equal(seenAuth, "Bearer secret-test-key")
})

test("rejects unsuccessful endpoint responses", async () => {
  const fetchImpl = async () => new Response("no", { status: 503 })
  await assert.rejects(() => fetchProviders("openai/gpt-5", { fetchImpl: fetchImpl as typeof fetch }), /HTTP 503/)
})
