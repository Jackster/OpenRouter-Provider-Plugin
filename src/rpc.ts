import { Rpc } from "@opencode/plugin/rpc"

const modelID = { type: "string", minLength: 1 } as const
const providerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "name", "endpointTag", "variantCount"],
  properties: {
    slug: { type: "string" },
    name: { type: "string" },
    endpointTag: { type: "string" },
    variantCount: { type: "integer", minimum: 1 },
    status: { type: "number" },
    quantization: { type: ["string", "null"] },
    promptPrice: { type: "string" },
    completionPrice: { type: "string" },
    cacheReadPrice: { type: "string" },
    uptime30m: { type: ["number", "null"] },
    uptime1d: { type: ["number", "null"] },
    latency: { type: ["number", "null"] },
    throughput: { type: ["number", "null"] },
  },
} as const

/** RPC shared by the Desktop panel and the server-side routing state. */
export const OpenRouterRpc = Rpc.define({
  id: "opencode-openrouter-provider",
  methods: {
    providers: {
      input: {
        type: "object",
        additionalProperties: false,
        required: ["modelID"],
        properties: {
          modelID,
          // The GUI reads the active credential and uses it only for this lookup.
          apiKey: { type: "string", minLength: 1 },
        },
      },
      output: {
        type: "object",
        additionalProperties: false,
        required: ["providers", "selected"],
        properties: {
          providers: { type: "array", items: providerSchema },
          selected: { type: ["string", "null"] },
        },
      },
    },
    select: {
      input: {
        type: "object",
        additionalProperties: false,
        required: ["modelID", "provider", "providerName"],
        properties: {
          modelID,
          provider: { type: "string", minLength: 1 },
          providerName: { type: "string", minLength: 1 },
        },
      },
      output: {
        type: "object",
        additionalProperties: false,
        required: ["selected"],
        properties: { selected: { type: "string" } },
      },
    },
    clear: {
      input: {
        type: "object",
        additionalProperties: false,
        required: ["modelID"],
        properties: { modelID },
      },
      output: {
        type: "object",
        additionalProperties: false,
        required: ["selected"],
        properties: { selected: { type: "null" } },
      },
    },
  },
  events: {},
})
