import type { ProviderSelection } from "./types.ts"

type Options = Record<string, any>

/** Apply OpenRouter's hard routing constraint without discarding unrelated preferences. */
export function applySelection(options: Options, selection: ProviderSelection): void {
  const current = options.provider && typeof options.provider === "object" && !Array.isArray(options.provider)
    ? options.provider
    : {}
  const ignore = Array.isArray(current.ignore)
    ? current.ignore.filter((item: unknown) => item !== selection.provider)
    : current.ignore

  options.provider = {
    ...current,
    order: [selection.provider],
    only: [selection.provider],
    allow_fallbacks: false,
    ...(ignore ? { ignore } : {}),
  }
}
