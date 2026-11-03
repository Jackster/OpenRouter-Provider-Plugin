import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { setup } from "../src/server.ts"
import { getSelection } from "../src/state.ts"

test("Desktop RPC lists, selects, and clears providers using shared state", async () => {
  const directory = mkdtempSync(join(process.cwd(), ".test-tmp-"))
  const path = join(directory, "state.json")
  const previousPath = process.env.OPENCODE_OPENROUTER_STATE_PATH
  const previousFetch = globalThis.fetch
  process.env.OPENCODE_OPENROUTER_STATE_PATH = path
  let authorization = ""
  globalThis.fetch = async (_url, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? ""
    return Response.json({ data: { endpoints: [{
      name: "Liquid | LFM",
      provider_name: "Liquid",
      tag: "liquid",
      status: 0,
      pricing: { prompt: "0.000001", completion: "0.000002", input_cache_read: "0.0000001" },
      uptime_last_30m: 100,
      latency_last_30m: 0.2,
      throughput_last_30m: 25,
    }] } })
  }

  try {
    let handlers: Record<string, (input: unknown) => Promise<any>> | undefined
    const cleanup = await setup({
      rpc: {
        register: async (_contract: unknown, value: typeof handlers) => { handlers = value },
      },
      session: { hook: async () => {} },
    } as any)
    assert.ok(handlers)

    const initial = await handlers.providers({ modelID: "openrouter/liquid/lfm:free", apiKey: "temporary-key" })
    assert.equal(authorization, "Bearer temporary-key")
    assert.equal(initial.selected, null)
    assert.equal(initial.providers[0].slug, "liquid")
    assert.equal(initial.providers[0].cacheReadPrice, "0.0000001")

    assert.deepEqual(await handlers.select({ modelID: "liquid/lfm:free", provider: "liquid", providerName: "Liquid" }), { selected: "liquid" })
    assert.equal(getSelection("liquid/lfm:free", path)?.providerName, "Liquid")
    const selected = await handlers.providers({ modelID: "liquid/lfm:free" })
    assert.equal(selected.selected, "liquid")

    assert.deepEqual(await handlers.clear({ modelID: "liquid/lfm:free" }), { selected: null })
    assert.equal(getSelection("liquid/lfm:free", path), undefined)
    await cleanup?.()
  } finally {
    globalThis.fetch = previousFetch
    if (previousPath === undefined) delete process.env.OPENCODE_OPENROUTER_STATE_PATH
    else process.env.OPENCODE_OPENROUTER_STATE_PATH = previousPath
    rmSync(directory, { recursive: true, force: true })
  }
})

test("Desktop RPC resolves the most recent OpenRouter model when none is given", async () => {
  const directory = mkdtempSync(join(process.cwd(), ".test-tmp-"))
  const path = join(directory, "state.json")
  const previousPath = process.env.OPENCODE_OPENROUTER_STATE_PATH
  const previousFetch = globalThis.fetch
  process.env.OPENCODE_OPENROUTER_STATE_PATH = path
  let requested = ""
  globalThis.fetch = async (url) => {
    requested = String(url)
    return Response.json({ data: { endpoints: [] } })
  }

  try {
    let handlers: Record<string, (input: unknown) => Promise<any>> | undefined
    const cleanup = await setup({
      rpc: {
        register: async (_contract: unknown, value: typeof handlers) => { handlers = value },
      },
      session: { hook: async () => {} },
    } as any)
    assert.ok(handlers)

    // Nothing remembered yet: no fetch, empty result, null model.
    const empty = await handlers.providers({})
    assert.deepEqual(empty, { modelID: null, providers: [], selected: null })
    assert.equal(requested, "")

    // A remembered session model drives the lookup when the composer has none.
    const { rememberSessionModel } = await import("../src/state.ts")
    rememberSessionModel("session-1", "openrouter", "liquid/lfm", path)
    const resolved = await handlers.providers({})
    assert.equal(resolved.modelID, "liquid/lfm")
    assert.ok(requested.includes("/models/liquid/lfm/endpoints"))
    await cleanup?.()
  } finally {
    globalThis.fetch = previousFetch
    if (previousPath === undefined) delete process.env.OPENCODE_OPENROUTER_STATE_PATH
    else process.env.OPENCODE_OPENROUTER_STATE_PATH = previousPath
    rmSync(directory, { recursive: true, force: true })
  }
})
