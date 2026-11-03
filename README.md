# OpenCode OpenRouter Provider

An OpenCode terminal and Desktop plugin that lists the upstream providers for the active OpenRouter model and pins the provider you select.
<img width="1376" height="655" alt="image" src="https://github.com/user-attachments/assets/fd5c1544-b13b-4489-b6ce-c09ee81e82cd" />


## Features

- Native terminal sidebar and Desktop session side panel with input, output, and cache-read prices per million tokens.
- Rolling 30-minute throughput, latency, and uptime when OpenRouter supplies them; one-day uptime is used as a labelled fallback.
- Click a provider to force subsequent requests for that model to use it.
- Hard routing uses `provider.order` and `provider.only` with `allow_fallbacks: false`; OpenRouter cannot silently fail over to another provider.
- “Automatic routing” restores normal routing for the model.
- `/openrouter` (or `/or-provider`) opens a searchable terminal provider picker.
- Terminal and Desktop selections share the same per-model state and refresh every 60 seconds by default.

## Install

Requires OpenCode 2.2.5 or newer. Desktop support uses OpenCode's experimental GUI plugin API.

### Ask your AI assistant

Paste this into OpenCode or any AI coding assistant:

```text
Install the OpenCode plugin "opencode-openrouter-provider" from
https://github.com/Jackster/OpenRouter-Provider-Plugin, add it to my
OpenCode configuration, and tell me how to restart so it takes effect.
```

### From the command line

```sh
opencode plugin add github:Jackster/OpenRouter-Provider-Plugin
```

### Manual configuration

Add the Git package specifier to the `plugins` array in your global `opencode.json`:

```json
{
  "plugins": [
    "github:Jackster/OpenRouter-Provider-Plugin"
  ]
}
```

### From a local checkout

```sh
opencode plugin add /absolute/path/to/OpenRouter-Provider-Plugin
```

For a manual local installation, add a `file://` URL to the `plugins` array in your global `opencode.json`:

```json
{
  "plugins": [
    "file:///absolute/path/to/OpenRouter-Provider-Plugin"
  ]
}
```

The package exports `./server`, `./tui`, and `./gui-experimental`; OpenCode discovers them from the same plugin entry. Restart the terminal after installation or an upgrade. In Desktop, open **Settings > Extensions > Plugins**, ensure the plugin is enabled, and click **Reload** after upgrading.

## Use

1. Connect OpenRouter in OpenCode and select an OpenRouter model.
2. In the terminal, expand **OpenRouter Provider** in the session sidebar. In Desktop, open the **OpenRouter** tab in the session side panel.
3. Click a provider. The filled dot marks the active selection.
4. Click **Automatic routing** to remove the pin.

The plugin reads the model currently selected in the prompt, including in new sessions. Provider selection affects subsequent requests, including retries and continuation turns for that model.

Input, output, and cache-read prices are shown separately in **USD per million tokens**. Throughput is tokens per second; latency is time to first token. Missing prices display as `—`, never as zero; unavailable metrics are omitted to reduce clutter. Region and service-tier endpoints are grouped under their routable provider slug; a `+N` suffix indicates additional variants.

Use the **Sort** control in the terminal sidebar, `/openrouter` picker, or Desktop panel to order providers by name, cheapest or most expensive input/output/cache price, lowest latency, or highest throughput. In the provider list, the cheapest available price in each price column is **green** and the most expensive is **red**. Tied extremes are not highlighted; missing values remain unhighlighted and sort last.

## Credentials and privacy

Pricing and uptime are available from OpenRouter's public endpoints API. OpenRouter currently requires an API key for throughput and latency. The plugin uses the active OpenRouter credential loaded by OpenCode (or `OPENROUTER_API_KEY` in the terminal) only as the Authorization header for the endpoints request. Desktop passes the key transiently to its server RPC for the same lookup. It never writes the key to its state file or displays it.

Only model IDs, provider selections, and recent session model mappings are stored in `openrouter-provider.json` under OpenCode's configuration directory.

## Configuration

Set plugin options on its entry in `opencode.json` (minimum refresh interval: 15 seconds):

```json
{
  "plugins": [
    ["opencode-openrouter-provider", { "refreshIntervalMs": 60000 }]
  ]
}
```

## Development

Requires Node.js 24+ for the built-in TypeScript test runner.

```sh
npm install
npm run check
```

The check runs typechecking, unit and RPC tests, the existing terminal build, and the Desktop CommonJS build. Core modules are independent of either renderer. Tests cover model normalization, endpoint grouping, authenticated fetches, formatting, persistence, Desktop RPC handlers, and hard-routing behavior. A DOM rendering test also switches the real Desktop panel between light and dark modes and verifies its computed dropdown, color-scheme, and price-highlight styles.

The sidebar rendering and mouse-interaction check requires Node.js 26.4 or newer with native FFI enabled:

```sh
node --experimental-ffi tests/verify-sidebar.mjs
node --experimental-ffi --conditions=browser tests/verify-sidebar.mjs --bundle
```

It renders the real terminal component at 38 and 72 columns with deterministic endpoint data, then verifies provider selection and automatic-routing reset.
