# Agent Note：浏览器认证改为可关闭，让 web-auth 独占表面门控

Status: implemented

[English](2026-08-31-connection-browser-auth-opt-out.md) | 中文

## 问题

Web 外壳用 web-auth 密码门控做认证：未设置 `DSH_WEB_PASSWORD` 时门控不生效，表面只在 Host/Origin 信任栅栏之后保持未认证；设置密码后，它门控每条路由、静态资源、`/api` 调用与 WebSocket 升级。上游的 `dsh-client-connection`（在上游同步时被采纳）总是启用其启动 token 的 `BrowserAuth` 栅栏。结果是 Web 外壳即使在 web-auth 才是预期门控的情况下也强制要求 `?token=` URL，因此依赖信任栅栏加密码门控的公网访问会以 `BrowserAuth` 的 401 失败。

## 决策

`dsh-client-connection` 的 `browserAuth` 配置（schema 默认 `true`）使 token 栅栏变为可选。为 `false` 时，`apply` 不创建 `BrowserAuth`；`requestRejection` 只应用 Host/Origin 栅栏，`authorizeIndex` 直接放行 index，`authenticatedUrl` 返回不带 token 的干净 URL。`dsh-web-app` bundle 将 `browserAuth` 设为 `false`，使 web-auth 保持为唯一的表面门控；上游消费方则沿用默认的 token 栅栏，行为不变。

## 备选方案

### 为何不保留始终开启的 token 栅栏

保留上游始终开启的 `BrowserAuth` 能保住其每次启动的 CSRF token，但即使在 web-auth 密码门控才是预期（或缺失）门控时也强制 `?token=` URL。这会破坏 fork 的默认未认证表面，以及依赖信任栅栏加密码门控的公网访问。

### 为何不恢复 fork 的 apiProxy 连接

恢复同步前的连接能保留 `allowRemotePrivileged`，但 fork 的 apiProxy 载体已被上游移除、由 api BFF 取代；保留它会让 Web 外壳挂靠在一个被同步刻意退役的载体上。

## 影响

所得：web-auth 密码门控成为唯一的表面门控，未设密码时 Web 外壳在 Host/Origin 栅栏之后保持未认证。所失：`browserAuth: false` 时表面失去 `BrowserAuth` 的每次启动 token，因此需要该 token 的部署必须显式设置 `browserAuth: true`；上游消费方不受影响，因为默认仍为 `true`。
