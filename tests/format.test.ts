import assert from "node:assert/strict"
import test from "node:test"
import { cacheLine, formatLatency, formatPrice, formatThroughput, formatUptime, metricsLine, priceLine } from "../src/format.ts"

test("formats prices per million tokens", () => {
  assert.equal(formatPrice("0.00000125"), "$1.25")
  assert.equal(formatPrice("0.00000017"), "$0.17")
  assert.equal(formatPrice("0.000000017"), "$0.017")
  assert.equal(formatPrice("0.00000000441"), "$0.00441")
  assert.equal(formatPrice("0"), "$0")
  assert.equal(formatPrice(undefined), "—")
})

test("labels input, output, and cache-read prices", () => {
  const provider = {
    slug: "x", name: "X", endpointTag: "x", variantCount: 1,
    promptPrice: "0.000001", completionPrice: "0.000002", cacheReadPrice: "0.0000001",
  }
  assert.equal(priceLine(provider), "In $1.00 · Out $2.00 /M")
  assert.equal(cacheLine(provider), "Cache read $0.10 /M")
})

test("formats missing metrics distinctly from zero", () => {
  assert.equal(formatThroughput(null), "—")
  assert.equal(formatThroughput(0), "0.0 t/s")
  assert.equal(formatThroughput(71.2), "71 t/s")
  assert.equal(formatUptime(100), "100%")
  assert.equal(formatUptime(null), "—")
})

test("handles fractional-second and millisecond latency wire formats", () => {
  assert.equal(formatLatency(681), "681ms")
  assert.equal(formatLatency(1280), "1.28s")
  assert.equal(formatLatency(1.2), "1.20s")
})

test("labels the one-day uptime fallback without empty metrics", () => {
  assert.equal(metricsLine({ slug: "x", name: "X", endpointTag: "x", variantCount: 1, uptime1d: 99.95 }), "100.0% up 1d")
  assert.equal(metricsLine({ slug: "x", name: "X", endpointTag: "x", variantCount: 1 }), "Metrics unavailable")
  assert.equal(metricsLine({
    slug: "x", name: "X", endpointTag: "x", variantCount: 1,
    throughput: Number.NaN, latency: -1, uptime30m: Number.NaN,
  }), "Metrics unavailable")
})
