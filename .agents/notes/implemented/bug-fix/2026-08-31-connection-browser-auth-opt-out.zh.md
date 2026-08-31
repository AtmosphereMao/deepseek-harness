# Agent Note：浏览器认证改为可配置，让 web-auth 分别门控远程与本机访问

Status: implemented

[English](2026-08-31-connection-browser-auth-opt-out.md) | 中文

## 问题

Web 外壳用 web-auth 密码门控做认证：未设置 `DSH_WEB_PASSWORD` 时门控不生效，表面只在 Host/Origin 信任栅栏之后保持未认证；设置密码后，它门控每条路由、静态资源、`/api` 调用与 WebSocket 升级。上游的 `dsh-client-connection`（在上游同步时被采纳）总是启用其启动 token 的 `BrowserAuth` 栅栏。结果是 Web 外壳即使在 web-auth 才是预期门控的情况下也强制要求 `?token=` URL，因此依赖信任栅栏加密码门控的公网访问会以 `BrowserAuth` 的 401 失败。

## 决策

`dsh-client-connection` 的 `browserAuth` 配置是三态开关（schema 默认 `always`）。`always` 对所有请求都要求 token；`loopback-exempt` 只对非 loopback 请求要求 token，因此远程访客必须同时出示 `?token=` URL 与 web-auth 密码，而 loopback 访客只需通过 Host/Origin 栅栏与密码门控；`never` 则完全关闭该栅栏。`dsh-web-app` bundle 将 `browserAuth` 设为 `loopback-exempt`，上游消费方则沿用默认的 `always`。

## 备选方案

### 为何不保留始终开启的 token 栅栏

保留上游始终开启的 `BrowserAuth` 能保住其每次启动的 CSRF token，但即使在 web-auth 密码门控才是预期门控时也对 loopback 强制 `?token=` URL。这会破坏 fork 的「本机仅密码」表面。

### 为何不恢复 fork 的 apiProxy 连接

恢复同步前的连接能保留 `allowRemotePrivileged`，但 fork 的 apiProxy 载体已被上游移除、由 api BFF 取代；保留它会让 Web 外壳挂靠在一个被同步刻意退役的载体上。

## 影响

所得：本机访问只需 web-auth 密码，远程访问则需 token 加密码——公网表面得到双重保障。所失：loopback 失去 `BrowserAuth` 的每次启动 token，因此 loopback 调用方靠 Host/Origin 栅栏而非秘密令牌来识别；上游消费方不受影响，因为默认仍为 `always`。
