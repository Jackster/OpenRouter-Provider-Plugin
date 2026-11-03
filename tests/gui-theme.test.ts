import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import { transformAsync } from "@babel/core"
// @ts-expect-error Babel presets do not publish types in this dependency set.
import typescript from "@babel/preset-typescript"
// @ts-expect-error Babel presets do not publish types in this dependency set.
import solid from "babel-preset-solid"
import { build } from "esbuild"
import { Window } from "happy-dom"
import type { ProviderInfo } from "../src/types.ts"

const compiled = await build({
  entryPoints: [resolve("src/gui.tsx")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  external: ["@opencode/*", "solid-js", "solid-js/*"],
  loader: { ".css": "text" },
  write: false,
  plugins: [{
    name: "opencode-gui-theme-test",
    setup(builder) {
      builder.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
        path: resolve(args.resolveDir, args.path.slice(0, -"?inline".length)),
      }))
      builder.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const source = await readFile(args.path, "utf8")
        const transformed = await transformAsync(source, {
          filename: args.path,
          configFile: false,
          babelrc: false,
          presets: [[solid, { generate: "dom", moduleName: "solid-js/web" }], [typescript]],
        })
        return { contents: transformed?.code ?? source, loader: "js" }
      })
    },
  }],
})

const code = compiled.outputFiles[0]?.text
assert.ok(code)

const providers: ProviderInfo[] = [
  {
    slug: "alpha",
    name: "Alpha",
    endpointTag: "alpha",
    variantCount: 1,
    promptPrice: "0.000001",
    completionPrice: "0.000002",
    cacheReadPrice: "0.0000001",
  },
  {
    slug: "beta",
    name: "Beta",
    endpointTag: "beta",
    variantCount: 1,
    promptPrice: "0.000003",
    completionPrice: "0.000006",
    cacheReadPrice: "0.0000003",
  },
]

test("Desktop rendering follows light and dark appearance changes", async () => {
  const window = new Window({ url: "http://localhost/" })
  const globals: Record<string, unknown> = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
  }
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }

  let dispose: (() => void) | undefined
  try {
    const require = createRequire(import.meta.url)
    const { createSignal } = require("solid-js") as typeof import("solid-js")
    const { render } = require("solid-js/web") as typeof import("solid-js/web")
    const [mode, setMode] = createSignal<"light" | "dark">("light")
    const Panel = Symbol("Panel")
    const Style = Symbol("Style")
    const compiledModule = { exports: {} as { default?: { setup: (ctx: unknown) => void } } }
    const localRequire = (id: string): unknown => {
      if (id === "@opencode/plugin/gui") return { Panel, Style, Plugin: { define: (value: unknown) => value } }
      if (id === "@opencode/plugin/rpc") return { Rpc: { define: (value: unknown) => value } }
      return require(id)
    }
    new Function("require", "module", "exports", code)(localRequire, compiledModule, compiledModule.exports)
    const plugin = compiledModule.exports.default
    assert.ok(plugin)

    let panel: { render: (props: unknown) => unknown } | undefined
    let css = ""
    const ctx = {
      options: {},
      appearance: { mode },
      client: {
        credential: { list: async () => [] },
        rpc: () => ({
          providers: async () => ({ providers, selected: null }),
          select: async () => ({ selected: "alpha" }),
          clear: async () => ({ selected: null }),
        }),
      },
      ui: {
        IconButton: () => window.document.createElement("button"),
        Loader: () => window.document.createElement("span"),
      },
      toast: { show: () => {} },
      add: (type: symbol, value: unknown) => {
        if (type === Panel) panel = value as typeof panel
        if (type === Style) css = String(value)
      },
    }
    plugin.setup(ctx)
    assert.ok(panel)

    const style = window.document.createElement("style")
    style.textContent = css
    window.document.head.appendChild(style)
    dispose = render(() => panel!.render({
      screen: { composer: { model: () => ({ providerID: "openrouter", modelID: "deepseek/deepseek-v4.1-flash-1017" }) } },
    }) as any, window.document.body as any)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const normalizeColor = (value: string): string => {
      const probe = window.document.createElement("span")
      probe.style.color = value
      window.document.body.appendChild(probe)
      const normalized = window.getComputedStyle(probe).color
      probe.remove()
      return normalized
    }
    const assertColor = (actual: string, expected: string, label: string) => {
      assert.ok(actual, `${label} has a computed color`)
      assert.equal(normalizeColor(actual), normalizeColor(expected), label)
    }

    const cases = [
      {
        mode: "light" as const,
        optionBackground: "#ffffff",
        optionText: "#111827",
        cheapest: "#15803d",
        expensive: "#b91c1c",
      },
      {
        mode: "dark" as const,
        optionBackground: "#1f2937",
        optionText: "#f9fafb",
        cheapest: "#4ade80",
        expensive: "#f87171",
      },
    ]

    for (const expected of cases) {
      setMode(expected.mode)
      await new Promise((resolve) => setTimeout(resolve, 0))
      const panelElement = window.document.querySelector(".orp-panel")
      const option = window.document.querySelector("#orp-sort option")
      const cheapest = window.document.querySelector('[data-price-extreme="cheapest"]')
      const expensive = window.document.querySelector('[data-price-extreme="most-expensive"]')
      assert.ok(panelElement)
      assert.ok(option)
      assert.ok(cheapest)
      assert.ok(expensive)
      assert.equal(panelElement.getAttribute("data-appearance"), expected.mode)
      assert.equal(window.getComputedStyle(panelElement).colorScheme, expected.mode)
      assertColor(window.getComputedStyle(option).backgroundColor, expected.optionBackground, `${expected.mode} dropdown background`)
      assertColor(window.getComputedStyle(option).color, expected.optionText, `${expected.mode} dropdown text`)
      assertColor(window.getComputedStyle(cheapest).color, expected.cheapest, `${expected.mode} cheapest price`)
      assertColor(window.getComputedStyle(expensive).color, expected.expensive, `${expected.mode} most expensive price`)
    }
    assert.equal(window.document.querySelectorAll(".orp-list .orp-choice").length, providers.length)
  } finally {
    dispose?.()
    window.close()
  }
})
