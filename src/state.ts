import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import type { ProviderSelection, SessionModel, SharedState } from "./types.ts"
import { isOpenRouterModel, normalizeModelID } from "./model.ts"

export const emptyState = (): SharedState => ({ version: 1, selections: {}, sessions: {} })

export function statePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPENCODE_OPENROUTER_STATE_PATH) return env.OPENCODE_OPENROUTER_STATE_PATH
  const configDir = env.OPENCODE_CONFIG_DIR || join(homedir(), ".config", "opencode")
  return join(configDir, "openrouter-provider.json")
}

export function readState(path = statePath()): SharedState {
  if (!existsSync(path)) return emptyState()
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SharedState>
    return {
      version: 1,
      selections: parsed.selections && typeof parsed.selections === "object" ? parsed.selections : {},
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    }
  } catch {
    return emptyState()
  }
}

export function writeState(state: SharedState, path = statePath()): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  renameSync(temporary, path)
  try { chmodSync(path, 0o600) } catch { /* Windows may not support POSIX modes. */ }
}

export function getSelection(modelID: string, path = statePath()): ProviderSelection | undefined {
  return readState(path).selections[normalizeModelID(modelID)]
}

export function selectProvider(
  modelID: string,
  provider: string,
  providerName: string,
  path = statePath(),
): ProviderSelection {
  const id = normalizeModelID(modelID)
  const state = readState(path)
  const selection: ProviderSelection = {
    modelID: id,
    provider,
    providerName,
    selectedAt: Date.now(),
  }
  state.selections[id] = selection
  writeState(state, path)
  return selection
}

export function clearProvider(modelID: string, path = statePath()): void {
  const state = readState(path)
  delete state.selections[normalizeModelID(modelID)]
  writeState(state, path)
}

export function rememberSessionModel(
  sessionID: string,
  providerID: string,
  modelID: string,
  path = statePath(),
): void {
  const state = readState(path)
  const normalized = normalizeModelID(modelID)
  const previous = state.sessions[sessionID]
  if (previous?.providerID === providerID && previous?.modelID === normalized) return
  const value: SessionModel = { providerID, modelID: normalized, updatedAt: Date.now() }
  state.sessions[sessionID] = value
  const sessions = Object.entries(state.sessions)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, 100)
  state.sessions = Object.fromEntries(sessions)
  writeState(state, path)
}

/**
 * The most recently remembered OpenRouter model across all sessions. New sessions have no
 * durable model until the first message, so host "current model" APIs can return undefined;
 * both OpenCode frontends default a new session to the most recent model, making this the
 * closest available answer.
 */
export function mostRecentOpenRouterModel(path = statePath()): string | undefined {
  let best: SessionModel | undefined
  for (const session of Object.values(readState(path).sessions)) {
    if (!isOpenRouterModel(session.providerID, session.modelID)) continue
    if (!best || session.updatedAt > best.updatedAt) best = session
  }
  return best?.modelID
}
