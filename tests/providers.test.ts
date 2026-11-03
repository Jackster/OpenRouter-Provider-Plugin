import assert from "node:assert/strict"
import test from "node:test"
import { nextProviderSort, priceExtreme, priceExtremes, sortProviders } from "../src/providers.ts"
import type { ProviderSort } from "../src/providers.ts"
import type { ProviderInfo } from "../src/types.ts"

const provider = (name: string, values: Partial<ProviderInfo> = {}): ProviderInfo => ({
  slug: name.toLowerCase(),
  name,
  endpointTag: name.toLowerCase(),
  variantCount: 1,
  ...values,
})

const providers = [
  provider("A", { promptPrice: "1", completionPrice: "9", latency: 300, throughput: 10 }),
  provider("B", { promptPrice: "2", completionPrice: "3", cacheReadPrice: "0.2", latency: 100, throughput: 30 }),
  provider("C", { promptPrice: "3", completionPrice: "6", cacheReadPrice: "0.1", latency: 200, throughput: 20 }),
]

const names = (sort: ProviderSort) => sortProviders(providers, sort).map((item) => item.name)

test("sorts by every price and performance option without mutating the normal list", () => {
  const original = providers.map((item) => item.name)
  assert.deepEqual(names("name"), ["A", "B", "C"])
  assert.deepEqual(names("input-asc"), ["A", "B", "C"])
  assert.deepEqual(names("input-desc"), ["C", "B", "A"])
  assert.deepEqual(names("output-asc"), ["B", "C", "A"])
  assert.deepEqual(names("output-desc"), ["A", "C", "B"])
  assert.deepEqual(names("cache-asc"), ["C", "B", "A"])
  assert.deepEqual(names("cache-desc"), ["B", "C", "A"])
  assert.deepEqual(names("latency-asc"), ["B", "C", "A"])
  assert.deepEqual(names("throughput-desc"), ["B", "C", "A"])
  assert.deepEqual(providers.map((item) => item.name), original)
})

test("keeps missing values last in both sort directions", () => {
  const items = [provider("Missing"), ...providers]
  assert.equal(sortProviders(items, "input-asc").at(-1)?.name, "Missing")
  assert.equal(sortProviders(items, "input-desc").at(-1)?.name, "Missing")
  assert.equal(sortProviders(items, "latency-asc").at(-1)?.name, "Missing")
  assert.equal(sortProviders(items, "throughput-desc").at(-1)?.name, "Missing")
})

test("marks cheapest and most expensive prices independently", () => {
  const extremes = priceExtremes(providers)
  assert.equal(priceExtreme(providers[0], "promptPrice", extremes), "cheapest")
  assert.equal(priceExtreme(providers[2], "promptPrice", extremes), "most-expensive")
  assert.equal(priceExtreme(providers[1], "promptPrice", extremes), undefined)
  assert.equal(priceExtreme(providers[1], "completionPrice", extremes), "cheapest")
  assert.equal(priceExtreme(providers[0], "completionPrice", extremes), "most-expensive")
  assert.equal(priceExtreme(providers[2], "cacheReadPrice", extremes), "cheapest")
  assert.equal(priceExtreme(providers[1], "cacheReadPrice", extremes), "most-expensive")
  assert.equal(priceExtreme(providers[0], "cacheReadPrice", extremes), undefined)
})

test("does not highlight equal or unavailable prices", () => {
  const items = [provider("A", { promptPrice: "1" }), provider("B", { promptPrice: "1" })]
  const extremes = priceExtremes(items)
  assert.equal(priceExtreme(items[0], "promptPrice", extremes), undefined)
  assert.equal(priceExtreme(items[1], "promptPrice", extremes), undefined)
  assert.equal(priceExtreme(items[0], "cacheReadPrice", extremes), undefined)
})

test("cycles through all sorting options and back to provider name", () => {
  let sort: ProviderSort = "name"
  for (let index = 0; index < 8; index++) sort = nextProviderSort(sort)
  assert.equal(sort, "throughput-desc")
  assert.equal(nextProviderSort(sort), "name")
})
