/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { openRouterKey } from "./credentials.ts"
import { formatPrice, metricsLine } from "./format.ts"
import { isOpenRouterModel, normalizeModelID, shortModelID } from "./model.ts"
import { fetchProviders } from "./openrouter.ts"
import { nextProviderSort, priceExtreme, priceExtremes, providerSortLabel, sortProviders } from "./providers.ts"
import type { PriceKey, ProviderSort } from "./providers.ts"
import { clearProvider, getSelection, mostRecentOpenRouterModel, readState, selectProvider } from "./state.ts"
import type { ProviderInfo } from "./types.ts"

function currentSessionID(ctx: Context): string | undefined {
  const route = ctx.ui.router.current()
  return route.type === "session" ? route.sessionID : undefined
}

function currentModel(ctx: Context, sessionID?: string): string {
  const current = ctx.ui.model.current()
  // A defined non-OpenRouter selection wins: never fall back over an explicit choice.
  if (current) return isOpenRouterModel(current.providerID, current.modelID) ? normalizeModelID(current.modelID) : ""
  if (sessionID) {
    const remembered = readState().sessions[sessionID]
    if (remembered) return isOpenRouterModel(remembered.providerID, remembered.modelID) ? remembered.modelID : ""

    const messages = ctx.data.session.message.list(sessionID)
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      if (message.type !== "assistant") continue
      return isOpenRouterModel(message.model.providerID, message.model.id) ? normalizeModelID(message.model.id) : ""
    }
  }
  // New sessions have no durable model until the first message, so the host can report
  // nothing; the most recently used OpenRouter model is what the session will send with.
  return mostRecentOpenRouterModel() ?? ""
}

function toast(ctx: Context, message: string, variant: "success" | "error" | "info" = "success"): void {
  ctx.ui.toast.show({ message, variant, duration: 4000 })
}

function choose(ctx: Context, modelID: string, provider?: ProviderInfo): void {
  try {
    if (provider) {
      selectProvider(modelID, provider.slug, provider.name)
      toast(ctx, `${shortModelID(modelID)} pinned to ${provider.name}. Fallbacks disabled.`)
    } else {
      clearProvider(modelID)
      toast(ctx, `${shortModelID(modelID)} restored to automatic OpenRouter routing.`, "info")
    }
  } catch (error) {
    toast(ctx, `Could not save provider selection: ${String(error)}`, "error")
  }
}

async function openDialog(ctx: Context, sort: ProviderSort = "name", loadedProviders?: ProviderInfo[]): Promise<void> {
  const modelID = currentModel(ctx, currentSessionID(ctx))
  if (!modelID) {
    await ctx.ui.dialog.alert({
      title: "OpenRouter Provider",
      message: "Select an OpenRouter model first.",
    })
    return
  }

  try {
    const providers = loadedProviders ?? await fetchProviders(modelID, { apiKey: await openRouterKey(ctx.client, process.env) })
    const selected = getSelection(modelID)?.provider
    type Choice = { provider?: ProviderInfo; changeSort?: boolean }
    const options = [
      {
        title: `Sort: ${providerSortLabel(sort)}`,
        value: { changeSort: true } as Choice,
        description: "Click to cycle through price, latency, and TPS sorting",
      },
      {
        title: `${selected ? "○" : "●"} Automatic routing`,
        value: {} as Choice,
        description: "Let OpenRouter choose and fail over normally",
      },
      ...sortProviders(providers, sort).map((provider) => ({
        title: `${selected === provider.slug ? "●" : "○"} ${provider.name}${provider.variantCount > 1 ? ` (+${provider.variantCount - 1} variants)` : ""}`,
        value: { provider } as Choice,
        description: `In ${formatPrice(provider.promptPrice)} · Out ${formatPrice(provider.completionPrice)} /M · Cache read ${formatPrice(provider.cacheReadPrice)} /M`,
        footer: metricsLine(provider),
      })),
    ]
    const selection = ctx.ui.dialog.select({
      title: `OpenRouter — ${shortModelID(modelID, 60)}`,
      placeholder: "Search providers...",
      options,
    })
    ctx.ui.dialog.set({ size: "xlarge" })
    const choice = await selection
    if (choice?.changeSort) await openDialog(ctx, nextProviderSort(sort), providers)
    else if (choice) choose(ctx, modelID, choice.provider)
  } catch (error) {
    await ctx.ui.dialog.alert({
      title: "OpenRouter Provider",
      message: `Could not load providers: ${String(error)}`,
    })
  }
}

