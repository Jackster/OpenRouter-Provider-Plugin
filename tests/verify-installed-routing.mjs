import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFile, writeFile, unlink } from "node:fs/promises"
import { createServer } from "node:http"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const configPath = join(homedir(), ".config", "opencode", "opencode.json")
const statePath = join(homedir(), ".config", "opencode", "openrouter-provider.json")
const originalConfig = await readFile(configPath, "utf8")
const originalState = await readFile(statePath, "utf8").catch(() => undefined)
const bodies = []
let child
const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404).end()
    return
  }
  const chunks = []
  request.on("data", (chunk) => chunks.push(chunk))
  request.on("end", () => {
    bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")))
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`data: ${JSON.stringify({ id: "routing-test", object: "chat.completion.chunk", created: 1, model: "liquid/lfm-2.5-2.6b:free", choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
})
try {
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen))
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const config = JSON.parse(originalConfig)
  config.providers.openrouter = {
    settings: { baseURL: `http://127.0.0.1:${address.port}/v1`, apiKey: "local-routing-test" },
    body: { provider: { data_collection: "deny" } },
  }
  await writeFile(configPath, JSON.stringify(config, null, 2))
  const state = originalState ? JSON.parse(originalState) : { version: 1, selections: {}, sessions: {} }
  state.selections["liquid/lfm-2.5-2.6b:free"] = { modelID: "liquid/lfm-2.5-2.6b:free", provider: "liquid", providerName: "Liquid", selectedAt: Date.now() }
  await writeFile(statePath, JSON.stringify(state, null, 2))
  const executable = process.platform === "win32"
    ? join(process.env.APPDATA || "", "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe")
    : "opencode"
  const env = { ...process.env }
  delete env.OPENCODE_CONFIG
  delete env.OPENCODE_CONFIG_DIR
  delete env.OPENCODE_OPENROUTER_STATE_PATH
  const output = await new Promise((resolveRun, reject) => {
    child = spawn(executable, ["run", "--model", "openrouter/liquid/lfm-2.5-2.6b:free", "Reply with exactly OK."], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] })
    let text = ""
    child.stdout.on("data", (chunk) => { text += chunk })
    child.stderr.on("data", (chunk) => { text += chunk })
    child.on("error", reject)
    child.on("exit", (code) => code === 0 ? resolveRun(text) : reject(new Error(`OpenCode exited ${code}:\n${text}`)))
    const timer = setTimeout(() => { child.kill(); reject(new Error(`OpenCode timed out:\n${text}`)) }, 60_000)
    child.on("exit", () => clearTimeout(timer))
  })
  const selected = bodies.filter((body) => body.model === "liquid/lfm-2.5-2.6b:free")
  assert.ok(selected.length > 0, `No selected-model request. Output:\n${output}`)
  for (const body of selected) assert.deepEqual(body.provider, { data_collection: "deny", order: ["liquid"], only: ["liquid"], allow_fallbacks: false })
  console.log(`Verified ${selected.length} installed-plugin request(s) with strict provider routing.`)
} finally {
  child?.kill()
  await writeFile(configPath, originalConfig)
  if (originalState === undefined) await unlink(statePath).catch(() => {})
  else await writeFile(statePath, originalState)
  await new Promise((resolveClose) => server.close(resolveClose))
}
