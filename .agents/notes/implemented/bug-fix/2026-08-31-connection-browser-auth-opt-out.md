# Agent Note: Browser authentication is opt-out so web-auth owns the surface gate

Status: implemented

English | [中文](2026-08-31-connection-browser-auth-opt-out.zh.md)

## Problem

The Web shell authenticates with the web-auth password gate: with no `DSH_WEB_PASSWORD` the gate is a no-op and the surface is unauthenticated behind the Host/Origin trust fence alone, and with a password it gates every route, asset, `/api` call, and WebSocket upgrade. Upstream's `dsh-client-connection`, adopted during the upstream sync, always enables its launch-token `BrowserAuth` fence. The result was a Web shell that required the `?token=` URL even when web-auth was the intended gate, so public access that relied on the trust fence plus the password gate failed with `BrowserAuth`'s 401.

## Decision

`dsh-client-connection`'s `browserAuth` config (schema default `true`) makes the token fence optional. When `false`, `apply` does not create a `BrowserAuth`; `requestRejection` applies only the Host/Origin fence, `authorizeIndex` serves the index, and `authenticatedUrl` returns the clean URL. The `dsh-web-app` bundle sets `browserAuth: false` so web-auth remains the sole surface gate, while upstream consumers keep the default token fence unchanged.

## Alternatives considered

### Why not keep the token fence always on?

Keeping upstream's always-on `BrowserAuth` preserves its per-launch CSRF token, but it forces the `?token=` URL even when web-auth's password gate is the intended (or absent) gate. That breaks the fork's unauthenticated-by-default surface and the public access that relies on the trust fence plus the password gate.

### Why not restore the fork's apiProxy connection?

Restoring the pre-sync connection keeps `allowRemotePrivileged`, but the fork's apiProxy carrier was removed upstream and replaced by the api BFF; keeping it would strand the Web shell on a carrier the sync deliberately retired.

## Consequences

Bought: web-auth's password gate is the sole surface gate, and the Web shell is unauthenticated behind the Host/Origin fence when no password is set. Cost: with `browserAuth: false` the surface loses `BrowserAuth`'s per-launch token, so a deployment that wants the token must set `browserAuth: true`; upstream consumers are unaffected because the default stays `true`.
