# `agent/room-mvp-demo` 与 `room-mvp-demo-4` 分支对比及合并建议

> 对比日期：2026-07-31
> 对比基准：本地分支已与对应远程分支同步
> `agent/room-mvp-demo`：`ffcd1a9`
> `room-mvp-demo-4`：`053eec4`

## 1. 结论摘要

两条分支从同一个提交 `426a535` 分叉，但发展方向互补：

- `agent/room-mvp-demo` 完成了“把真实简历、PDF、网页交给 Agent，生成可编辑个人世界”的产品输入链路。
- `room-mvp-demo-4` 完成了“使用 Mardou 博物馆 GLB 呈现内容，并提供入场动画、第一人称移动和楼梯上二楼”的空间体验链路。

推荐以 `room-mvp-demo-4` 作为合并目标和 3D 运行时底座，再把 `agent/room-mvp-demo` 的解析、配置、编辑和来源追溯能力移植进来。不要在冲突中整文件选择 `ours` 或 `theirs`：`RoomStudio.tsx` 和 `WorldCanvas.tsx` 都包含两边不可替代的能力，必须按职责手工整合。

建议的最终产品形态是：

1. 保留 Mardou 博物馆、入场动线、WASD、楼梯和二楼私密展区。
2. 恢复浏览器 Agent 配置、PDF/图片/网页解析、Han Chen 预编译示例与来源证据。
3. 恢复项目内容编辑和来源浏览器，但使用 Mardou 的项目展岛与语义化物件展示。
4. 合并两边的编排规则：保留 Agent 分支的数据去重与溢出布局，同时保留 Mardou 分支的楼层坐标、入口 Portal 和作品信息面。

## 2. 分支关系与差异规模

共同祖先：

```text
426a535 Advance dynamic portfolio world
├─ agent/room-mvp-demo
│  ├─ dc882e0 Build editable agent-parsed portfolio world
│  └─ ffcd1a9 Add browser Agent provider setup
└─ room-mvp-demo-4
   ├─ ac677d2 Integrate Mardou museum scene and placements
   ├─ 963740b 入场效果
   └─ 053eec4 添加第一人称移动与楼梯上楼交互
```

分叉后的提交数：Agent 分支 2 个，Mardou 分支 3 个。两边都没有包含另一边的提交，不能直接快进合并。

相对于共同祖先：

| 指标 | `agent/room-mvp-demo` | `room-mvp-demo-4` |
| --- | ---: | ---: |
| 独有提交 | 2 | 3 |
| 涉及文件 | 41 | 17 |
| 新增行 | 5,247 | 2,227 |
| 删除行 | 410 | 467 |
| 主要方向 | Agent 解析、配置、编辑、来源追溯 | GLB 博物馆、空间布局、相机与移动 |

直接比较两个分支，共有 53 个文件不同，差异约为 2,481 行新增、5,558 行删除。这个数字主要反映两条分支各自新增了另一边没有的完整功能，不应理解为 Mardou 分支有意删除了 Agent 能力。

两边相对共同祖先同时修改的文件只有 5 个：

- `components/RoomStudio.tsx`
- `components/WorldCanvas.tsx`
- `lib/agents/orchestrator.ts`
- `package.json`
- `tests/pipeline.test.ts`

## 3. 产品能力对比

| 领域 | `agent/room-mvp-demo` | `room-mvp-demo-4` | 合并建议 |
| --- | --- | --- | --- |
| 产品入口 | 支持 Agent 服务配置、预编译 Han Chen 示例、真实资料导入 | 保留简单示例简历和传统导入入口 | 采用 Agent 入口流程，并接入 Mardou 加载页 |
| 输入格式 | 文本、PDF、图片、常见文本/网页格式 | TXT、Markdown、HTML；界面提示 PDF 后续支持 | 保留 Agent 分支的完整输入能力 |
| 网页资料 | 受保护的公开网页抓取，并可启动独立 Website Agent | 基础 `/api/extract` 直接抓取 | 采用 Agent 分支的 `public-web` 安全实现和并发 Website Agent |
| Agent 配置 | 浏览器会话配置、MAAS/智增增预设、服务端环境变量回退 | 无配置对话框 | 完整保留 Agent 配置，密钥继续只放 `sessionStorage` |
| 解析管线 | `compileProfile`、并行 PDF 分片、证据合并、个人网站补全 | `runPipeline` 的确定性本地解析 | 主路径采用 Agent；保留本地解析作为无服务降级路径更稳妥 |
| 默认数据 | 完整 Han Chen 预编译 Profile | 中文示例简历 | Han Chen 作为“一键体验”，中文简历作为开发/降级样例 |
| 3D 建筑 | 通用 authored room/villa 和房门体系 | Mardou Museum GLB | 采用 Mardou GLB |
| 空间导航 | 通用相机转场、门和房间切换 | 长走廊入场动画、第一人称 WASD、碰撞、楼梯点击、二楼路径 | 采用 Mardou 相机和导航体系 |
| 项目展示 | 电脑屏幕式项目台、分页、封面编辑 | 低矮圆形项目展岛与图片卡 | 保留 Agent 编辑能力，外观采用 Mardou 展岛 |
| 信息展示 | 画框式信息墙、来源终端 | 资料柱、实物、时间线、工具柜等语义化物件 | 使用 Mardou 物件；把来源终端作为一个语义化实物恢复 |
| 人物角 | 桌面肖像 | 人物与宠物微缩场景 | 采用 Mardou 人物角，沿用 Agent 分支的证据与素材选择规则 |
| 私密空间 | 独立卧室，身份密码、日记权限 | 博物馆二楼私密展区，身份密码、日记权限 | 采用二楼空间，保留原权限模型与浏览器本地存储 |
| 内容编辑 | 项目标题、摘要、封面本地编辑 | 没有项目编辑链路 | 恢复 Agent 编辑逻辑，不改变 Mardou 摆位 |
| 来源追溯 | 项目/条目来源链接、来源浏览器终端 | 详情中保留基本证据，但无来源终端 | 恢复来源浏览器和完整链接集合 |
| 场景 QA | 通用加载失败、纹理资源生命周期测试 | Mardou 坐标、净空、相机路径审计 | 两套 QA 都保留 |