function ProviderPanel(props: { ctx: Context; sessionID: string; refreshIntervalMs: number }) {
  const { ctx } = props
  const theme = () => ctx.theme
  const [open, setOpen] = createSignal(true)
  const [providers, setProviders] = createSignal<ProviderInfo[]>([])
  const [sort, setSort] = createSignal<ProviderSort>("name")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal("")
  const [refresh, setRefresh] = createSignal(0)
  const [selectionVersion, setSelectionVersion] = createSignal(0)
  const [updatedAt, setUpdatedAt] = createSignal<number>()
  let request = 0

  const modelID = createMemo(() => {
    refresh()
    return currentModel(ctx, props.sessionID)
  })
  const selected = createMemo(() => {
    selectionVersion()
    refresh()
    const id = modelID()
    return id ? getSelection(id) : undefined
  })
  const sortedProviders = createMemo(() => sortProviders(providers(), sort()))
  const extremes = createMemo(() => priceExtremes(providers()))

  createEffect(() => {
    const id = modelID()
    const generation = ++request
    setProviders([])
    setError("")
    setUpdatedAt(undefined)
    if (!id) return
    setLoading(true)
    void openRouterKey(ctx.client, process.env).then((apiKey) => fetchProviders(id, { apiKey })).then((result) => {
      if (generation !== request) return
      setProviders(result)
      setUpdatedAt(Date.now())
    }).catch((reason) => {
      if (generation === request) setError(String(reason))
    }).finally(() => {
      if (generation === request) setLoading(false)
    })
  })

  createEffect(() => {
    const timer = setInterval(() => setRefresh((value) => value + 1), props.refreshIntervalMs)
    onCleanup(() => clearInterval(timer))
  })

  const select = (provider?: ProviderInfo) => {
    const id = modelID()
    if (!id) return
    choose(ctx, id, provider)
    setSelectionVersion((value) => value + 1)
  }

  return (
    <box flexDirection="column" paddingTop={1} width="100%">
      <box flexDirection="row" gap={1} onMouseDown={() => setOpen((value) => !value)}>
        <text fg={theme().text.base}>{open() ? "▼" : "▶"}</text>
        <text fg={theme().text.action.primary.base}><b>OpenRouter Provider</b></text>
        <text
          fg={theme().text.muted}
          onMouseDown={(event) => {
            event.stopPropagation()
            setRefresh((value) => value + 1)
          }}
        >↻</text>
      </box>
      <Show when={open()}>
        <Show when={modelID()} fallback={<text fg={theme().text.muted}>Select an OpenRouter model.</text>}>
          <text fg={theme().text.muted} wrapMode="none">{shortModelID(modelID())}</text>
          <box flexDirection="row" gap={1} onMouseDown={() => setSort((value) => nextProviderSort(value))}>
            <text fg={theme().text.muted}>Sort:</text>
            <text fg={theme().text.action.primary.base}>{providerSortLabel(sort())} ▾</text>
          </box>
          <box flexDirection="column" onMouseDown={() => select()}>
            <text fg={selected() ? theme().text.base : theme().text.feedback.success.base}>{selected() ? "○" : "●"} Automatic routing</text>
            <Show when={selected()}>
              <text fg={theme().text.muted}>fallbacks enabled</text>
            </Show>
          </box>
          <Show when={loading()}><text fg={theme().text.muted}>Loading live metrics…</text></Show>
          <Show when={error()}><text fg={theme().text.feedback.error.base}>{error()}</text></Show>
          <Show when={!loading() && !error() && providers().length === 0}>
            <text fg={theme().text.muted}>No providers reported.</text>
          </Show>
          <For each={sortedProviders()}>
            {(provider) => {
              const active = () => selected()?.provider === provider.slug
              const color = (key: PriceKey) => {
                const extreme = priceExtreme(provider, key, extremes())
                return extreme === "cheapest" ? theme().text.feedback.success.base : extreme === "most-expensive" ? theme().text.feedback.error.base : theme().text.base
              }
              return (
                <box flexDirection="column" paddingTop={1} onMouseDown={() => select(provider)}>
                  <text fg={active() ? theme().text.feedback.success.base : provider.status !== undefined && provider.status !== 0 ? theme().text.feedback.error.base : theme().text.base} wrapMode="none">
                    {active() ? "●" : "○"} {provider.name}{provider.variantCount > 1 ? ` +${provider.variantCount - 1}` : ""}
                  </text>
                  <box flexDirection="column" paddingLeft={2}>
                    <box flexDirection="row">
                      <text fg={theme().text.base}>In </text>
                      <text fg={color("promptPrice")}>{formatPrice(provider.promptPrice)}</text>
                      <text fg={theme().text.base}> · Out </text>
                      <text fg={color("completionPrice")}>{formatPrice(provider.completionPrice)}</text>
                      <text fg={theme().text.base}> /M</text>
                    </box>
                    <box flexDirection="row">
                      <text fg={theme().text.base}>Cache read </text>
                      <text fg={color("cacheReadPrice")}>{formatPrice(provider.cacheReadPrice)}</text>
                      <text fg={theme().text.base}> /M</text>
                    </box>
                    <text fg={theme().text.muted} wrapMode="none">{metricsLine(provider)}</text>
                  </box>
                </box>
              )
            }}
          </For>
          <Show when={updatedAt()}>
            <text fg={theme().text.muted}>30m metrics · click to pin</text>
          </Show>
        </Show>
      </Show>
    </box>
  )
}

const setup: Plugin.Definition["setup"] = async (ctx) => {
  const configured = Number(ctx.options.refreshIntervalMs)
  const refreshIntervalMs = Number.isFinite(configured) ? Math.max(15_000, configured) : 60_000
  ctx.keymap.layer(() => ({
    mode: "global",
    commands: [{
      id: "openrouter.provider.select",
      title: "OpenRouter: Select upstream provider",
      description: "Compare live providers and pin one without fallbacks",
      group: "Provider",
      palette: true,
      slash: { name: "openrouter", aliases: ["or-provider"] },
      run: () => openDialog(ctx),
    }],
  }))
  ctx.ui.slot({
    append: "sidebar.content",
    render: (input) => <ProviderPanel ctx={ctx} sessionID={input.sessionID} refreshIntervalMs={refreshIntervalMs} />,
  })
}

export default { id: "opencode-openrouter-provider", setup } satisfies Plugin.Definition
