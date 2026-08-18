# @deepseek-ai/dsh-http

English | [中文](README.zh.md)

The shared HTTP transport seam (`ctx.http`). It is the one place outbound product traffic is configured: direct consumers call its `fetch`, and the same proxy is installed as the process-wide undici dispatcher so SDK-backed consumers that reach the network through the global `fetch` route through it too.

This package holds the seam's Definition and Provider together: there is exactly one local transport (the Node HTTP stack), no provider registry to select among, and the roles cannot evolve independently. Direct consumers are `dsh-llm-deepseek`, `dsh-llm-pi-ai` (catalog discovery), and the `dsh-web-*` providers; the pi-ai library's chat streaming uses the global `fetch`, so the process-wide dispatcher covers it.

## Proxy

The transport applies an HTTP(S) proxy to every outbound request when one is configured. The proxy is a durable `http:` user-settings section layered over this plugin's composition entry, so a change written by the Network settings page reaches the very next request without restarting anything.

- The proxy URL uses `http:` or `https:`; SOCKS is not supported.
- Empty or absent disables proxying.
- The URL may carry credentials (`http://user:pass@host:port`); they live in the same user-owned settings document as the section and are not redacted on the settings wire.

A configured proxy is realized as an undici `ProxyAgent` dispatcher: applied per request in `fetch`, and installed as undici's process-wide dispatcher so SDK-backed consumers that only know the global `fetch` route through it too. The dispatcher is rebuilt only when the resolved proxy URL changes, and the process-wide dispatcher is restored when the service is disposed.

## Config

| Key | Default | Meaning |
|---|---|---|
| `proxy` | *(unset)* | HTTP(S) proxy URL applied to every outbound request, e.g. `http://127.0.0.1:7890`. |

An unusable proxy (malformed URL or a scheme other than `http:`/`https:`) fails loud at load and is rejected on settings writes.

## Model Experience

Indirectly, through the consumers that render transport failures: the chat adapter, web fetch, and search providers each own the request assembly and error taxonomy the model sees.

#### KV Cache effect

None; the transport does not shape prompts or requests' model-visible content.

## Known Limitations and Deferred Work

- **One proxy for every request** — no per-consumer proxy, per-host bypass, or `NO_PROXY` list. Consumers that need a distinct route keep their own `baseURL` override.
- **No SOCKS support** — only `http:`/`https:` proxy URLs are accepted.
- **Non-fetch `pi-ai` transports are not proxied** — the library's fetch-based streams (its OpenAI-compatible chat path, including custom providers) route through the process-wide dispatcher, but transports it drives outside `fetch` (Bedrock, Codex WebSocket) still use the library's own environment-variable proxy handling, which this setting does not set.
