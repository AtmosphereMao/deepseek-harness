# Agent Note: 手机端侧边栏浮动按钮与抑层抽屉

Status: implemented

[English](2026-08-17-phone-sidebar-floating-control.md) | 中文

## 问题

在手机上，侧边栏在两种折叠状态下都在吞食对话区。展开时，1024px 自动折叠断点以下的重新展开以内联网格列渲染：它把 280px 默认值（或桌面端拖拽出的最多 420px 偏好）交给让步求解器，而求解器的侧边栏轨道从不让步，因此中央区被压缩到 `视口 − 侧边栏` —— 在 375px 屏幕上不足 100px。折叠时，56px 控制栏仍占据一条全高网格轨道，为五个图标花掉了六分之一的视口，而读者只想看对话。

## 决策

在 640px（`SIDEBAR_OVERLAY_BREAKPOINT`）以下，侧边栏**在两种折叠状态下都不占网格轨道**（网格模板的第一条轨道为 0px），因此中央区始终占满视口。AppFrame 在求解之前就判定手机形态，使求解器保持与断点无关，并以 `data-sidebar-floating` / `data-sidebar-overlay` 对外发布。

**折叠 → 一个浮动按钮。** 该列以绝对定位落在中央区前缘角上，宽度为 `SIDEBAR_FLOATING_INSET`（36px）且 `height: auto`，无填充、无边框，因此它只是按钮本身的盒子，周围每一像素仍属于对话。ui-sidebar 在这一状态（`floating && collapsed`）下只渲染单个「打开抽屉」控件而不是控制栏：把控制栏的其余控件画在对话之上正是问题本身，而它们在抽屉里都只差一次点击。该按钮自带静止填充，并把控制栏的鲸鱼/面板图标互换重新挂到 `.floatingToggle` 上——因为这个状态并不携带 `.collapsed` 类。

**展开 → 抽屉。** 重新展开的侧边栏浮动在保持全宽的中央区之上，宽度上限为 `min(偏好, round(视口 × SIDEBAR_OVERLAY_MAX_RATIO))`（0.85），因此桌面端拖出的 420px 偏好不会溢出，且右侧仍留有可点击的遮罩条带。遮罩（复用设置弹窗的 `--dsw-alias-bg-mask-1` + `--dsw-mask-blur`）在点击时通过 `toggleSidebar` 关闭它。两种手机状态都没有拖拽手柄：抽屉宽度是被封顶而非拖拽出来的，而浮动控件也不是列边缘。

从中央区前缘起始的行内装饰否则会被浮动按钮遮住，因此框架仅在控件浮动期间把其宽度以 `--dsh-frame-leading-inset` 发布；对话页头部把它加入自己的前缘内边距。滚动区仍保留全宽——只在唯一会碰撞的那一行预留空间，正是浮动控件比它取代的控制栏轨道更便宜的原因。

`sidebar` owner share 新增 `floating`。`width` 仍然携带渲染宽度（浮动时为该内边距，展开时为封顶后的宽度），因此 ui-workspace 与 `sidebar.workspaces`/`sidebar.settings` 约定均保持不变。

640px 到 1024px 之间的内联行为保持不变：56px 控制栏与 280px 展开轨道都仍能留出可读的中央区。`SIDEBAR_AUTO_COLLAPSE`（1024）以及 `narrow`/`narrowExpanded` 的 store 语义均未改动。

## 考虑过的替代方案

**让脱离文档流的侧边栏继续依赖网格自动布局。** 两种手机状态都需要把侧边栏列脱离文档流（`position: absolute`），中央区才能占满视口；但这同时也把它从网格自动布局中移除，于是其后每个子元素都上移一条轨道：对话落到了 0px 的侧边栏轨道上，详情栏则继承了 `1fr` 的中央轨道——手机上因此渲染出一个满宽的 Details 面板，完全看不到对话。现在三列都显式固定 `grid-column`（1/2/3），使布局与「哪些兄弟节点被定位」无关。jsdom 不应用 CSS module 样式，因此 DOM 测试看不到这个问题；改为由 `app-frame-styles.client.spec.ts` 针对样式表源码断言该固定关系，三条声明中任意一条被移除都会导致其失败。


**在手机上封顶内联宽度。** 264px 拖拽下限已经超过 375px 屏幕的一半，因此足够小到能给中央区留出可读宽度的封顶值必然截断工作区行；内联轨道在低于下限时根本无法工作。

**保留 56px 控制栏，只把展开态做成抽屉。** 这是第一版做法，但它把被反馈的问题原封不动地留下了：在手机常驻的那个状态里，控制栏仍吃掉了 375px 视口的六分之一。

**把浮动按钮渲染在对话页头部。** 它属于侧边栏的折叠状态，放到那里会让 ui-layout 依赖 ui-conversation 的 header slot 并重复一套开关接线。把按钮留在侧边栏列里，它就待在自己的拥有者旁边；跨包的只有一个 CSS 自定义属性。

**在所有窄屏宽度（< 1024px）都用抽屉。** 平板（640–1024px）的内联中央区仍可用（700 − 280 = 420px），且两个窄屏 e2e 场景会在与中央区交互的同时重新打开侧边栏；全覆盖遮罩会在那里阻断这些交互，而对手机并无收益。

**选择会话后自动关闭抽屉。** 这需要把折叠动作穿过 ui-sidebar 与 ui-workspace 传入 `sidebar.workspaces` 约定；遮罩与折叠按钮已经能关闭它，因此暂缓。

## 后果

- 手机在两种折叠状态下都保持全宽对话；关闭时只花一个 36px 按钮，打开时则是标准的抽屉 + 遮罩模式。
- 抽屉在导航后不会自动关闭；由遮罩或折叠按钮关闭（已在 README 的已知限制中记录）。
- 三个布局常量（`SIDEBAR_OVERLAY_BREAKPOINT`、`SIDEBAR_OVERLAY_MAX_RATIO`、`SIDEBAR_FLOATING_INSET`）位于 columns.ts；让步求解器保持与断点无关。
- 跨包边界只新增了一个可叠加的约定字段（`SidebarOwnerProps.floating`）和一个 CSS 自定义属性（`--dsh-frame-leading-inset`，非手机下不设置，因此桌面几何完全一致）。
- 手机折叠态有意不展示 New Session、搜索或设置控件；三者在抽屉里都只差一次点击。

## 测试

`app-frame.client.spec.tsx` 在抽屉的 describe 块旁新增了浮动控件 describe 块：手机挂载时侧边栏轨道为 0px、携带 `data-sidebar-floating`、无遮罩也无拖拽手柄，owner share 为 `{ collapsed: true, width: 36, floating: true }`；前缘内边距仅在控件浮动期间发布（抽屉遮住头部后即撤销）；700px 平板保持内联控制栏且无内边距；手机变宽越过断点后恢复控制栏轨道。抽屉的测试现在断言关闭后回到浮动控件而不是 56px 控制栏。

`sidebar-root.client.spec.tsx` 新增手机 describe 块：浮动态只渲染恰好一个按钮（经 `toggleSidebar` 路由），无 New Session 胶囊也无区域/设置/页脚 seat；仍处浮动态下打开后恢复完整宽外壳；而折叠但非浮动时保留内联控制栏的控件。`sidebar-styles.client.spec.ts` 覆盖浮动按钮自带的填充与重新挂接的图标互换。