## 4. `agent/room-mvp-demo` 的主要新增内容

### 4.1 Agent 解析与配置

- 新增 `/api/parse`，支持模型驱动的简历与网站解析。
- 新增 `/api/config`，只返回服务可用状态，不暴露服务端密钥。
- 新增 `AgentSetupDialog`，允许用户在当前标签页配置 Provider、Base URL、模型和密钥。
- 浏览器密钥保存在 `sessionStorage`，页面会话结束后清除，不写入仓库或 `localStorage`。
- 支持主简历 Agent 与独立 Website Agent；识别到个人主页后，网站解析可以和简历剩余分片并行执行。
- 新增 `.env.example`、Provider 默认值和部署侧环境变量回退。

### 4.2 资料输入与证据管线

- 新增 PDF 预解析和 `unpdf` 依赖，保留页码、链接与文本证据。
- 支持图片、PDF、文本和网页数据上传。
- 新增 Profile Agent、Profile 合并、公共网页安全抓取和项目编辑模块。
- 新增 Han Chen 的预编译示例 Profile，可在没有 Agent 配置时直接体验完整世界。
- `compileProfile` 可从已经生成的 `ParsedProfile` 继续编排，避免再次用本地解析器处理 Agent 结果。

### 4.3 前端产品能力

- `RoomStudio` 增加服务配置、文件处理、解析进度、项目编辑、封面压缩和来源链接集合。
- `WorldCanvas` 增加来源浏览器终端和项目电脑屏幕展示。
- 新增资源加载失败与纹理生命周期管理测试，弱网或坏资源时能进入 degraded 状态而不是一直卡在 loading。

## 5. `room-mvp-demo-4` 的主要新增内容

### 5.1 Mardou 博物馆

- 引入 `MardouMuseumResult.glb`，并通过 `MardouMuseumScene` 加载真实博物馆结构。
- 新增 `MardouMuseumLayout`，集中维护展品、信息物件、相机和路径坐标。
- 将项目台改为低矮圆形展岛，将信息内容改为资料柱、实物、时间线、工具柜等语义化物件。
- 人物角改为人物/宠物微缩场景，留言板和日记保持家具化表达。

### 5.2 入场、移动与楼层

- 默认从馆内长走廊开始，按校准路径缓慢进入一楼默认机位。
- 新增第一人称 WASD 移动、水平朝向移动、场景边界和墙体射线碰撞。
- 聚焦展品或播放相机路线时暂停自由移动，避免状态冲突。
- 点击楼梯打开二楼身份验证，通过后进入二楼私密展区，并可返回主展厅。
- 增加透明、独立的楼梯点击体，避免必须精确点击复杂 GLB 网格。

### 5.3 坐标与场景审计

- 新增独立 GLB 坐标拾取工具。
- 新增 `audit-mardou-layout.mjs`，检查地板支撑、结构净空、相机路径和入口通行性。
- 测试脚本会先运行 Mardou 布局审计，再执行管线测试、构建和服务端渲染测试。

## 6. 合并冲突模拟结果

使用下面的只读模拟进行检查：

```bash
git merge-tree --write-tree room-mvp-demo-4 agent/room-mvp-demo
```

Git 报告 3 个明确的文本冲突：

### 6.1 `components/RoomStudio.tsx` — 高风险

