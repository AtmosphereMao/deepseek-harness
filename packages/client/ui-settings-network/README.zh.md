# @deepseek-ai/dsh-client-ui-settings-network

[English](README.md) | 中文

Network 设置页：一个 HTTP(S) 代理字段，写入由 Host 侧 [`@deepseek-ai/dsh-http`](../../http/http/README.zh.md) 所拥有的 `http` 设置命名空间。本包只拥有页面本身——字段、文案与写入路径——不拥有传输行为。

字段实时生效：一次已提交的变更会作用于下一个对外请求（DeepSeek 对话适配器、网页抓取、网页搜索），无需重启。清除操作会让字段回退为继承组合默认值。

## 模型体验

无：该浏览器端设置页不注册任何模型界面；它只是经由 http 设置作用域写入一个代理字段。

#### KV Cache 影响

无；代理值不会进入任何提示词、消息、工具 schema 或模型可见结果。

## Known Limitations and Deferred Work

- **不校验连通性** —— 页面接受任意 `http://`/`https://` URL，由传输层在下一次请求时暴露失败；页面本身不会探测代理。
- **无按消费者的路由** —— 所有对外请求共用一个代理（见传输层自身的限制）。
