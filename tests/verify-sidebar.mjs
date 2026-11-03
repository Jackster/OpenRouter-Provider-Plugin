import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { transformSolidSource } from "../node_modules/@opentui/solid/scripts/solid-transform.js"
import { testRender } from "@opentui/solid"
import { readState } from "../src/state.ts"

const root = resolve(import.meta.dirname, "..")
const directory = await mkdtemp(join(root, ".sidebar-test-"))
const compiled = join(directory, "compiled")
const statePath = join(directory, "state.json")
const previousStatePath = process.env.OPENCODE_OPENROUTER_STATE_PATH
const previousFetch = globalThis.fetch
process.env.OPENCODE_OPENROUTER_STATE_PATH = statePath
await writeFile(statePath, JSON.stringify({ version: 1, selections: {}, sessions: {
  "session-test": { providerID: "openrouter", modelID: "liquid/lfm-2.5-2.6b:free", updatedAt: Date.now() },
} }))

globalThis.fetch = async () => new Response(JSON.stringify({ data: { endpoints: [
  {
    name: "Liquid | LFM", provider_name: "Liquid", tag: "liquid", status: 0,
    pricing: { prompt: "0", completion: "0", input_cache_read: "0" },
    uptime_last_30m: 99.95, latency_last_30m: 0.25, throughput_last_30m: 12.34,
  },
  {
    name: "Other | LFM", provider_name: "Other Provider", tag: "other/default", status: 0,
    pricing: { prompt: "0.00000125", completion: "0.0000025", input_cache_read: "0.000000125" },
    uptime_last_30m: null, uptime_last_1d: 99.9, latency_last_30m: null, throughput_last_30m: null,
  },
] } }), { status: 200, headers: { "content-type": "application/json" } })

let slot
let layer
let command
let picker
let dialogChoice
let dialogOptions
const ctx = {
  options: { refreshIntervalMs: 60_000 },
  client: {
    credential: {
      list: async () => [{
        active: true,
        integrationID: "openrouter",
        value: { type: "key", key: "test-key" },
      }],
    },
  },
  data: {
    session: { message: { list: () => [] } },
    location: { provider: { list: () => [{ id: "openrouter" }] } },
  },
  theme: {
    text: {
      base: "#dddddd",
      muted: "#888888",
      action: { primary: { base: "#aaaaFF" } },
      feedback: { success: { base: "#88dd88" }, error: { base: "#ff8888" } },
    },
  },
  keymap: { layer: (factory) => {
    layer = factory()
    command = layer.commands[0]
  } },
  ui: {
    router: { current: () => ({ type: "home" }) },
    model: { current: () => ({ providerID: "openrouter", modelID: "liquid/lfm-2.5-2.6b:free" }) },
    slot: (claim) => { slot = claim },
    toast: { show: () => {} },
    dialog: {
      set: (options) => { dialogOptions = options },
      alert: async (options) => { throw new Error(`Unexpected alert: ${options.message}`) },
      select: async (options) => { picker = options; const choice = dialogChoice; dialogChoice = undefined; return choice },
    },
  },
}

try {
  const bundled = process.env.OPENROUTER_TEST_BUNDLE === "1"
  if (!bundled) {
    await mkdir(compiled, { recursive: true })
    const files = await readdir(join(root, "src"))
    for (const file of files.filter((file) => /\.tsx?$/.test(file))) {
      const source = await readFile(join(root, "src", file), "utf8")
      const output = (await transformSolidSource(source, {
        filename: join(root, "src", file),
        resolvePath: (specifier) => specifier === "solid-js" ? "solid-js/dist/solid.js" : specifier,
      }))
        .replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2")
      await writeFile(join(compiled, file.replace(/\.tsx?$/, ".js")), output)
    }
  }
  const entrypoint = bundled ? join(root, "dist", "tui.js") : join(compiled, "tui.js")
  const plugin = (await import(pathToFileURL(entrypoint).href)).default
  await plugin.setup(ctx)
  assert.equal(layer.mode, "global")
  assert.equal(command.slash.name, "openrouter")
  assert.ok(slot)
  await command.run()
  assert.equal(dialogOptions.size, "xlarge")
  assert.equal(picker.options.length, 4)
  assert.match(picker.options[0].title, /Sort: Provider name/)
  assert.match(picker.options[2].title, /Liquid/)
  assert.match(picker.options[2].description, /Cache read \$0 \/M/)
  assert.equal(picker.options[2].footer, "12 t/s · 250ms · 100.0% up")
  assert.equal(picker.options[3].footer, "99.9% up 1d")
  assert.doesNotMatch(picker.options[2].description, /t\/s/)
  dialogChoice = { changeSort: true }
  await command.run()
  assert.match(picker.options[0].title, /Cheapest input/)

  for (const width of [38, 72]) {
    const terminal = await testRender(() => slot.render({ sessionID: "session-test" }), { width, height: 24 })
    try {
      const frame = await terminal.waitForFrame((value) => value.includes("Other Provider"))
      assert.match(frame, /OpenRouter Provider/)
      assert.match(frame, /Automatic routing/)
      assert.match(frame, /^ {2}In \$0 · Out \$0 \/M/m)
      assert.match(frame, /^ {2}Cache read \$0 \/M/m)
      assert.match(frame, /12 t\/s · 250ms · 100\.0% up/)
      assert.match(frame, /^ {2}In \$1\.25 · Out \$2\.50 \/M/m)
      assert.match(frame, /^ {2}Cache read \$0\.125 \/M/m)
      assert.match(frame, /^ {2}99\.9% up 1d\s*$/m)
      assert.doesNotMatch(frame, /— · —/)
      console.log(`\n--- Sidebar at ${width} columns ---\n${frame}`)

      if (width === 72) {
        const initialRows = frame.split("\n")
        const sortY = initialRows.findIndex((row) => row.includes("Sort: Provider name"))
        assert.ok(sortY >= 0)
        await terminal.mockMouse.click(initialRows[sortY].indexOf("Sort:"), sortY)
        await terminal.flush()
        assert.match(terminal.captureCharFrame(), /Sort: Cheapest input/)
        await terminal.mockMouse.click(initialRows[sortY].indexOf("Sort:"), sortY)
        await terminal.flush()
        const sorted = terminal.captureCharFrame()
        assert.match(sorted, /Sort: Most expensive input/)
        assert.ok(sorted.indexOf("Other Provider") < sorted.indexOf("Liquid"))

        const rows = sorted.split("\n")
        const y = rows.findIndex((row) => row.includes("Other Provider"))
        await terminal.mockMouse.click(rows[y].indexOf("Other Provider"), y)
        await terminal.flush()
        assert.equal(readState(statePath).selections["liquid/lfm-2.5-2.6b:free"]?.provider, "other")
        const selected = terminal.captureCharFrame()
        assert.match(selected, /● Other Provider/)

        const automaticY = selected.split("\n").findIndex((row) => row.includes("Automatic routing"))
        await terminal.mockMouse.click(5, automaticY)
        await terminal.flush()
        assert.equal(readState(statePath).selections["liquid/lfm-2.5-2.6b:free"], undefined)
        assert.match(terminal.captureCharFrame(), /● Automatic routing/)
      }
    } finally {
      await terminal.dispose()
    }
  }
  console.log("\nVerified narrow/wide rendering, provider selection, and automatic-routing reset.")
} finally {
  globalThis.fetch = previousFetch
  if (previousStatePath === undefined) delete process.env.OPENCODE_OPENROUTER_STATE_PATH
  else process.env.OPENCODE_OPENROUTER_STATE_PATH = previousStatePath
  await rm(directory, { recursive: true, force: true })
}
