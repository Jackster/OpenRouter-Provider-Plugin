import assert from "node:assert/strict"
import test from "node:test"
import { applySelection } from "../src/routing.ts"

const selection = { modelID: "openai/gpt-5", provider: "azure", providerName: "Azure", selectedAt: 1 }

test("hard-pins a provider and disables fallback", () => {
  const options: Record<string, any> = { temperature: 0.2 }
  applySelection(options, selection)
  assert.equal(options.temperature, 0.2)
  assert.deepEqual(options.provider.order, ["azure"])
  assert.deepEqual(options.provider.only, ["azure"])
  assert.equal(options.provider.allow_fallbacks, false)
})

test("preserves unrelated preferences and removes a conflicting ignore", () => {
  const options: Record<string, any> = {
    provider: { data_collection: "deny", ignore: ["azure", "openai"], allow_fallbacks: true },
  }
  applySelection(options, selection)
  assert.equal(options.provider.data_collection, "deny")
  assert.deepEqual(options.provider.ignore, ["openai"])
  assert.equal(options.provider.allow_fallbacks, false)
})
