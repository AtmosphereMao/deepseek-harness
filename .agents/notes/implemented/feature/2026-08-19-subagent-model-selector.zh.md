# Agent Note: 聊天框子代理模型选择器

Status: implemented

中文 | [English](2026-08-19-subagent-model-selector.md)

## Problem

子代理的模型路由此前由 `tool-subagent` 的 `agentOptions` 按组合固定，没有按会话选择的能力。纯文本主模型（DeepSeek chat-completions）无法识图，因此识图被委托给具备视觉能力的子代理；用户需要像选择主模型一样，在聊天框里选择该子代理的模型，而不是使用组合写死的那条路由。

## Decision

按会话的子代理模型选择与既有的主模型选择并列存在。api-proxy 维护一个 `WeakMap<Agent, SubagentModelSelectionRef>`（`subagentSelectionFor`），通过 `dsh-agent` 的 `installSubagentModelSelection`/`subagentModelOf` 安装到代理的作用域上下文上。`tool-subagent` 在派生子代理时读取 `subagentModelOf(parent.ctx)`，一旦存在选择，就覆盖 `agentOptions.provider`/`model`，同时仍继承组合的 `maxTokens`；没有选择（或为 `null`）时保持组合的 `agentOptions` 不变。

线上新增 `session.selectSubagentModel`（通过 `ctx.llm.resolveCallConfig` 解析路由，然后记录选择；不保存为默认，不序列化图像准入），并在 `session.models` 上新增 `subagent: ModelSelection | null` 字段。聊天框的 `conversation.input.model` 座位在「模型」与「推理等级」之间新增「子代理模型」面板，通过同一个按会话的 `ModelDirectory` 提交。`/model` 弹窗仍然只编辑主模型。

该选择是进程本地的（与主模型的 `picked` 层级一致）：不保存为部署默认，重启后恢复为继承 `agentOptions`。未挂载 Web 模型界面的部署不会安装任何东西，子代理工具保持其组合配置。

注册表是 `dsh-agent` 中一个以作用域 `Context` 为键的模块级 `WeakMap`，而不是 `ctx.provide` 的服务。兄弟代理继承同一个属主上下文，因此 `ctx.provide('subagentModelSelection')` 会跨兄弟作用域冲突（`service "subagentModelSelection" has been registered at <root>`）；`WeakMap` 绕开了这种作用域共享，并借助返回的清理函数释放条目。

## Alternatives considered

- **在代理作用域上 `ctx.provide` 一个服务** —— 最自然的 Cordis 接缝，但兄弟代理共享根隔离（isolate），第二次 `provide` 同名服务会抛错；已用两个作用域的探针直接实测。`WeakMap` 注册表提供了同样的按代理键控，却没有作用域冲突。
- **像 `session.selectModel` 一样把子代理选择保存为默认** —— 子代理路由是临时性的按会话偏好，而非部署默认；持久化它需要为这个没有跨会话意义的选项额外写一个设置区块，而默认手势已由主模型承载。
- **从 `/model` 弹窗编辑子代理模型** —— 用户要的是聊天框选择器，而且聊天框座位才是逐会话选择模型路由的位置；让这一个弹窗只负责主模型与该界面一致。
- **复用 `installModelSelection` 的提示词组装与请求钩子来管子代理** —— 这些钩子路由的是父代理自身的请求；子代理选择绝不能改动父代理的模型，因此只共享可读引用。

## Consequences

`session.models` 新增了 `subagent`，因此所有带类型的 `SessionsApi` 桩以及回放的 Web fixture 都携带该字段；`ModelDirectory` 状态新增 `subagent`，客户端选择器新增第三个面板。该选择是进程本地的，重启即丢失，与主模型的未挑选层级一致。视觉子代理仍需要组合把 `tool-subagent` 接到具备视觉能力的模型，并在该模型上声明图像输入；选择器只是让用户把这条接线指向另一条本会话可达的路由。

## Related

- [纯文本模型通过占位回退接受图像块](2026-08-19-text-only-image-placeholder-fallback.md) —— 本选择器所路由的视觉子代理委托。
