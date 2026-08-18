# @deepseek-ai/dsh-http

[English](README.md) | 中文

共享 HTTP 传输接缝（`ctx.http`）。它是对外产品流量的唯一配置点：直接消费者调用它的 `fetch`，同时同一代理会被安装为进程级的 undici dispatcher，使经由全局 `fetch` 访问网络的 SDK 类消费者同样经过代理。

本包同时承载该接缝的 Definition 与 Provider：本地传输只有一个（Node HTTP 栈），不存在需要选择的提供方注册表，两个角色无法独立演化。直接消费者为 `dsh-llm-deepseek`、`dsh-llm-pi-ai`（目录发现）以及各 `dsh-web-*` 提供方；pi-ai 库的对话流式请求使用全局 `fetch`，由进程级 dispatcher 覆盖。

## 代理

当配置了代理时，传输层会对每一个对外请求应用 HTTP(S) 代理。代理是叠加在本插件组合入口之上的持久化 `http:` 用户设置段，因此在 Network 设置页写入的变更无需重启即可作用于下一个请求。

- 代理 URL 使用 `http:` 或 `https:`；不支持 SOCKS。
- 为空或不填即禁用代理。
- URL 可携带凭据（`http://user:pass@host:port`）；它们与该段一同存放在用户自有的设置文档中，且不在设置链路上脱敏。

配置的代理体现为一个 undici `ProxyAgent` dispatcher：在 `fetch` 中按请求应用，同时被安装为进程级 dispatcher，使只知道全局 `fetch` 的 SDK 类消费者同样经过代理。dispatcher 仅在解析后的代理 URL 变化时重建；服务销毁时进程级 dispatcher 会被恢复。

## Config

| 键 | 默认值 | 含义 |
|---|---|---|
| `proxy` | *（未设置）* | 应用于每一个对外请求的 HTTP(S) 代理 URL，例如 `http://127.0.0.1:7890`。 |

不可用的代理（URL 非法或协议不是 `http:`/`https:`）会在加载时响亮失败，并在设置写入时被拒绝。

## 模型体验

间接生效：经由渲染传输失败的消费者——对话适配器、网页抓取与搜索提供方各自拥有模型所见到的请求组装与错误分类。

#### KV Cache 影响

无；传输层不塑造提示词或请求的模型可见内容。

## Known Limitations and Deferred Work

- **所有请求共用一个代理** —— 没有按消费者的代理、按主机绕过或 `NO_PROXY` 列表。需要不同路由的消费者仍保留各自的 `baseURL` 覆盖。
- **不支持 SOCKS** —— 仅接受 `http:`/`https:` 代理 URL。
- **非 `fetch` 的 `pi-ai` 传输不走代理** —— 该库基于 `fetch` 的流（其 OpenAI 兼容对话路径，包括自定义提供方）经进程级 dispatcher 走代理，但它绕过 `fetch` 的传输（Bedrock、Codex WebSocket）仍使用该库自身的环境变量代理处理，而本设置并不写入这些环境变量。
