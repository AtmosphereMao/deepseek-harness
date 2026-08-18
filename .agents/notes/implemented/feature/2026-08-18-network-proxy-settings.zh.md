# Agent Note: 通过共享 HTTP 传输配置网络代理

Status: implemented

[English](2026-08-18-network-proxy-settings.md) | 中文

## 问题

所有对外产品请求——DeepSeek 对话适配器、匿名网页抓取器以及搜索提供方——都直接调用全局 `fetch`。因此，位于代理之后的用户无法路由这些流量，而新增代理意味着要在每个消费者里重复接入同一个代理选项。Settings 页面没有相应入口，也没有持久化、热重载的值存放位置。

## 决策

**由一个共享传输层持有代理。** 新 Host 包 `@deepseek-ai/dsh-http` 提供 `ctx.http`，其 `fetch` 会把可选的 HTTP(S) 代理作为 undici `ProxyAgent` dispatcher 应用到请求上，否则退回全局 `fetch`。同一 dispatcher 还会被安装为进程级 undici dispatcher，使仅通过全局 `fetch` 访问网络的 SDK 类消费者（pi-ai 库的对话流式请求）同样经过代理。Definition 与 Provider 有意放在同一个包里：本地 Node 传输只有一个、没有需要选择的注册表，两个角色无法独立演化。

**代理是一个持久化设置字段。** 它是叠加在插件组合入口之上的 `http:` 用户设置 namespace，因此一次变更无需重启即可作用于下一个请求。只接受 `http:`/`https:` 代理 URL；SOCKS 与 `NO_PROXY` 列表不在范围内。URL 可携带凭据，它们与该段一起以明文形式存放在用户自有的设置文档中。设置 seam 保持通用，但 Web 侧的读写是显式加入的：`http` namespace 通过 `dsh-host-apiproxy` 中的 `WEB_SETTINGS_NAMESPACES` 允许列表暴露，缺少这一项时，即使传输层已挂载，Network 页仍会报告该 scope 不可用。

**直接消费者惰性接入。** `dsh-llm-deepseek`、`dsh-llm-pi-ai`（目录发现）、`dsh-web-fetch-http` 以及三个 `dsh-web-search-*` 提供方在每个请求时通过 `ctx.get('http')` 解析传输层，缺失时退回全局 `fetch`。`dsh-llm-pi-ai` 的对话流式请求无需接入：它经由全局 `fetch` 访问网络，由进程级 dispatcher 覆盖。挂载顺序与实时代理变更都是安全的。

**Network 页面编辑该字段。** 新 client 包 `@deepseek-ai/dsh-client-ui-settings-network` 以顺序 `5` 注册 `settings.section` 条目 `network`，位于 General 与 Models 之间。该字段是显式草稿：点「保存」通过 `settingsScope.bind` 提交（回车等同提交），「放弃」还原，空值则清除以恢复继承——与 Models 与 Plugins 编辑器保持一致。页面只拥有自身界面；传输行为属于 Host 包。

## 曾考虑的替代方案

**把代理逐个接入每个消费者。** 不采用：需要在五个包中重复校验、缓存与 settings 注册，无法保持一致。

**仅通过环境变量配置代理。** 不采用：值将无法持久化、热重载，也无法从 Settings 页写入，并且会绕过既有 settings 接缝。

**支持 SOCKS 与按主机绕过。** 不采用：当前没有消费者需要；undici 的 `ProxyAgent` 已覆盖 `http`/`https` 场景，后续可在不改动接缝的前提下扩展界面。

**向 `pi-ai` SDK 注入自定义 `fetch`。** 不采用：该库在构建其提供方客户端（例如 `new OpenAI({...})`）时并未暴露 fetch 选项；把代理安装为进程级 undici dispatcher 即可经由全局 `fetch` 触达这些客户端，无需改动该库。

## 后果

一个代理作用于所有对外请求，没有按消费者的覆盖。SOCKS 不受支持，绕过 `fetch` 的 `pi-ai` 传输（Bedrock、Codex WebSocket）仍不经过代理；两者都已作为已知限制记录。代理 URL 在设置链路上不脱敏，与设置文档其余部分的信任模型一致。需要不同路由的消费者仍保留各自的 `baseURL` 覆盖，不受本决策影响。
