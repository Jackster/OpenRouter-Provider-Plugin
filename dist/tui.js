// src/tui.tsx
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

// src/credentials.ts
async function openRouterKey(client, environment) {
  const credentials = await client.credential.list().catch(() => []);
  const credential = credentials.find(
    (item) => item.active && item.integrationID.toLowerCase() === "openrouter" && item.value.type === "key" && item.value.key
  );
  if (credential?.value.type === "key" && credential.value.key) return credential.value.key;
  return environment?.OPENROUTER_API_KEY;
}

// src/format.ts
var finite = (value) => typeof value === "number" && Number.isFinite(value);
function formatPrice(value) {
  if (value === void 0 || value === "") return "\u2014";
  const perMillion = Number(value) * 1e6;
  if (!Number.isFinite(perMillion)) return "\u2014";
  if (perMillion === 0) return "$0";
  if (perMillion < 1) {
    const trimmed = perMillion.toFixed(perMillion < 0.01 ? 5 : 3).replace(/0+$/, "").replace(/\.$/, "");
    const formatted = perMillion >= 0.01 ? trimmed.replace(/(\.\d)$/, (match) => `${match}0`) : trimmed;
    return `$${formatted}`;
  }
  return `$${perMillion.toFixed(2)}`;
}
function formatThroughput(value) {
  if (!finite(value) || value < 0) return "\u2014";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} t/s`;
}
function formatLatency(value) {
  if (!finite(value) || value < 0) return "\u2014";
  const seconds = value > 100 ? value / 1e3 : value;
  if (seconds < 1) return `${Math.round(seconds * 1e3)}ms`;
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
}
function formatUptime(value) {
  if (!finite(value)) return "\u2014";
  return `${value.toFixed(value === 100 ? 0 : 1)}%`;
}
function metricsLine(provider) {
  const uptime = provider.uptime30m ?? provider.uptime1d;
  const window = provider.uptime30m == null && provider.uptime1d != null ? " 1d" : "";
  const values = [
    formatThroughput(provider.throughput),
    formatLatency(provider.latency),
    finite(uptime) ? `${formatUptime(uptime)} up${window}` : void 0
  ].filter((value) => value !== void 0 && value !== "\u2014");
  return values.length ? values.join(" \xB7 ") : "Metrics unavailable";
}

// src/model.ts
var ROUTING_SUFFIXES = /:(?:nitro|floor|exacto)$/i;
function normalizeModelID(value) {
  let id = value.trim();
  if (id.toLowerCase().startsWith("openrouter/")) id = id.slice("openrouter/".length);
  if (id.startsWith("~")) id = id.slice(1);
  return id.replace(ROUTING_SUFFIXES, "");
}
function isOpenRouterModel(providerID, modelID) {
  return providerID.toLowerCase() === "openrouter" && normalizeModelID(modelID).includes("/");
}
function shortModelID(modelID, maxLength = 34) {
  const id = normalizeModelID(modelID);
  if (id.length <= maxLength) return id;
  const slash = id.indexOf("/");
  const author = slash >= 0 ? id.slice(0, slash + 1) : "";
  const name = slash >= 0 ? id.slice(slash + 1) : id;
  const available = Math.max(8, maxLength - author.length);
  return `${author}\u2026${name.slice(-(available - 1))}`;
}
function endpointUrl(modelID, baseUrl = "https://openrouter.ai") {
  const id = normalizeModelID(modelID);
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) throw new Error(`Invalid OpenRouter model ID: ${modelID}`);
  const author = id.slice(0, slash);
  const slug = id.slice(slash + 1);
  return `${baseUrl.replace(/\/$/, "")}/api/v1/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`;
}

// src/openrouter.ts
function providerSlug(tag) {
  return tag.split("/", 1)[0];
}
function representative(endpoints, slug) {
  return [...endpoints].sort((a, b) => {
    const score = (endpoint) => {
      let value = endpoint.tag === slug ? 0 : endpoint.service_tier == null || endpoint.service_tier === "default" ? 1 : 2;
      if (endpoint.status !== void 0 && endpoint.status !== 0) value += 10;
      return value;
    };
    return score(a) - score(b);
  })[0];
}
function firstMetric(endpoints, key) {
  return endpoints.find((endpoint) => endpoint[key] != null)?.[key];
}
function groupProviders(endpoints) {
  const groups = /* @__PURE__ */ new Map();
  for (const endpoint of endpoints) {
    if (!endpoint || typeof endpoint.tag !== "string" || !endpoint.tag) continue;
    const slug = providerSlug(endpoint.tag);
    const group = groups.get(slug) ?? [];
    group.push(endpoint);
    groups.set(slug, group);
  }
  return [...groups.entries()].map(([slug, group]) => {
    const endpoint = representative(group, slug);
    const scalar = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "object" && value !== null && "p50" in value) {
        const p50 = value.p50;
        if (typeof p50 === "number" && Number.isFinite(p50)) return p50;
      }
      return void 0;
    };
    const provider = {
      slug,
      name: endpoint.provider_name || endpoint.name.split("|", 1)[0].trim() || slug,
      endpointTag: endpoint.tag,
      variantCount: group.length,
      status: endpoint.status,
      quantization: endpoint.quantization,
      promptPrice: endpoint.pricing?.prompt ?? void 0,
      completionPrice: endpoint.pricing?.completion ?? void 0,
      cacheReadPrice: endpoint.pricing?.input_cache_read ?? void 0,
      uptime30m: endpoint.uptime_last_30m ?? firstMetric(group, "uptime_last_30m"),
      uptime1d: endpoint.uptime_last_1d ?? firstMetric(group, "uptime_last_1d"),
      latency: scalar(endpoint.latency_last_30m ?? firstMetric(group, "latency_last_30m")),
      throughput: scalar(endpoint.throughput_last_30m ?? firstMetric(group, "throughput_last_30m"))
    };
    return Object.fromEntries(Object.entries(provider).filter(([, value]) => value !== void 0));
  }).sort((a, b) => a.name.localeCompare(b.name));
}
async function fetchProviders(modelID, options = {}) {
  const request = options.fetchImpl ?? fetch;
  const response = await request(endpointUrl(modelID, options.baseUrl), {
    headers: {
      Accept: "application/json",
      ...options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
  });
  if (!response.ok) throw new Error(`OpenRouter endpoints API returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.data?.endpoints)) throw new Error("OpenRouter returned an invalid endpoints response");
  return groupProviders(payload.data.endpoints);
}

