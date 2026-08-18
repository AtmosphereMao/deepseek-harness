# Agent Note: Network proxy settings over a shared HTTP transport

Status: implemented

English | [中文](2026-08-18-network-proxy-settings.zh.md)

## Problem

Every outbound product request — the DeepSeek chat adapter, the anonymous web fetcher, and the search providers — called the global `fetch` directly. Users behind a proxy therefore had no way to route that traffic, and adding one meant wiring the same proxy option into each consumer separately. The Settings page had no surface for it, and there was no durable, hot-reloaded home for the value.

## Decision

**One shared transport owns the proxy.** The new host package `@deepseek-ai/dsh-http` provides `ctx.http`, whose `fetch` applies an optional HTTP(S) proxy as an undici `ProxyAgent` dispatcher and otherwise defers to the global `fetch`. The same dispatcher is also installed as undici's process-wide dispatcher, so SDK-backed consumers that reach the network only through the global `fetch` (the pi-ai library's chat streams) route through it too. The Definition and Provider live in one package on purpose: there is exactly one local Node transport and no registry to select among, so the roles cannot evolve independently.

**The proxy is one durable settings field.** It is an `http:` user-settings namespace layered over the plugin's composition entry, so a change reaches the very next request without a restart. Only `http:`/`https:` proxy URLs are accepted; SOCKS and a `NO_PROXY` list are out of scope. The URL may carry credentials, which live unredacted in the same user-owned settings document as the section. The settings seam stays general, but Web-side read/write is opt-in: the `http` namespace is admitted through the API proxy's `WEB_SETTINGS_NAMESPACES` allowlist in `dsh-host-apiproxy`, without which the Network page reports the scope unavailable even though the transport is mounted.

**Direct consumers opt in lazily.** `dsh-llm-deepseek`, `dsh-llm-pi-ai` (catalog discovery), `dsh-web-fetch-http`, and the three `dsh-web-search-*` providers resolve the transport per request through `ctx.get('http')` and fall back to the global `fetch` when it is absent. `dsh-llm-pi-ai` chat streaming needs no opt-in: it reaches the network through the global `fetch`, so the process-wide dispatcher covers it. Mount order and live proxy changes stay safe.

**The Network page edits that field.** The new client package `@deepseek-ai/dsh-client-ui-settings-network` registers the `settings.section` entry `network` at order `5`, between General and Models. The field is an explicit draft: Save commits through `settingsScope.bind` (Enter submits too), Discard reverts, and an empty value clears the field to inherit — matching the Models and Plugins editors. The page owns only its surface; the transport behavior is the host package's.

## Alternatives considered

**Wire a proxy into each consumer separately.** Rejected because it duplicates validation, caching, and settings registration across five packages and cannot stay consistent.

**Configure the proxy only from environment variables.** Rejected because the value would not be durable, hot-reloaded, or writable from the Settings page, and would bypass the existing settings seam.

**Support SOCKS and per-host bypass.** Rejected because no current consumer needs them; undici's `ProxyAgent` covers the `http`/`https` case and the surface can grow later without changing the seam.

**Inject a custom `fetch` into the `pi-ai` SDK.** Rejected because the library builds its provider clients (e.g. `new OpenAI({...})`) without exposing a fetch option; installing the proxy as undici's process-wide dispatcher reaches those clients through the global `fetch` without touching the library.

## Consequences

One proxy applies to every outbound request, with no per-consumer override. SOCKS is unsupported, and `pi-ai` transports that bypass `fetch` (Bedrock, Codex WebSocket) stay unproxied; both are documented as known limitations. The proxy URL is not redacted on the settings wire, matching the trust model of the rest of the settings document. Consumers that need a distinct route keep their own `baseURL` override, unchanged by this decision.
