# Agent Note: Browser authentication is configurable so web-auth gates remote and local access

Status: implemented

English | [中文](2026-08-31-connection-browser-auth-opt-out.zh.md)

## Problem

The Web shell authenticates with the web-auth password gate: with no `DSH_WEB_PASSWORD` the gate is a no-op and the surface is unauthenticated behind the Host/Origin trust fence alone, and with a password it gates every route, asset, `/api` call, and WebSocket upgrade. Upstream's `dsh-client-connection`, adopted during the upstream sync, always enables its launch-token `BrowserAuth` fence. The result was a Web shell that required the `?token=` URL even when web-auth was the intended gate, so public access that relied on the trust fence plus the password gate failed with `BrowserAuth`'s 401.

## Decision

`dsh-client-connection`'s `browserAuth` config is a three-way switch (schema default `always`). `always` requires the token for every request; `loopback-exempt` requires it only for non-loopback requests, so a remote visitor must present both the `?token=` URL and web-auth's password while a loopback visitor passes the Host/Origin fence and the password gate alone; `never` disables the fence entirely. The `dsh-web-app` bundle sets `browserAuth: 'loopback-exempt'`, and upstream consumers keep the default `always`.

## Alternatives considered

### Why not keep the token fence always on?

Keeping upstream's always-on `BrowserAuth` preserves its per-launch CSRF token, but it forces the `?token=` URL even on loopback when web-auth's password gate is the intended gate. That breaks the fork's loopback-with-password-only surface.

### Why not restore the fork's apiProxy connection?

Restoring the pre-sync connection keeps `allowRemotePrivileged`, but the fork's apiProxy carrier was removed upstream and replaced by the api BFF; keeping it would strand the Web shell on a carrier the sync deliberately retired.

## Consequences

Bought: loopback access needs only web-auth's password, while remote access needs both the token and the password — double protection on the public surface. Cost: loopback loses `BrowserAuth`'s per-launch token, so a loopback caller is identified by the Host/Origin fence rather than a secret; upstream consumers are unaffected because the default stays `always`.
