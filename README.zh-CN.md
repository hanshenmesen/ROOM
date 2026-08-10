# ROOM

[![CI](https://github.com/hanshenmesen/ROOM/actions/workflows/ci.yml/badge.svg)](https://github.com/hanshenmesen/ROOM/actions/workflows/ci.yml)

[English](./README.md) | **简体中文**

> 把个人履历变成一个可以走进去的世界。

ROOM 可以把简历或公开作品集转换成一座可追溯来源、可自由探索的双层 3D 家园。LLM 负责语义提取和受限规划；确定性代码负责验证、冲突审核、世界编译、安全检查、持久化边界和渲染。

## ROOM 能做什么

- 导入简历文本、PDF、图片、Markdown 或公开作品集网址。
- 提取身份、经历、教育、项目、技能、成就、兴趣、联系方式及其来源证据。
- 通过限定在同一站点内的 Tool Agent 研究个人网站。
- 在发布前审核相互冲突或缺乏证据支持的声明。
- 将已验证的 Profile 编译成可漫游的 Mardou 博物馆，包含项目岛、展品、来源档案和私密二层空间。
- 查看经过脱敏的 Agent Trace、重试、Token 用量、延迟、Artifact 和预估成本。
- 向场景中的漫游 Companion 提问，获得基于 Profile 且带有已验证引用的回答，并可启用实时语音。
- 无需配置 API Key，直接进入内置的虚构人物林澈 Demo。

## 快速开始

环境要求：Node.js `>=22.13.0` 和 npm。

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

- 选择虚构 Demo，可以立即探索且不会发起模型调用。
- 如需导入真实简历或作品集，请打开 **配置解析服务** 并配置 Provider。
- 发布修改前运行 `npm test`；它会执行布局与素材审计、单元与安全测试、生产构建和服务端渲染检查。

## 模型 Provider 配置

ROOM 支持两种配置方式。浏览器会话配置会优先用于该访客的请求；没有浏览器配置时，服务端使用环境变量。

### 访客自定义 Provider

在设置对话框中选择 **自定义 Provider**，然后填写：

| 字段 | 含义 |
| --- | --- |
| API 协议 | `Anthropic Messages` 或 `OpenAI Chat Completions` |
| Base URL | 可公开访问的 HTTPS Provider 根地址，可以已经包含 `/v1` |
| Model | 上游使用的准确模型标识 |
| API Key | 对应 Provider 的访问凭证 |
| 认证方式 | OpenAI 兼容网关可选择 `Authorization: Bearer` 或 `api-key` |
| `x-maas-user-email` | 可选的固定企业审计字段值 |
| `x-maas-app-id` | 可选的固定应用标识 |

Anthropic Messages 协议会调用 `/v1/messages`，OpenAI Chat Completions 协议会调用 `/v1/chat/completions`。ROOM 不会重复拼接 `/v1`，也不允许访客自定义任意 Header 名称。

访客配置只保存在当前标签页的 `sessionStorage`，不会写入代码仓库或 `localStorage`。由于上游模型请求由 ROOM 服务端代理发起，这些配置仍会经过 ROOM 服务端。请只在可信任的部署上使用该模式，因为部署运营者在技术上可以观察传输中的凭证。

访客填写的 Provider 必须是可以公开解析的 HTTPS 地址。URL、重定向和 DNS 校验会拒绝回环、私网、链路本地、保留地址、携带凭证的地址及其他不安全目标。只能在私网访问的网关应由部署方进行受控集成，不能作为任意访客地址使用。

### 服务端配置 Provider

复制仓库中的环境变量模板，并把真实值保存在不受 Git 跟踪的本地环境文件中：

```bash
cp .env.example .env.local
```

最小主 Provider 配置：

```dotenv
MAAS_API_KEY=your-primary-key
MAAS_BASE_URL=https://api.deepseek.com/anthropic
MAAS_MODEL=deepseek-v4-pro
```

还可以配置以下独立能力：

- `WEBSITE_AGENT_*`：独立并发处理个人网站；配置 Key 后，默认使用 DashScope 的公开 Anthropic 兼容端点和 `qwen3.5-plus`。
- `IMAGE_MAAS_*`：生成抽象肖像。
- `PET_QA_*`：处理 Companion 问答。
- `NEXT_PUBLIC_PET_TTS_*`：可选的浏览器可见实时语音配置；这些变量中绝不能放入凭证。
- `INTERNAL_MAAS_*`、`EXTERNAL_MAAS_*` 和 `*_USER_EMAIL`：部署专用的网关预设及审计 Header。

完整配置契约请查看 [.env.example](./.env.example)。内部域名、模型标识、App ID 和凭证不会出现在受 Git 跟踪的默认值中。生产环境应使用部署平台的 Secret 配置相同变量，不要上传 `.env.local`。

### Provider 能力与兼容性说明

| Provider 路由 | 结构化输出 | PDF 与图片处理 |
| --- | --- | --- |
| DeepSeek 官方 Anthropic 端点 | Tool Use，并显式关闭 Thinking | 仅支持文本；PDF 使用本地提取并带行号的文本；不支持图片 |
| 通用 Anthropic 兼容端点 | 根据模式使用 Tool Use 或 JSON Schema | 使用原生 PDF/图片内容块；所选模型必须真正支持这些输入 |
| 访客自定义 OpenAI 兼容端点 | Function Calling | 保守地按纯文本能力处理；PDF 使用本地提取文本 |
| 部署方配置的内部 MAAS | Function Calling，并携带固定 MAAS Header | 除非经过验证的能力表明确支持，否则按纯文本处理 |

文本和 Markdown 可以在所有路由上使用。没有文本层的扫描 PDF 需要支持原生 PDF 或图片输入的 Provider。

协议兼容并不代表 Schema 一定兼容。部分 OpenAI 兼容的 Qwen 部署可以接受请求并返回 `tool_calls`，但会把嵌套对象和数组编码成 JSON 字符串。ROOM 会把这种响应判定为 `invalid_structure`；受限修复重试仍失败后，解析请求会返回 HTTP 502。这不是 API Key 或 Base URL 错误。应改用经过 ROOM 嵌套 Tool Schema 验证的模型，或者增加一个经过审核的兼容适配器，在解析后重新执行全部 Schema 和证据验证。

可以先检查服务端配置的 Provider 目标而不发起模型调用：

```bash
npm run smoke:provider
```

只有在明确接受真实调用和费用时，才执行：

```bash
npm run smoke:provider -- --allow-model-calls
```

Smoke Test 会报告每个目标的 Schema 兼容性、延迟、Token 用量和结构诊断。该 CLI 不读取只存在于浏览器会话中的配置。

## 能力路由

| 能力 | 默认路由 |
| --- | --- |
| 简历和作品集提取 | 主 Provider |
| 个人网站补充 | 主 Provider，或可选的独立 Website Agent |
| 抽象肖像 | 独立图像服务；在支持时可以复用主 Key |
| Companion 问答 | 独立 Pet QA 服务；没有配置时复用主 Provider |
| Companion 语音 | 可选的浏览器实时 TTS 端点，失败后降级到浏览器语音 |

当 Identity 分片发现个人主页时，ROOM 会在剩余简历提取继续进行的同时启动受限的网站准备。模型 Planner 只能选择策略允许且与根站点同域的准确 URL；无效计划会降级为确定性排序。

## Pipeline 工作方式

```text
简历 / PDF / 公开作品集
        ↓
来源预处理与安全限制
        ↓
Identity 与 Inventory Agent ─────→ 受限 Website Research Agent
        ↓                                      ↓
        └──────── 基于证据的 Profile 合并
                               ↓
                        人工冲突审核点
                               ↓
                       已验证 profile.v1
                               ↓
          许可证感知 Creative Retrieval + 确定性编译器
                               ↓
                       已验证 world.v1
                               ↓
                  Three.js Runtime + 受约束 QA
```

原始模型输出不会直接进入 Renderer。每次模型返回都必须通过结构验证、证据验证、规范化和确定性合并规则，才能成为版本化 Artifact。详细说明请查看 [Agent 架构](./docs/ARCHITECTURE.md) 和 [混合 Agent 边界 ADR](./docs/adr/0001-hybrid-agent-boundary.md)。

## 产品与运行时能力

### Agent 系统

- 并行执行 Identity 与 Inventory 提取，并提供受限修复与降级循环。
- 支持分页 PDF 预处理及行号/页码证据定位。
- 使用 Plan → Tool → Observation → Replan 网站研究流程，并限制同域访问和导航预算。
- 基于证据合并声明，并让用户审核高风险冲突。
- 支持取消、共享 Token/成本/时间预算、熔断、有限退避和并发租约。
- 提供脱敏的单次运行 Trace 和跨运行指标，包括模型调用、Tool、重试、延迟、Token 与预估成本。

### 3D 家园

- 基于 React Three Fiber 的 Mardou 博物馆，支持第一人称 WASD、碰撞、镜头路线和可交互楼梯。
- 包含公开项目岛、Profile 展品、来源档案、可编辑展示字段和展品聚焦阅读界面。
- 提供浏览器本地的私密二层空间与日记边界。
- 包含程序化 Companion、基于 Profile 的问答、验证引用、实时 TTS 流和浏览器语音降级。
- 支持抽象肖像、背景音乐、加载与错误恢复、移动端构图检查和素材预算。

### Creative Retrieval

ROOM 当前对经过整理的参考目录执行中英双语词法扩展、元数据过滤、加权重排和严格的 License Guard。目前它不是语义/向量 RAG。只有当参考项达到至少 200 条，并且评测证明词法 Recall 出现回退时，才会启用向量检索。详细说明请查看 [Creative Retrieval](./docs/CREATIVE_RETRIEVAL.md)。

## 安全与隐私边界

- 简历文本、作品集 HTML、链接、模型输出、Tool 输出、问题和访客 Provider 配置全部视为不可信输入。
- 公网请求会在 Fetch 前校验 URL 语法、每一次重定向以及解析出的 A/AAAA 地址。
- 来源中的 Prompt Injection 会被隔离，同时保留证据行号。
- Trace 存储不包含 Prompt、来源正文、API Key、Authorization Header、Cookie 或完整模型响应。
- Companion 上下文只来自明确允许的公开 Profile 字段；引用会与真实 Profile 证据进行核验。
- 浏览器 Provider 配置不会暴露服务端 Key，但 ROOM 代理必然会接收到访客凭证。
- Diagnostic Payload 输出默认关闭且只应用于本地，因为其中可能包含简历或模型输出数据。

威胁模型、限制、DNS 残余风险和红队测试覆盖请查看 [Agent 安全](./docs/AGENT_SECURITY.md)。

## Workflow 持久化

默认 Workflow Store 是有容量限制的内存实现。它支持同一进程内的重试、取消、Checkpoint、审核中断和恢复，但不能在进程重启后恢复。

项目已经提供 D1 元数据 + 私有 R2 正文实现；当运行环境同时存在 `DB` 和 `WORKFLOW_OBJECTS` Binding 时会自动启用。当前提交的 [.openai/hosting.json](./.openai/hosting.json) 尚未配置这些资源，因此默认没有启用持久恢复。生产启用前还需要实现所有权授权和定时保留策略清理。详细说明请查看 [Workflow 状态](./docs/WORKFLOW_STATE.md)。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地 vinext 开发服务器 |
| `npm run typecheck` | 执行 TypeScript 检查但不生成文件 |
| `npm run lint` | 运行 ESLint |
| `npm test` | 运行审计、全部测试、生产构建和渲染 HTML 检查 |
| `npm run build` | 创建 vinext 生产构建 |
| `npm run asset:audit` | 检查 Mardou GLB 是否符合素材预算 |
| `npm run baseline:agent` | 验证确定性的 Agent Pipeline Baseline |
| `npm run eval:profile` | 执行离线 Profile Eval |
| `npm run eval:full` | 执行完整 Profile Eval 数据集 |
| `npm run eval:creative` | 评测检索 Recall、Precision、nDCG、引用及许可证违规 |
| `npm run eval:judge` | 运行 LLM Judge 校准 Fixture |
| `npm run rag:sync` | 刷新紧凑的本地参考语料库 |
| `npm run smoke:provider` | 查看已配置的真实 Provider 目标，但不发起调用 |

真实 Provider 调用和 Eval 实验可能产生费用。允许真实调用的脚本需要显式参数或凭证；在 CI 中运行前请检查目标地址和输出范围。

## 仓库结构

```text
app/                    页面与 API Route
components/             产品 UI、3D Runtime、Agent Trace 和审核面板
lib/agent-runtime/      预算、Trace、取消、指标和脱敏
lib/agents/             Profile、Website、肖像和 QA 模型边界
lib/workflow/           Checkpoint Run 状态及内存/D1/R2 Store
lib/rag/                Creative Retrieval 与许可证感知排序
schemas/                Profile、World 和 Checker 契约
evals/                  离线数据集、Fixture、Baseline 和报告
research/rag/           经过整理的参考元数据
public/vendor/          已审计的第三方 3D 素材和许可证
scripts/                审计、Eval、Smoke Test 和维护工具
tests/                  单元、集成、渲染和安全测试
docs/                   架构、产品、安全、Workflow 和 ADR
```

推荐从以下文档开始：

- [产品定义](./docs/PRODUCT.md)
- [架构](./docs/ARCHITECTURE.md)
- [Website Research Agent](./docs/WEBSITE_RESEARCH_AGENT.md)
- [可观测性](./docs/AGENT_OBSERVABILITY.md)
- [Eval 报告](./docs/AGENT_EVAL_REPORT.md)
- [Profile 冲突审核](./docs/PROFILE_CONFLICT_REVIEW.md)
- [Roadmap](./docs/ROADMAP.md)
- [贡献指南](./CONTRIBUTING.md)

## 当前状态与限制

ROOM 是可以运行的研究与 Demo 系统，不是生产级多租户服务。

- 虚构人物世界和本地开发流程已经可以运行。
- 真实模型效果取决于所选 Provider 对 Tool/JSON Schema 的实际支持，而不仅是端点协议兼容。
- D1/R2 持久恢复已经实现，但默认没有配置资源。
- 账号、生产级所有权控制、持久化公开评论、竞速导航和生成式 Blender 素材不在当前版本范围内。
- 在许可证和来源审计允许复用前，参考实现和素材必须保持隔离。

## License

仓库目前尚未选择统一许可证。`public/vendor/` 中的第三方素材继续遵循各自记录的许可证；没有完成许可证审计前，不要把外部代码或素材复制到 ROOM。
