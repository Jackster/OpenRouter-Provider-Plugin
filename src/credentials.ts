import type { OpenCodeClient } from "@opencode/client/promise"

/** Read the active key without persisting or exposing it to the interface. */
export async function openRouterKey(
  client: Pick<OpenCodeClient, "credential">,
  environment?: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const credentials = await client.credential.list().catch(() => [])
  const credential = credentials.find((item) =>
    item.active && item.integrationID.toLowerCase() === "openrouter" && item.value.type === "key" && item.value.key,
  )
  if (credential?.value.type === "key" && credential.value.key) return credential.value.key
  return environment?.OPENROUTER_API_KEY
}
