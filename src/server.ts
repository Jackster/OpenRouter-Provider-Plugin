import type { Plugin } from "@opencode/plugin/promise/plugin"
import { normalizeModelID } from "./model.ts"
import { fetchProviders } from "./openrouter.ts"
import { OpenRouterRpc } from "./rpc.ts"
import { applySelection } from "./routing.ts"
import { clearProvider, getSelection, rememberSessionModel, selectProvider } from "./state.ts"

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string`)
  return value.trim()
}

const setup: Plugin["setup"] = async (ctx) => {
  await ctx.rpc?.register(OpenRouterRpc, {
    providers: async (value) => {
      const input = value as { modelID?: unknown; apiKey?: unknown }
      const modelID = normalizeModelID(requiredString(input.modelID, "modelID"))
      const apiKey = input.apiKey === undefined ? undefined : requiredString(input.apiKey, "apiKey")
      return {
        providers: await fetchProviders(modelID, { apiKey }),
        selected: getSelection(modelID)?.provider ?? null,
      }
    },
    select: async (value) => {
      const input = value as { modelID?: unknown; provider?: unknown; providerName?: unknown }
      const modelID = requiredString(input.modelID, "modelID")
      const provider = requiredString(input.provider, "provider")
      selectProvider(modelID, provider, requiredString(input.providerName, "providerName"))
      return { selected: provider }
    },
    clear: async (value) => {
      const input = value as { modelID?: unknown }
      clearProvider(requiredString(input.modelID, "modelID"))
      return { selected: null }
    },
  })

  await ctx.session.hook("context", (input) => {
    try {
      rememberSessionModel(input.sessionID, input.model.providerID, String(input.model.id))
    } catch {
      // A read-only config directory must not prevent the model request.
    }
  })

  // Pin the final request after OpenCode has merged model and provider defaults.
  await ctx.session.hook("http.request", async (input) => {
    if (input.model.providerID.toLowerCase() !== "openrouter") return
    const selection = getSelection(String(input.model.id))
    if (!selection) return
    const body = await input.request.clone().json() as Record<string, any>
    applySelection(body, selection)
    input.request = new Request(input.request, { body: JSON.stringify(body) })
  })
}

export { setup }
export default { id: "opencode-openrouter-provider", setup } satisfies Plugin
