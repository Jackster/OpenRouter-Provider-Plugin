import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { clearProvider, getSelection, readState, rememberSessionModel, selectProvider } from "../src/state.ts"

test("persists per-model selections and remembers session models", () => {
  const directory = mkdtempSync(join(process.cwd(), ".test-tmp-"))
  const path = join(directory, "state.json")
  try {
    selectProvider("openrouter/openai/gpt-5:nitro", "openai", "OpenAI", path)
    assert.equal(getSelection("openai/gpt-5", path)?.provider, "openai")
    rememberSessionModel("session-1", "openrouter", "openai/gpt-5", path)
    assert.equal(readState(path).sessions["session-1"].modelID, "openai/gpt-5")
    clearProvider("openai/gpt-5", path)
    assert.equal(getSelection("openai/gpt-5", path), undefined)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("returns empty state for malformed JSON", () => {
  const directory = mkdtempSync(join(process.cwd(), ".test-tmp-"))
  const path = join(directory, "missing.json")
  try {
    assert.deepEqual(readState(path), { version: 1, selections: {}, sessions: {} })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