两边都大幅修改了同一个顶层状态组件。

Agent 分支需要保留的内容：

- `compileProfile` 与 Agent 解析请求。
- `AgentSetupDialog`、浏览器会话 Provider 配置和服务可用状态。
- Han Chen 预编译 Profile。
- PDF/图片/网页导入。
- 项目本地编辑、封面缩放和来源链接。
- 来源浏览器详情。

Mardou 分支需要保留的内容：

- `sceneReady` 与入场动画的协调。
- 一楼/二楼的导航文案与状态。
- “二层私密展区”的门禁语义。
- 传给 `WorldCanvas` 的 Mardou 场景状态和楼层行为。

建议：以 Mardou 版本的房间、相机和画布接口为结构底座，逐块移植 Agent 分支的输入与编辑状态。不要直接用 Agent 版本覆盖整个文件，否则会丢失入场和楼层体验；也不要直接保留 Mardou 版本，否则会丢失真实 Agent 产品入口。

### 6.2 `components/WorldCanvas.tsx` — 最高风险

这是合并中最需要人工设计的文件。两边都重写了相机、展品和场景树，但目标不同。

Agent 分支的关键内容：

- 通用 authored room/villa、房门和旧相机路线。
- 项目电脑屏幕、来源浏览器终端。
- 通用信息画框和资源加载韧性。

Mardou 分支的关键内容：

- `MardouMuseumScene` 与 `MardouMuseumLayout`。
- 入场路径和 `sceneReady` 控制。
- WASD、碰撞、楼梯点击体和楼层相机路线。
- 圆形项目展岛、语义化信息物件、人物/宠物微缩场景。

建议：保留 Mardou 版本的 `CameraRig`、场景根节点和展品几何；从 Agent 版本移植来源浏览器、项目编辑后的媒体/文本读取，以及仍有价值的加载错误处理。不要恢复 `VillaExterior`、旧 `RoomDoor` 和旧相机控制，否则会和 GLB 建筑及第一人称控制重复。

### 6.3 `package.json` — 中风险

Agent 分支新增：

- `unpdf`
- `eval:parser`
- 全量 `tests/*.test.ts` 测试方式

Mardou 分支新增：

- `audit-mardou-layout.mjs`
- Mardou 专用测试顺序

建议使用依赖与脚本并集：保留 `unpdf` 和 `eval:parser`，同时先运行 Mardou 审计，再运行全部测试。推荐脚本：

```json
"test": "node scripts/audit-mardou-layout.mjs && node --test tests/*.test.ts && npm run build && node --test tests/rendered-html.test.mjs"
```

手工解决 `package.json` 后应重新运行 `npm install` 生成一致的 `package-lock.json`，不要仅依赖 Git 对 lockfile 的自动合并结果。

## 7. 虽可自动合并、仍需人工复核的文件

### `lib/agents/orchestrator.ts`

Git 可以自动合并，但两边都改变了世界语义：

- Agent 分支增加 source item 去重和大量非项目内容的溢出安全布局。
- Mardou 分支把私密空间移动到二楼，增加室外入口 Portal，并新增作品信息面。

最终版本应同时保留：

- Agent 的去重逻辑。
- Agent 的内容量溢出策略，但坐标必须重新适配 Mardou 可用区域，不能直接沿用旧 villa 坐标。
- Mardou 的二楼 `room-private` 坐标。
- `portal-entrance` 与楼梯 Portal。
- `showroom-works` 作品信息面。

### `tests/pipeline.test.ts`

两边分别为 Agent 编排和 Mardou 空间增加断言。自动合并后要检查断言是否仍表达最终架构，不应为了通过测试删除任何一边的核心覆盖。

### `lib/agents/pipeline.ts`

Agent 分支增加了 `compileProfile`，Mardou 分支仍只暴露 `runPipeline`。最终应保留两者：

- `runPipeline(text)` 用于本地、无模型的降级解析。
- `compileProfile(profile)` 用于 Agent 已经生成结构化 Profile 后的编排。

### `/api/extract` 与网页安全模块

建议采用 Agent 分支的 `public-web` 封装。它对协议、凭据、私网/保留地址、端口、重定向和响应体大小有更完整的控制。合并后应避免回退到仅检查初始 hostname 的简单实现。

## 8. 资源与仓库体积风险

Mardou 分支提交了两份完全相同的 GLB：

| 路径 | 大小 |
| --- | ---: |
| `public/vendor/mardou/MardouMuseumResult.glb` | 27,759,336 bytes |
| `tools/mardou-museum-picker/model/MardouMuseumResult.glb` | 27,759,336 bytes |

两份合计约 55.5 MB。合并不受影响，但后续建议让坐标拾取工具复用 `public/vendor/mardou` 下的模型，或把开发工具模型改为可下载/可生成资源，避免仓库永久保存重复二进制对象。

