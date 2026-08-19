# Agent Note: 纯文本模型通过占位符回退接受图片块

Status: implemented

[English](2026-08-19-text-only-image-placeholder-fallback.md) | 中文

## Problem

纯文本路由（DeepSeek chat-completions 适配器声明 `inputModalities: ['text']`）在准入阶段拒绝所有带图提示：`session.selectModel` 在仍有图片可见时拒绝切换到纯文本目标，提示准入返回 `MODEL_DOES_NOT_SUPPORT_IMAGES`。此类路由上的用户完全无法上传图片，即便可以通过子代理触达具备视觉能力的模型。

## Decision

在所有路由上接受图片块，由传输适配器决定如何携带。DeepSeek 序列化器不再抛出 `UNSUPPORTED_CONTENT`；它把每个图片块替换为文本占位符 `[image attached: <名称或媒体类型> (attachmentId: <id>)]`，让纯文本模型知道存在图片并能按 id 引用。子代理委托工具（`tool-subagent`）新增可选参数 `image_attachment_ids`：它在调用方会话日志中把每个 id 解析为持久化图片块，并将这些块注入子代理提示，具备视觉能力的子代理（例如声明了 `input: [text, image]` 的 pi-ai）会把它们渲染为真实图片内容。

持久化日志仍然记录图片块；占位符是序列化期的变换，因此「模型可见 ⟺ 已入日志」规则依然成立。api-proxy 保留 `serializeImageAdmission` 链作为图片准入的排序边界，尽管其模态拒绝的初衷已经消失。

## Alternatives considered

- **在主模型上声明 `input: [text, image]` 并发送 base64** — 图片直达主模型，但 DeepSeek chat-completions 传输是纯文本，会拒绝字节；这只适用于 pi-ai 路由，而非默认的 DeepSeek 路由。
- **在主代理上增加专用 `describe_image` 工具** — 该工具运行在纯文本代理的上下文中，无法把图片放到一个看不见图片的模型面前；仍然需要一个视觉子代理。
- **让 fork 子代理继承上传的图片** — fork 种子止于最后一个 `turn/end`，而上传的图片位于 `turn/start` 之后的在途轮次内，种子无法携带它而不重放一个不平衡的轮次。
- **修改 fork 种子以包含当前用户消息** — 会扩大每个 fork 的语义并重放一个未闭合的 `turn/start`，是不变量改动过大，超出本功能所需。

## Consequences

文本路由现在可能在持久化历史中携带图片块；序列化器从不向纯文本传输发送图片字节。`image_attachment_ids` 出现在 `subagent` 与 `subagent_fork` 工具模式中，因此所有固定工具目录的无密钥快照均已刷新。视觉子代理仍需要一段把 `tool-subagent` 接到视觉模型的组合配置（`agentOptions.provider`/`model`），并在该模型上声明 `input: [text, image]`。ACP 的入站图片门禁仍是严格的纯文本拒绝；将其放宽到与 Web 路径一致是另一项改动。

## Related

- [Atomic Web image admission](../bug-fix/2026-07-29-atomic-web-image-admission.md) — 本改动保留的排序链；其纯文本拒绝在此移除。
- [pi-ai route default input modalities](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md) — 视觉子代理的 `input` 声明如何解析。
