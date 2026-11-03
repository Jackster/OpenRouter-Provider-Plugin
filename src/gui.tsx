/** @jsxImportSource solid-js */
import { Panel, Plugin, Style } from "@opencode/plugin/gui"
import type { Context, PanelProps } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { openRouterKey } from "./credentials.ts"
import { formatPrice, metricsLine } from "./format.ts"
import { isOpenRouterModel, normalizeModelID, shortModelID } from "./model.ts"
import { priceExtreme, priceExtremes, providerSortOptions, sortProviders } from "./providers.ts"
import type { PriceKey, ProviderSort } from "./providers.ts"
import { OpenRouterRpc } from "./rpc.ts"
import type { ProviderInfo } from "./types.ts"
import css from "./gui.css?inline"

interface ProvidersResult {
  providers: ProviderInfo[]
  selected: string | null
}

const providerTab = {
  id: "providers",
  title: "OpenRouter",
  pinned: true,
  fallback: true,
  closable: false,
  draggable: false,
} as const

function message(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message)
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function ProviderPanel(props: PanelProps & { ctx: Context; refreshIntervalMs: number }) {
  const { ctx } = props
  const rpc = () => ctx.client.rpc(OpenRouterRpc)
  const [providers, setProviders] = createSignal<ProviderInfo[]>([])
  const [selected, setSelected] = createSignal<string | null>(null)
  const [sort, setSort] = createSignal<ProviderSort>("name")
  const [loading, setLoading] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal("")
  const [refresh, setRefresh] = createSignal(0)
  const [updatedAt, setUpdatedAt] = createSignal<number>()
  let generation = 0
  let previousModel = ""

  const modelID = createMemo(() => {
    const model = props.screen.composer.model()
    return model && isOpenRouterModel(model.providerID, model.modelID) ? normalizeModelID(model.modelID) : ""
  })
  const sortedProviders = createMemo(() => sortProviders(providers(), sort()))
  const extremes = createMemo(() => priceExtremes(providers()))

  createEffect(() => {
    const id = modelID()
    refresh()
    const current = ++generation
    const controller = new AbortController()
    onCleanup(() => controller.abort())

    if (id !== previousModel) {
      previousModel = id
      setProviders([])
      setSelected(null)
      setUpdatedAt(undefined)
    }
    setError("")
    if (!id) {
      setLoading(false)
      return
    }

    setLoading(true)
    void openRouterKey(ctx.client).then((apiKey) => {
      if (controller.signal.aborted) return undefined
      return rpc().providers({ modelID: id, ...(apiKey ? { apiKey } : {}) }, { signal: controller.signal })
    }).then((result) => {
      if (!result || current !== generation) return
      const value = result as ProvidersResult
      setProviders(value.providers)
      setSelected(value.selected)
      setUpdatedAt(Date.now())
    }).catch((reason: unknown) => {
      if (current === generation && !controller.signal.aborted) setError(message(reason))
    }).finally(() => {
      if (current === generation) setLoading(false)
    })
  })

  createEffect(() => {
    const timer = setInterval(() => setRefresh((value) => value + 1), props.refreshIntervalMs)
    onCleanup(() => clearInterval(timer))
  })

  const choose = async (provider?: ProviderInfo) => {
    const id = modelID()
    if (!id || saving()) return
    setSaving(true)
    try {
      if (provider) {
        await rpc().select({ modelID: id, provider: provider.slug, providerName: provider.name })
        if (modelID() === id) setSelected(provider.slug)
        ctx.toast.show({
          title: `${provider.name} selected`,
          description: `${shortModelID(id)} will use only this provider. Fallbacks are disabled.`,
          variant: "success",
        })
      } else {
        await rpc().clear({ modelID: id })
        if (modelID() === id) setSelected(null)
        ctx.toast.show({
          title: "Automatic routing restored",
          description: `${shortModelID(id)} will use OpenRouter's normal routing and fallbacks.`,
        })
      }
    } catch (reason) {
      ctx.toast.show({ title: "Could not save provider selection", description: message(reason), variant: "error" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section class="orp-panel" data-appearance={ctx.appearance.mode()} aria-label="OpenRouter provider selection">
      <div class="orp-heading">
        <div class="orp-heading-text">
          <h2 class="orp-title">Provider routing</h2>
          <div class="orp-model">{modelID() ? shortModelID(modelID(), 70) : "No OpenRouter model selected"}</div>
        </div>
        <ctx.ui.IconButton
          icon="refresh"
          label="Refresh OpenRouter providers"
          size="small"
          disabled={!modelID() || loading() || saving()}
          busy={loading()}
          onClick={() => setRefresh((value) => value + 1)}
        />
      </div>

      <Show when={modelID()} fallback={<p class="orp-muted">Select an OpenRouter model in the composer to compare and pin its upstream providers.</p>}>
        <div class="orp-sort-row">
          <label class="orp-sort-label" for="orp-sort">Sort providers</label>
          <select id="orp-sort" class="orp-sort" aria-label="Sort providers" value={sort()} onChange={(event) => setSort(event.currentTarget.value as ProviderSort)}>
            <For each={providerSortOptions}>{(option) => <option value={option.value}>{option.label}</option>}</For>
          </select>
        </div>
        <button class="orp-choice" data-selected={selected() === null} disabled={saving()} onClick={() => void choose()}>
          <span class="orp-choice-heading">
            <span class="orp-radio" aria-hidden="true">{selected() === null ? "●" : "○"}</span>
            <span class="orp-provider">Automatic routing</span>
          </span>
          <span class="orp-automatic-detail">OpenRouter chooses the provider and permits fallbacks.</span>
        </button>

        <Show when={loading() && providers().length === 0}>
          <div class="orp-status"><ctx.ui.Loader size="small" /> Loading live provider data…</div>
        </Show>
        <Show when={error()}><p class="orp-error" role="alert">{error()}</p></Show>
        <Show when={!loading() && !error() && providers().length === 0}>
          <p class="orp-muted">No providers were reported for this model.</p>
        </Show>

        <div class="orp-list">
          <For each={sortedProviders()}>
            {(provider) => {
              const active = () => selected() === provider.slug
              const metrics = () => metricsLine(provider)
              const extreme = (key: PriceKey) => priceExtreme(provider, key, extremes())
              return (
                <button class="orp-choice" data-selected={active()} disabled={saving()} onClick={() => void choose(provider)}>
                  <span class="orp-choice-heading">
                    <span class="orp-radio" aria-hidden="true">{active() ? "●" : "○"}</span>
                    <span class="orp-provider">{provider.name}</span>
                    <Show when={provider.variantCount > 1}><span class="orp-variants">+{provider.variantCount - 1} variants</span></Show>
                  </span>
                  <span class="orp-prices" aria-label="Prices in US dollars per million tokens">
                    <span class="orp-price"><span class="orp-price-label">Input /M</span><span class="orp-price-value" data-price-extreme={extreme("promptPrice")}>{formatPrice(provider.promptPrice)}</span></span>
                    <span class="orp-price"><span class="orp-price-label">Output /M</span><span class="orp-price-value" data-price-extreme={extreme("completionPrice")}>{formatPrice(provider.completionPrice)}</span></span>
                    <span class="orp-price"><span class="orp-price-label">Cache read /M</span><span class="orp-price-value" data-price-extreme={extreme("cacheReadPrice")}>{formatPrice(provider.cacheReadPrice)}</span></span>
                  </span>
                  <Show when={metrics() !== "Metrics unavailable"}><span class="orp-metrics">{metrics()}</span></Show>
                </button>
              )
            }}
          </For>
        </div>
        <Show when={updatedAt() && providers().length > 0}>
          <div class="orp-footer">Prices are USD per million tokens. Throughput, latency, and uptime are rolling 30-minute metrics when available.</div>
        </Show>
      </Show>
    </section>
  )
}

export default Plugin.define({
  setup(ctx) {
    const configured = Number(ctx.options.refreshIntervalMs)
    const refreshIntervalMs = Number.isFinite(configured) ? Math.max(15_000, configured) : 60_000
    ctx.add(Style, css)
    ctx.add(Panel, {
      id: "providers",
      region: "side",
      wide: true,
      mobile: { title: "OpenRouter", order: 50, kind: "drawer", icon: "providers" },
      list: () => [providerTab],
      render: (props) => <ProviderPanel {...props} ctx={ctx} refreshIntervalMs={refreshIntervalMs} />,
    })
  },
})
