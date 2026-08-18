# @deepseek-ai/dsh-client-ui-settings-network

English | [中文](README.zh.md)

The Network settings page: one HTTP(S) proxy field written through the `http` settings namespace owned by [`@deepseek-ai/dsh-http`](../../http/http/README.md) on the Host plane. This package owns only the page surface — the field, its copy, and its write path — not the transport behavior.

The field edits live: a committed change reaches the very next outbound request (the DeepSeek chat adapter, web fetch, web search) without a restart. A clear reverts the field to inherit from composition.

## Model Experience

None, as this browser-side settings page registers no model surface; it writes one proxy field through the http settings scope.

#### KV Cache effect

None; the proxy value never enters a prompt, message, tool schema, or model-visible result.

## Known Limitations and Deferred Work

- **No validation of connectivity** — the page accepts any `http://`/`https://` URL and lets the transport surface failures on the next request; it does not probe the proxy.
- **No per-consumer routing** — one proxy for every outbound request (see the transport's own limitations).