## 9. 当前测试状态

### `agent/room-mvp-demo` (`ffcd1a9`)

在独立临时 worktree 中执行了干净安装和完整验证：

- `npm ci`：成功。
- `node --test tests/*.test.ts`：127 项通过，0 项失败。
- 生产构建：成功。
- 服务端渲染测试：1 项通过。
- ESLint：成功。

安装阶段的 `npm audit` 摘要为 17 个依赖漏洞（1 low、4 moderate、12 high）。这并不表示均由本分支新增，但合并后需要单独审计直接依赖和可升级范围，不建议直接执行带 breaking change 的 `npm audit fix --force`。

### `room-mvp-demo-4` (`053eec4`)

该提交已完成：

- Mardou 坐标与相机路线审计：通过。
- 单元/管线测试：39 项通过。
- 服务端渲染测试：1 项通过。
- 生产构建：成功。
- ESLint：成功。
- 浏览器人工验证：WASD 移动、楼梯点击、身份验证和进入二楼均通过。

两边构建均提示客户端 chunk 超过 500 kB。加入约 27.8 MB 的 GLB 后，应在合并验收中继续关注首次加载时间、移动端内存和资源缓存策略。

## 10. 推荐合并顺序

建议不要直接在当前有未提交文件的工作区中合并。使用新的 integration 分支和独立 worktree：

```bash
git fetch origin
git branch integration/agent-mardou room-mvp-demo-4
git worktree add ../ROOM-agent-mardou integration/agent-mardou
cd ../ROOM-agent-mardou
git merge --no-commit --no-ff agent/room-mvp-demo
```

然后按下面顺序处理：

1. 先合并 `package.json`，取依赖与脚本并集，运行 `npm install` 更新 lockfile。
2. 保留 Agent 新增且 Mardou 未修改的文件，包括 API、Provider、Profile Agent、PDF、编辑和测试模块。
3. 合并 `pipeline.ts` 与 `orchestrator.ts`，先让数据层测试通过。
4. 以 Mardou `WorldCanvas.tsx` 为底座，移植来源终端、项目编辑数据和加载韧性。
5. 以 Mardou 的房间/画布接口为底座合并 `RoomStudio.tsx`，接回 Agent 配置和导入流程。
6. 合并 CSS，检查 Agent 配置弹窗、入口页、详情面板和 Mardou 画布的层级与响应式布局。
7. 更新 README，把产品入口说明改为“Agent 导入后进入 Mardou 博物馆”。
8. 执行完整自动测试和浏览器验收，再提交 merge commit。

## 11. 合并后的必测清单

### 数据与 Agent

- 没有配置 API Key 时，Han Chen 预编译示例可直接进入。
- 浏览器配置只写入 `sessionStorage`，请求和日志不泄漏密钥。
- 文本、PDF、图片和网页导入都能生成 Profile。
- 独立 Website Agent 能和简历分片并行，并正确合并证据。
- 公共网页与图片代理继续拦截 localhost、私网、保留地址、凭据 URL 和危险重定向。
- 项目标题、摘要和封面编辑后，Mardou 展岛即时更新且来源证据不丢失。

### Mardou 场景

- 首次进入从长走廊起点开始，完整播放到一楼默认机位。
- WASD 与鼠标环视方向一致，墙体、边界和展品附近不会穿模。
- 聚焦详情时不会继续移动；关闭详情后恢复自由移动。
- 楼梯点击范围合理，不遮挡附近展品点击。
- 二楼身份验证、日记读写权限、返回主展厅均正确。
- 项目数、信息面数量变化后，没有悬空、重叠或阻塞主通道。

### 工程质量

- `npm ci`
- `npm test`
- `npm run lint`
- Agent 的 127 项测试与 Mardou 布局审计都在统一测试脚本中执行。
- 浏览器检查桌面端和移动端加载；记录 GLB 下载体积、首屏耗时和峰值内存。
- 检查构建 chunk 警告，必要时将重型解析/编辑 UI 和 3D 场景进一步动态拆分。

## 12. 最终建议

这次合并不是简单的“功能分支叠加”，而是把数据产品层与空间体验层接在一起。最稳妥的原则是：

- 数据输入、Agent 配置、解析、证据、编辑能力以 `agent/room-mvp-demo` 为准。
- 建筑、坐标、相机、移动、展品造型、楼层导航以 `room-mvp-demo-4` 为准。
- `RoomStudio` 负责产品状态编排，`WorldCanvas` 负责 Mardou 空间渲染；合并时应顺便强化这条边界，减少以后两条能力线再次在同一大文件中冲突。

按这个策略合并，可以同时保住两边已经验证过的核心成果，并把最高风险集中在两个组件的可控手工整合上。
