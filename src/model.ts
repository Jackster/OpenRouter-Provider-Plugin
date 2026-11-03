const ROUTING_SUFFIXES = /:(?:nitro|floor|exacto)$/i

/** Return the canonical OpenRouter model ID used by the endpoints API and state file. */
export function normalizeModelID(value: string): string {
  let id = value.trim()
  if (id.toLowerCase().startsWith("openrouter/")) id = id.slice("openrouter/".length)
  if (id.startsWith("~")) id = id.slice(1)
  return id.replace(ROUTING_SUFFIXES, "")
}

export function isOpenRouterModel(providerID: string, modelID: string): boolean {
  return providerID.toLowerCase() === "openrouter" && normalizeModelID(modelID).includes("/")
}

export function shortModelID(modelID: string, maxLength = 34): string {
  const id = normalizeModelID(modelID)
  if (id.length <= maxLength) return id
  const slash = id.indexOf("/")
  const author = slash >= 0 ? id.slice(0, slash + 1) : ""
  const name = slash >= 0 ? id.slice(slash + 1) : id
  const available = Math.max(8, maxLength - author.length)
  return `${author}…${name.slice(-(available - 1))}`
}

export function endpointUrl(modelID: string, baseUrl = "https://openrouter.ai"): string {
  const id = normalizeModelID(modelID)
  const slash = id.indexOf("/")
  if (slash <= 0 || slash === id.length - 1) throw new Error(`Invalid OpenRouter model ID: ${modelID}`)
  const author = id.slice(0, slash)
  const slug = id.slice(slash + 1)
  return `${baseUrl.replace(/\/$/, "")}/api/v1/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`
}
