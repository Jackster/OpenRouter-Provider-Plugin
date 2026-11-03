import assert from "node:assert/strict"
import test from "node:test"
import { endpointUrl, isOpenRouterModel, normalizeModelID, shortModelID } from "../src/model.ts"

test("normalizes OpenCode and routing model variants", () => {
  assert.equal(normalizeModelID("openrouter/~anthropic/claude-sonnet-latest"), "anthropic/claude-sonnet-latest")
  assert.equal(normalizeModelID("openai/gpt-5:nitro"), "openai/gpt-5")
  assert.equal(normalizeModelID("google/gemini-2.5-flash:floor"), "google/gemini-2.5-flash")
  assert.equal(normalizeModelID("google/gemma-3-4b-it:free"), "google/gemma-3-4b-it:free")
  assert.equal(isOpenRouterModel("openrouter", "openai/gpt-5"), true)
  assert.equal(isOpenRouterModel("anthropic", "claude-sonnet"), false)
})

test("builds an encoded endpoint URL", () => {
  assert.equal(
    endpointUrl("openrouter/openai/gpt-5"),
    "https://openrouter.ai/api/v1/models/openai/gpt-5/endpoints",
  )
  assert.equal(
    endpointUrl("google/gemma-3-4b-it:free"),
    "https://openrouter.ai/api/v1/models/google/gemma-3-4b-it%3Afree/endpoints",
  )
  assert.throws(() => endpointUrl("invalid"))
})

test("shortens long model names without dropping the model suffix", () => {
  const short = shortModelID("anthropic/claude-sonnet-very-long-name", 25)
  assert.equal(short.length, 25)
  assert.ok(short.startsWith("anthropic/"))
  assert.ok(short.endsWith("long-name"))
})
