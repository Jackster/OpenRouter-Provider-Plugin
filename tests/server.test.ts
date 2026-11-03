import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { setup } from "../src/server.ts"
import { readState, selectProvider } from "../src/state.ts"

test("final OpenCode request hook hard-pins the selected provider", async () => {
  const directory = mkdtempSync(join(process.cwd(), ".test-tmp-"))
  const path = join(directory, "state.json")
  const previous = process.env.OPENCODE_OPENROUTER_STATE_PATH
  process.env.OPENCODE_OPENROUTER_STATE_PATH = path
  try {
    selectProvider("liquid/lfm-2.5-2.6b:free", "liquid", "Liquid", path)
    const hooks = new Map<string, (input: any) => void | Promise<void>>()
    const cleanup = await setup({
      session: {
        hook: async (name: string, callback: (input: any) => void | Promise<void>) => {
          hooks.set(name, callback)
        },
      },
    } as any)

    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "liquid/lfm-2.5-2.6b:free",
        provider: { data_collection: "deny", ignore: ["liquid", "other"] },
      }),
    })
    const input = {
      sessionID: "session-test",
      model: { providerID: "openrouter", id: "liquid/lfm-2.5-2.6b:free" },
      request,
    }
    await hooks.get("http.request")?.(input)
    assert.notEqual(input.request, request)
    const body = await input.request.json()
    assert.deepEqual(body.provider, {
      data_collection: "deny",
      ignore: ["other"],
      order: ["liquid"],
      only: ["liquid"],
      allow_fallbacks: false,
    })

    await hooks.get("context")?.({
      sessionID: "session-test",
      model: { providerID: "openrouter", id: "liquid/lfm-2.5-2.6b:free" },
    })
    assert.equal(readState(path).sessions["session-test"]?.modelID, "liquid/lfm-2.5-2.6b:free")

    const automaticRequest = input.request
    const automatic = { ...input, model: { providerID: "openrouter", id: "openai/gpt-5" } }
    await hooks.get("http.request")?.(automatic)
    assert.equal(automatic.request, automaticRequest)
    await cleanup?.()
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_OPENROUTER_STATE_PATH
    else process.env.OPENCODE_OPENROUTER_STATE_PATH = previous
    rmSync(directory, { recursive: true, force: true })
  }
})
