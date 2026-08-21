# Agent Note: 图片委派由提供方能力把关，并写进提示词

Status: implemented

[English](2026-08-20-subagent-image-delegation-gate.md) | 中文

## 问题

[纯文本路由的图片占位符回退](../feature/2026-08-19-text-only-image-placeholder-fallback.md) 已经建好整条委派链路——纯文本路由把每张图片序列化为 `[image attached: … (attachmentId: …)]`，而 `tool-subagent` 的 `image_attachment_ids` 会把这些 id 还原成持久化图片块交给子 agent；[子代理模型选择器](../feature/2026-08-19-subagent-model-selector.md) 又让用户能从输入框把这个子 agent 指向视觉路由。机制本身是通的，但用户问"图片里有什么"时会话依然走进死路：模型读到占位符，调用 `read_image`，收到 `switch to an image-capable model to read images`，于是让用户去换模型。attachmentId 和委派工具就在同一个请求里，它却没有把两者联系起来——因为没有任何模型可见的文字说明占位符是可以委派的。`image_attachment_ids` 的参数描述点明了语法，但模型只有在已经决定调用该工具之后才会去读参数描述。

同一处还破坏了 seam 自己的"明确失败、绝不静默降级"规则。图片投递当时不是一项已声明的能力，`assertCapabilities` 无从检查：`subagent-acp` 的 `toAcpPrompt` 会把所有非文本块直接丢弃，而 Codex 与 Claude Code 的任务构建器则从提供方内部抛出笼统的"必须只含文本块"。上一条 Note 已把 ACP 的丢弃记为待单独修复的不对称。

## 决定

**`SubagentCapabilities` 新增 `imagePrompt`，服务据提示词内容检查它。** 该 flag 表示提供方会把非文本块原样送达子 agent。`assertCapabilities` 增加 `{ when: request.prompt.some(block => block.type === 'image'), cap: 'imagePrompt' }`，因此指向纯文本通道的带图片提示词会在 `start` 处以 `UNSUPPORTED_CAPABILITY` 被拒绝，而不是丢掉图片后照样送达。这个 flag 以 `prompt` 内容而非某个具名选项为依据——这是它在同族 flag 中唯一的不对称，已在声明处写明；把它做成能力而不是提供方内部抛错，是因为工具层需要在派发之前就能问出答案。

进程内提供方（`spawn`、`fork`）声明 `imagePrompt: true`，因为它们把 `request.prompt` 原样交给子 agent。所有跨进程后端通过共享的 `NO_START_CAPABILITIES` 声明 `false`；ACP 现在改用该共享常量，替换它原先的内联字面量——正是那份字面量与共享常量脱节，才让 ACP 的丢弃在上一次改动中存活下来。

**该能力不只决定服务允许什么，还决定告诉模型什么。** 只有当挂载的提供方声明 `imagePrompt` 时，`image_attachment_ids` 才出现在工具 schema 中；在纯文本实例上强行传入该键会在 `execute` 中被拒绝——schema 省略只是"广告"，因此退出开关同样需要执行期强制，这与 `run_in_background` 已有的立场一致。`tool:<toolName>` 提示词 section 原先仅在可继续后台模式下注册，现在始终注册，并按实例应得的内容组装子句；`imagePrompt` 提供方会追加一条，告诉模型占位符承载着它看不到的图片、应把 id 作为 `image_attachment_ids` 传出，并转述子 agent 的答复，而不是猜测或要求用户切换模型。

**`read_image` 的拒绝文案优先指向委派。** 现在读作 `does not declare image input. To look at this image, delegate to a subagent on an image-capable model … Otherwise switch this session to an image-capable model.` 严格的路由闸门本身未变：纯文本路由依然绝不会把图片块写入自己的历史。

## 考虑过的替代方案

