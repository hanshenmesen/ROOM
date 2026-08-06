# Agent 工具循环、Trace 与真实 Provider 评测

## 受控的模型规划循环

Website Research Agent 在读取每个页面后生成一份有界 Observation，只包含缺失字段、已访问页面摘要、经 URL 安全策略过滤的候选页面和剩余预算。规划模型每轮只能做两类决策：

1. 从精确候选 URL 集合中选择下一页；
2. 停止导航并提交当前证据。

模型不能创造 URL、修改工具名、放宽同域策略或绕过页面、Step、字节、时间和 Token 预算。返回非法计划、Provider 超时或用量预算用尽时，控制面回退到确定性候选排序，并在 Trace 中记录 `deterministic-fallback`。

```text
Observation
    ↓
Model Planner ──→ continue(candidate URL) ──→ fetch/list/inspect/extract
    │                                              │
    └──→ submit                         新 Observation ──┘
```

## Trace 可视化

解析界面每 500 ms 读取一次当前 Agent Run。折叠态展示模型调用数、工具调用数、重试、Token 和预估成本；展开后按时间展示：

- Step 启动与完成；
- Model 调用的 Provider、Model、Mode、Prompt 版本、Token 和延迟；
- Tool 调用的脱敏输入/输出摘要；
- Planner 的继续/提交决策及降级来源；
- Validation、Security、Budget、Retry 和 Artifact 事件。

Trace 在进入 Store 前统一脱敏。API Key、Authorization、Cookie、完整 Prompt、简历原文和网页正文不是 Trace 字段。当前 Store 仍为内存实现，适合本地调试，不宣称跨进程持久化。

## 跨 Run 聚合指标与导出

单 Run Trace 回答"这次运行发生了什么"；跨 Run 聚合回答"Agent 整体表现如何"。`GET /api/agent-runs/metrics` 在当前内存窗口（最多 100 个 Run）上输出：

- 任务完成率（只统计已完结 Run，运行中的 Run 不参与分子分母）；
- Model / Tool 延迟的 p50、p95 与最大值；
- Token 用量与预估成本——只累计 Provider 返回 usage 的调用，`measuredUsageCalls` 明确标注覆盖了多少次调用；
- Planner 决策来源分布与 `deterministic-fallback` 占比；
- 按 Provider/Model 分组的调用量、失败数、延迟分位数、Token 与成本。

单个 Run 的事件还可以通过 `GET /api/agent-runs/:runId/events?format=jsonl` 导出为 NDJSON，用于离线分析或与 Eval 报告对齐。聚合输出不含 Prompt、简历正文、Claim 值或请求头；Token 与成本保持"实测 usage"与"估算"的区分，窗口边界在响应的 `store` 字段中明示。

## 真实 Provider 评测

首先生成不调用模型的预检报告：

```bash
npm run eval:experiment:preflight
```

配置 Provider 后，显式允许模型调用：

```bash
npm run eval:experiment -- --dataset smoke --allow-model-calls
```

该命令分别运行确定性 Pipeline 和真实 Profile Agent，生成两份机器可读报告、中文对比报告、回归判定和实验 Manifest。Manifest 记录提交、Node 版本、Provider、Model、Mode、模型调用数、Token、延迟和预估成本，但不记录凭据。

没有 `--allow-model-calls` 时命令拒绝产生付费调用；未配置凭据时会生成中文阻塞报告，不会用 Mock 结果冒充真实 Provider 指标。