// src/providers.ts
var providerSortOptions = [
  { value: "name", label: "Provider name" },
  { value: "input-asc", label: "Cheapest input" },
  { value: "input-desc", label: "Most expensive input" },
  { value: "output-asc", label: "Cheapest output" },
  { value: "output-desc", label: "Most expensive output" },
  { value: "cache-asc", label: "Cheapest cache" },
  { value: "cache-desc", label: "Most expensive cache" },
  { value: "latency-asc", label: "Lowest latency" },
  { value: "throughput-desc", label: "Highest TPS" }
];
function providerSortLabel(sort) {
  return providerSortOptions.find((option) => option.value === sort)?.label ?? providerSortOptions[0].label;
}
function nextProviderSort(sort) {
  const index = providerSortOptions.findIndex((option) => option.value === sort);
  return providerSortOptions[(index + 1 + providerSortOptions.length) % providerSortOptions.length].value;
}
function numeric(value) {
  if (value === null || value === void 0) return void 0;
  const result = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(result) ? result : void 0;
}
var sortKey = {
  "input-asc": { key: "promptPrice", direction: 1 },
  "input-desc": { key: "promptPrice", direction: -1 },
  "output-asc": { key: "completionPrice", direction: 1 },
  "output-desc": { key: "completionPrice", direction: -1 },
  "cache-asc": { key: "cacheReadPrice", direction: 1 },
  "cache-desc": { key: "cacheReadPrice", direction: -1 },
  "latency-asc": { key: "latency", direction: 1 },
  "throughput-desc": { key: "throughput", direction: -1 }
};
function sortProviders(providers, sort) {
  const result = [...providers];
  if (sort === "name") return result.sort((a, b) => a.name.localeCompare(b.name));
  const { key, direction } = sortKey[sort];
  return result.sort((a, b) => {
    const left = numeric(a[key]);
    const right = numeric(b[key]);
    if (left === void 0 && right === void 0) return a.name.localeCompare(b.name);
    if (left === void 0) return 1;
    if (right === void 0) return -1;
    return (left - right) * direction || a.name.localeCompare(b.name);
  });
}
function priceExtremes(providers) {
  const result = { promptPrice: {}, completionPrice: {}, cacheReadPrice: {} };
  for (const key of Object.keys(result)) {
    const values = providers.map((provider) => numeric(provider[key])).filter((value) => value !== void 0);
    if (values.length === 0) continue;
    result[key] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return result;
}
function priceExtreme(provider, key, extremes) {
  const value = numeric(provider[key]);
  const { min, max } = extremes[key];
  if (value === void 0 || min === void 0 || max === void 0 || min === max) return void 0;
  if (value === min) return "cheapest";
  if (value === max) return "most-expensive";
  return void 0;
}

// src/state.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
var emptyState = () => ({ version: 1, selections: {}, sessions: {} });
function statePath(env = process.env) {
  if (env.OPENCODE_OPENROUTER_STATE_PATH) return env.OPENCODE_OPENROUTER_STATE_PATH;
  const configDir = env.OPENCODE_CONFIG_DIR || join(homedir(), ".config", "opencode");
  return join(configDir, "openrouter-provider.json");
}
function readState(path = statePath()) {
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      version: 1,
      selections: parsed.selections && typeof parsed.selections === "object" ? parsed.selections : {},
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {}
    };
  } catch {
    return emptyState();
  }
}
function writeState(state, path = statePath()) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}
`, { encoding: "utf8", mode: 384 });
  renameSync(temporary, path);
  try {
    chmodSync(path, 384);
  } catch {
  }
}
function getSelection(modelID, path = statePath()) {
  return readState(path).selections[normalizeModelID(modelID)];
}
function selectProvider(modelID, provider, providerName, path = statePath()) {
  const id = normalizeModelID(modelID);
  const state = readState(path);
  const selection = {
    modelID: id,
    provider,
    providerName,
    selectedAt: Date.now()
  };
  state.selections[id] = selection;
  writeState(state, path);
  return selection;
}
function clearProvider(modelID, path = statePath()) {
  const state = readState(path);
  delete state.selections[normalizeModelID(modelID)];
  writeState(state, path);
}

// src/tui.tsx
function currentSessionID(ctx) {
  const route = ctx.ui.router.current();
  return route.type === "session" ? route.sessionID : void 0;
}
function currentModel(ctx, sessionID) {
  const current = ctx.ui.model.current();
  if (current) return isOpenRouterModel(current.providerID, current.modelID) ? normalizeModelID(current.modelID) : "";
  if (!sessionID) return "";
  const remembered = readState().sessions[sessionID];
  if (remembered) return isOpenRouterModel(remembered.providerID, remembered.modelID) ? remembered.modelID : "";
  const messages = ctx.data.session.message.list(sessionID);
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.type !== "assistant") continue;
    return isOpenRouterModel(message.model.providerID, message.model.id) ? normalizeModelID(message.model.id) : "";
  }
  return "";
}
function toast(ctx, message, variant = "success") {
  ctx.ui.toast.show({
    message,
    variant,
    duration: 4e3
  });
}
function choose(ctx, modelID, provider) {
  try {
    if (provider) {
      selectProvider(modelID, provider.slug, provider.name);
      toast(ctx, `${shortModelID(modelID)} pinned to ${provider.name}. Fallbacks disabled.`);
    } else {
      clearProvider(modelID);
      toast(ctx, `${shortModelID(modelID)} restored to automatic OpenRouter routing.`, "info");
    }
  } catch (error) {
    toast(ctx, `Could not save provider selection: ${String(error)}`, "error");
  }
}
async function openDialog(ctx, sort = "name", loadedProviders) {
  const modelID = currentModel(ctx, currentSessionID(ctx));
  if (!modelID) {
    await ctx.ui.dialog.alert({
      title: "OpenRouter Provider",
      message: "Select an OpenRouter model first."
    });
    return;
  }
  try {
    const providers = loadedProviders ?? await fetchProviders(modelID, {
      apiKey: await openRouterKey(ctx.client, process.env)
    });
    const selected = getSelection(modelID)?.provider;
    const options = [{
      title: `Sort: ${providerSortLabel(sort)}`,
      value: {
        changeSort: true
      },
      description: "Click to cycle through price, latency, and TPS sorting"
    }, {
      title: `${selected ? "\u25CB" : "\u25CF"} Automatic routing`,
      value: {},
      description: "Let OpenRouter choose and fail over normally"
    }, ...sortProviders(providers, sort).map((provider) => ({
      title: `${selected === provider.slug ? "\u25CF" : "\u25CB"} ${provider.name}${provider.variantCount > 1 ? ` (+${provider.variantCount - 1} variants)` : ""}`,
      value: {
        provider
      },
      description: `In ${formatPrice(provider.promptPrice)} \xB7 Out ${formatPrice(provider.completionPrice)} /M \xB7 Cache read ${formatPrice(provider.cacheReadPrice)} /M`,
      footer: metricsLine(provider)
    }))];
    const selection = ctx.ui.dialog.select({
      title: `OpenRouter \u2014 ${shortModelID(modelID, 60)}`,
      placeholder: "Search providers...",
      options
    });
    ctx.ui.dialog.set({
      size: "xlarge"
    });
    const choice = await selection;
    if (choice?.changeSort) await openDialog(ctx, nextProviderSort(sort), providers);
    else if (choice) choose(ctx, modelID, choice.provider);
  } catch (error) {
    await ctx.ui.dialog.alert({
      title: "OpenRouter Provider",
      message: `Could not load providers: ${String(error)}`
    });
  }
}
function ProviderPanel(props) {
  const {
    ctx
  } = props;
  const theme = () => ctx.theme;
  const [open, setOpen] = createSignal(true);
  const [providers, setProviders] = createSignal([]);
  const [sort, setSort] = createSignal("name");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [refresh, setRefresh] = createSignal(0);
  const [selectionVersion, setSelectionVersion] = createSignal(0);
  const [updatedAt, setUpdatedAt] = createSignal();
  let request = 0;
  const modelID = createMemo(() => {
    refresh();
    return currentModel(ctx, props.sessionID);
  });
  const selected = createMemo(() => {
    selectionVersion();
    refresh();
    const id = modelID();
    return id ? getSelection(id) : void 0;
  });
  const sortedProviders = createMemo(() => sortProviders(providers(), sort()));
  const extremes = createMemo(() => priceExtremes(providers()));
  createEffect(() => {
    const id = modelID();
    const generation = ++request;
    setProviders([]);
    setError("");
    setUpdatedAt(void 0);
    if (!id) return;
    setLoading(true);
    void openRouterKey(ctx.client, process.env).then((apiKey) => fetchProviders(id, {
      apiKey
    })).then((result) => {
      if (generation !== request) return;
      setProviders(result);
      setUpdatedAt(Date.now());
    }).catch((reason) => {
      if (generation === request) setError(String(reason));
    }).finally(() => {
      if (generation === request) setLoading(false);
    });
  });
  createEffect(() => {
    const timer = setInterval(() => setRefresh((value) => value + 1), props.refreshIntervalMs);
    onCleanup(() => clearInterval(timer));
  });
  const select = (provider) => {
    const id = modelID();
    if (!id) return;
    choose(ctx, id, provider);
    setSelectionVersion((value) => value + 1);
  };
  return (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("box"), _el$3 = _$createElement("text"), _el$4 = _$createElement("text"), _el$5 = _$createElement("b"), _el$7 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "paddingTop", 1);
    _$setProp(_el$, "width", "100%");
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$4);
    _$insertNode(_el$2, _el$7);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "gap", 1);
    _$setProp(_el$2, "onMouseDown", () => setOpen((value) => !value));
    _$insert(_el$3, () => open() ? "\u25BC" : "\u25B6");
    _$insertNode(_el$4, _el$5);
    _$insertNode(_el$5, _$createTextNode(`OpenRouter Provider`));
    _$insertNode(_el$7, _$createTextNode(`\u21BB`));
    _$setProp(_el$7, "onMouseDown", (event) => {
      event.stopPropagation();
      setRefresh((value) => value + 1);
    });
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return open();
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return modelID();
          },
          get fallback() {
            return (() => {
              var _el$25 = _$createElement("text");
              _$insertNode(_el$25, _$createTextNode(`Select an OpenRouter model.`));
              _$effect((_$p) => _$setProp(_el$25, "fg", theme().text.muted, _$p));
              return _el$25;
            })();
          },
          get children() {
            return [(() => {
              var _el$9 = _$createElement("text");
              _$setProp(_el$9, "wrapMode", "none");
              _$insert(_el$9, () => shortModelID(modelID()));
              _$effect((_$p) => _$setProp(_el$9, "fg", theme().text.muted, _$p));
              return _el$9;
            })(), (() => {
              var _el$0 = _$createElement("box"), _el$1 = _$createElement("text"), _el$11 = _$createElement("text"), _el$12 = _$createTextNode(` \u25BE`);
              _$insertNode(_el$0, _el$1);
              _$insertNode(_el$0, _el$11);
              _$setProp(_el$0, "flexDirection", "row");
              _$setProp(_el$0, "gap", 1);
              _$setProp(_el$0, "onMouseDown", () => setSort((value) => nextProviderSort(value)));
              _$insertNode(_el$1, _$createTextNode(`Sort:`));
              _$insertNode(_el$11, _el$12);
              _$insert(_el$11, () => providerSortLabel(sort()), _el$12);
              _$effect((_p$) => {
                var _v$ = theme().text.muted, _v$2 = theme().text.action.primary.base;
                _v$ !== _p$.e && (_p$.e = _$setProp(_el$1, "fg", _v$, _p$.e));
                _v$2 !== _p$.t && (_p$.t = _$setProp(_el$11, "fg", _v$2, _p$.t));
                return _p$;
              }, {
                e: void 0,
                t: void 0
              });
              return _el$0;
            })(), (() => {
              var _el$13 = _$createElement("box"), _el$14 = _$createElement("text"), _el$15 = _$createTextNode(` Automatic routing`);
              _$insertNode(_el$13, _el$14);
              _$setProp(_el$13, "flexDirection", "column");
              _$setProp(_el$13, "onMouseDown", () => select());
              _$insertNode(_el$14, _el$15);
              _$insert(_el$14, () => selected() ? "\u25CB" : "\u25CF", _el$15);
              _$insert(_el$13, _$createComponent(Show, {
                get when() {
                  return selected();
                },
                get children() {
                  var _el$16 = _$createElement("text");
                  _$insertNode(_el$16, _$createTextNode(`fallbacks enabled`));
                  _$effect((_$p) => _$setProp(_el$16, "fg", theme().text.muted, _$p));
                  return _el$16;
                }
              }), null);
              _$effect((_$p) => _$setProp(_el$14, "fg", selected() ? theme().text.base : theme().text.feedback.success.base, _$p));
              return _el$13;
            })(), _$createComponent(Show, {
              get when() {
                return loading();
              },
              get children() {
                var _el$18 = _$createElement("text");
                _$insertNode(_el$18, _$createTextNode(`Loading live metrics\u2026`));
                _$effect((_$p) => _$setProp(_el$18, "fg", theme().text.muted, _$p));
                return _el$18;
              }
            }), _$createComponent(Show, {
              get when() {
                return error();
              },
              get children() {
                var _el$20 = _$createElement("text");
                _$insert(_el$20, error);
                _$effect((_$p) => _$setProp(_el$20, "fg", theme().text.feedback.error.base, _$p));
                return _el$20;
              }
            }), _$createComponent(Show, {
              get when() {
                return _$memo(() => !!(!loading() && !error()))() && providers().length === 0;
              },
              get children() {
                var _el$21 = _$createElement("text");
                _$insertNode(_el$21, _$createTextNode(`No providers reported.`));
                _$effect((_$p) => _$setProp(_el$21, "fg", theme().text.muted, _$p));
                return _el$21;
              }
            }), _$createComponent(For, {
              get each() {
                return sortedProviders();
              },
              children: (provider) => {
                const active = () => selected()?.provider === provider.slug;
                const color = (key) => {
                  const extreme = priceExtreme(provider, key, extremes());
                  return extreme === "cheapest" ? theme().text.feedback.success.base : extreme === "most-expensive" ? theme().text.feedback.error.base : theme().text.base;
                };
                return (() => {
                  var _el$27 = _$createElement("box"), _el$28 = _$createElement("text"), _el$29 = _$createTextNode(` `), _el$30 = _$createElement("box"), _el$31 = _$createElement("box"), _el$32 = _$createElement("text"), _el$34 = _$createElement("text"), _el$35 = _$createElement("text"), _el$37 = _$createElement("text"), _el$38 = _$createElement("text"), _el$40 = _$createElement("box"), _el$41 = _$createElement("text"), _el$43 = _$createElement("text"), _el$44 = _$createElement("text"), _el$46 = _$createElement("text");
                  _$insertNode(_el$27, _el$28);
                  _$insertNode(_el$27, _el$30);
                  _$setProp(_el$27, "flexDirection", "column");
                  _$setProp(_el$27, "paddingTop", 1);
                  _$setProp(_el$27, "onMouseDown", () => select(provider));
                  _$insertNode(_el$28, _el$29);
                  _$setProp(_el$28, "wrapMode", "none");
                  _$insert(_el$28, () => active() ? "\u25CF" : "\u25CB", _el$29);
                  _$insert(_el$28, () => provider.name, null);
                  _$insert(_el$28, (() => {
                    var _c$ = _$memo(() => provider.variantCount > 1);
                    return () => _c$() ? ` +${provider.variantCount - 1}` : "";
                  })(), null);
                  _$insertNode(_el$30, _el$31);
                  _$insertNode(_el$30, _el$40);
                  _$insertNode(_el$30, _el$46);
                  _$setProp(_el$30, "flexDirection", "column");
                  _$setProp(_el$30, "paddingLeft", 2);
                  _$insertNode(_el$31, _el$32);
                  _$insertNode(_el$31, _el$34);
                  _$insertNode(_el$31, _el$35);
                  _$insertNode(_el$31, _el$37);
                  _$insertNode(_el$31, _el$38);
                  _$setProp(_el$31, "flexDirection", "row");
                  _$insertNode(_el$32, _$createTextNode(`In `));
                  _$insert(_el$34, () => formatPrice(provider.promptPrice));
                  _$insertNode(_el$35, _$createTextNode(` \xB7 Out `));
                  _$insert(_el$37, () => formatPrice(provider.completionPrice));
                  _$insertNode(_el$38, _$createTextNode(` /M`));
                  _$insertNode(_el$40, _el$41);
                  _$insertNode(_el$40, _el$43);
                  _$insertNode(_el$40, _el$44);
                  _$setProp(_el$40, "flexDirection", "row");
                  _$insertNode(_el$41, _$createTextNode(`Cache read `));
                  _$insert(_el$43, () => formatPrice(provider.cacheReadPrice));
                  _$insertNode(_el$44, _$createTextNode(` /M`));
                  _$setProp(_el$46, "wrapMode", "none");
                  _$insert(_el$46, () => metricsLine(provider));
                  _$effect((_p$) => {
                    var _v$6 = active() ? theme().text.feedback.success.base : provider.status !== void 0 && provider.status !== 0 ? theme().text.feedback.error.base : theme().text.base, _v$7 = theme().text.base, _v$8 = color("promptPrice"), _v$9 = theme().text.base, _v$0 = color("completionPrice"), _v$1 = theme().text.base, _v$10 = theme().text.base, _v$11 = color("cacheReadPrice"), _v$12 = theme().text.base, _v$13 = theme().text.muted;
                    _v$6 !== _p$.e && (_p$.e = _$setProp(_el$28, "fg", _v$6, _p$.e));
                    _v$7 !== _p$.t && (_p$.t = _$setProp(_el$32, "fg", _v$7, _p$.t));
                    _v$8 !== _p$.a && (_p$.a = _$setProp(_el$34, "fg", _v$8, _p$.a));
                    _v$9 !== _p$.o && (_p$.o = _$setProp(_el$35, "fg", _v$9, _p$.o));
                    _v$0 !== _p$.i && (_p$.i = _$setProp(_el$37, "fg", _v$0, _p$.i));
                    _v$1 !== _p$.n && (_p$.n = _$setProp(_el$38, "fg", _v$1, _p$.n));
                    _v$10 !== _p$.s && (_p$.s = _$setProp(_el$41, "fg", _v$10, _p$.s));
                    _v$11 !== _p$.h && (_p$.h = _$setProp(_el$43, "fg", _v$11, _p$.h));
                    _v$12 !== _p$.r && (_p$.r = _$setProp(_el$44, "fg", _v$12, _p$.r));
                    _v$13 !== _p$.d && (_p$.d = _$setProp(_el$46, "fg", _v$13, _p$.d));
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0,
                    a: void 0,
                    o: void 0,
                    i: void 0,
                    n: void 0,
                    s: void 0,
                    h: void 0,
                    r: void 0,
                    d: void 0
                  });
                  return _el$27;
                })();
              }
            }), _$createComponent(Show, {
              get when() {
                return updatedAt();
              },
              get children() {
                var _el$23 = _$createElement("text");
                _$insertNode(_el$23, _$createTextNode(`30m metrics \xB7 click to pin`));
                _$effect((_$p) => _$setProp(_el$23, "fg", theme().text.muted, _$p));
                return _el$23;
              }
            })];
          }
        });
      }
    }), null);
    _$effect((_p$) => {
      var _v$3 = theme().text.base, _v$4 = theme().text.action.primary.base, _v$5 = theme().text.muted;
      _v$3 !== _p$.e && (_p$.e = _$setProp(_el$3, "fg", _v$3, _p$.e));
      _v$4 !== _p$.t && (_p$.t = _$setProp(_el$4, "fg", _v$4, _p$.t));
      _v$5 !== _p$.a && (_p$.a = _$setProp(_el$7, "fg", _v$5, _p$.a));
      return _p$;
    }, {
      e: void 0,
      t: void 0,
      a: void 0
    });
    return _el$;
  })();
}
var setup = async (ctx) => {
  const configured = Number(ctx.options.refreshIntervalMs);
  const refreshIntervalMs = Number.isFinite(configured) ? Math.max(15e3, configured) : 6e4;
  ctx.keymap.layer(() => ({
    mode: "global",
    commands: [{
      id: "openrouter.provider.select",
      title: "OpenRouter: Select upstream provider",
      description: "Compare live providers and pin one without fallbacks",
      group: "Provider",
      palette: true,
      slash: {
        name: "openrouter",
        aliases: ["or-provider"]
      },
      run: () => openDialog(ctx)
    }]
  }));
  ctx.ui.slot({
    append: "sidebar.content",
    render: (input) => _$createComponent(ProviderPanel, {
      ctx,
      get sessionID() {
        return input.sessionID;
      },
      refreshIntervalMs
    })
  });
};
var tui_default = {
  id: "opencode-openrouter-provider",
  setup
};
export {
  tui_default as default
};