- **专用的自动委派工具（`describe_image`），内部启动视觉子 agent**——一次调用、确定性高、不依赖模型把两个事实联系起来。作为第一步被否决：它要新增一个包、一份工具 schema，以及第二条委派路径，而后者与 `read_image`、`subagent` 的职责边界还需要解释，只为解决一个实际上属于"缺少指引"的问题。触发本 Note 的那段对话表明模型本就*想*看这张图，且手上具备全部手段；它需要的是被告知，而不是被绕开。如果指引在实践中被证明不可靠，它仍是兜底方案，本次改动不阻碍它。
- **以 `inheritsParentContext === false` 为指引的判据**——最初的做法，且是错的：ACP、Codex、Claude Code 与 SDK 提供方全都声明 `false`，却都不承载图片，因此指引会在 `start` 现已拒绝的提供方上宣传委派。正是发现既有 flag 无法表达"承载图片"，才催生了 `imagePrompt`。
- **仅把指引留在 `subagent` 工具描述里**——比提示词 section 便宜，而且本就部分存在；但工具描述是在工具被选中之后才读到的，而这一步恰恰从未发生。现在两处都写了，其中提示词 section 才是能触达尚在决策中的模型的那一处。
- **让各提供方继续对非文本块抛错**——无需新能力，Codex 本就如此。否决理由：失败发生在工具调用已被记录之后，报错指向提供方内部的任务构建器而非调用方所做的选择，而且工具无法省略一个它无从检测的参数。
- **所有委派工具共用一个提示词 section**——可避免图片子句按每个具备能力的工具重复一次（`subagent` 与 `subagent_fork` 都会带上）。否决理由：section 名称按注册唯一，且每个实例拥有各自的工具名，而子句必须点名该工具才具备可执行性；改为收紧子句本身。

## 影响

`SubagentCapabilities` 新增了必填成员，因此每个提供方、测试替身以及工具目录生成器都要声明它——编译器点出了全部 55 处，这正是"明确失败"立场在按预期工作。基于跨进程提供方的组合会让该工具的 schema 失去 `image_attachment_ids`；`product-subagent-codex` 精确锁定了这一点：参数在 `subagent`/`subagent_fork` 上存在，在 `subagent_codex` 上缺失。

图片子句按每个具备能力的委派工具各输出一次，因此同时加载 `subagent` 与 `subagent_fork` 的组合会付两份。这是实打实的提示词成本，之所以接受，是因为子句必须点名它所属的工具。

视觉子 agent 仍需一条声明了 `image` 输入的路由。这是目前最锋利的边角，且属于配置而非代码：按 [pi-ai 路由默认输入模态](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md)，模态的解析顺序为条目 `input` → 已安装 catalog → 路由 `defaultInput` → `[text]`，因此手工声明的提供方若其模型条目只写了 `id`，就会被报告为纯文本。这样的子 agent 收到的是占位符而非像素，并回答自己看不到图片——委派成功了却什么有用信息都没带回，看起来像 harness 故障，实则只差一行 `input: [text, image]`。harness 无法自行检测：没有任何 OpenAI 兼容端点会报告自己的模态。

## 测试

`tool-subagent.spec.ts` 覆盖三项新决定：纯文本提供方上 schema 省略 `image_attachment_ids`、该情形下 `execute` 拒绝强行传入的键，以及提示词 section 仅在提供方声明 `imagePrompt` 时携带图片子句。`service.spec.ts` 在既有的能力拒绝表中追加一条带图片的提示词，证明 seam 会在 `start` 之前拒绝。`read-image.spec.ts` 锁定点明委派的拒绝文案。四个提供方测试套件各自断言其声明的能力集合，因此某个提供方悄悄改动该 flag 会导致失败。

无密钥快照承载了组装后的结果：录制的系统提示词显示子句点名了每个具备能力的工具，而 codex 场景证明不具备能力的提供方既不宣传参数也不给出指引。

## 相关

- [纯文本模型通过占位符回退接受图片块](../feature/2026-08-19-text-only-image-placeholder-fallback.md)——搭好了本次让其可达的链路；它遗留的 ACP 入站图片不对称在此收口。
- [输入框子代理模型选择器](../feature/2026-08-19-subagent-model-selector.md)——按会话把子 agent 指向视觉路由。
- [pi-ai 路由默认输入模态](../architecture/2026-08-12-pi-ai-route-default-input-modalities.md)——未声明的模型为何是纯文本，以及修复它的那一行。
- [基于既有 seam 的最小 read_image 工具](../feature/2026-08-10-minimal-read-image-tool.md)——它推迟的委派查看方案，如今由其拒绝文案点名。
