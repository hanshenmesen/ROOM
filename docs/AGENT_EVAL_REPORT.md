# ROOM Agent 评测报告

## 当前状态

阶段 2 已建立包含 30 个用例的离线广度评测集，但目前的结果还不能作为 Profile Agent 生产环境准确率的证据。

- 数据集：`smoke`（5 个）和组合数据集 `full`（30 个）
- 用例：30 个虚构的离线用例
- 已人工复核用例：2 个
- 执行器：确定性 Pipeline 基线
- 模型或网络调用：0 次
- Profile Agent 实验：尚未运行，需先配置 Provider 并显式允许模型调用
- 报告 Schema：`profile-eval-report.v1`

## 完整确定性基线指标

| 指标 | 结果 |
| --- | ---: |
| 身份信息准确率 | 98.9% |
| 经历条目精确率 | 93.9% |
| 经历条目召回率 | 95.5% |
| 经历条目 F1 | 94.2% |
| 结构化字段准确率 | 95.6% |
| 证据覆盖率 | 100.0% |
| 证据准确率 | 100.0% |
| 无证据声明率 | 0.0% |
| 端到端成功率 | 100.0% |

该评测集仍按设计标记为 **未通过**。它能稳定复现长 Markdown 分段错误、成就条目丢失、双语章节丢失，以及 Talk/Exhibition 类型不匹配。历史上的 3 个提示词注入失败用例已被阶段 6 的确定性隔离边界修复，目前均已通过；仓库中保留的阶段 2 报告是修复前的对照基线。这些失败反映的是确定性解析器缺陷，不代表 LLM Profile Agent 的能力。

## 结果解读

组合后的完整评测集证明：在不访问网络的情况下，Eval 系统已能对 30 个可复现用例执行精确身份检查、条目一对一匹配、结构化字段校验、来源定位、无证据声明检测、成本元数据记录、失败分类和数据集组合。其中 28 个用例仍是预标注状态，所有新增用例均为合成文本，因此不能将这些数字宣传为模型准确率。

如需产出首份可对外发布的准确率报告，还需完成：

1. 如果要公开宣称简历解析准确率，需使用至少 30 个已人工复核的真实或脱敏用例，替换或补充合成 Fixture。
2. 加入真实 PDF、图片、网站、多来源冲突、页面不可访问和部分失败输入；当前用例 Schema 仅支持文本。
3. 配置受控 Provider，运行 `npm run eval:experiment -- --dataset smoke --allow-model-calls`，并记录 Prompt、Token、延迟、降级路径和成本元数据。
4. 只有当 smoke 实验的成本和失败报告可接受时，才将模型实验扩展到 `full` 数据集。

机器可读的权威数据源：[`evals/reports/smoke-baseline.json`](../evals/reports/smoke-baseline.json) 和 [`evals/reports/full-baseline.json`](../evals/reports/full-baseline.json)。

## 回归门禁

由于两个数据集的阈值均为 100% 而确定性 Parser 存在已知缺陷，基线按设计"未通过"，阈值模式 `--gate` 永远为红。为保证迭代不悄悄破坏既有行为，仓库提供相对基线的回归门禁：

```bash
npm run eval:regression
```

它对 smoke 与 full 两个数据集离线运行确定性 Pipeline（零网络、零模型调用），与已审核基线逐项对比：任何核心指标回退、失败分类计数上升或用例数减少都会以退出码 1 失败，并生成中文回归报告 `outputs/evals/regression-report.md`。CI 对 Profile Eval 与 Creative Retrieval 均执行该门禁（后者使用阈值 `--gate`，因其基线本身达标）。

指标改善并经人工审核后，可显式更新基线：

```bash
npm run eval:regression:update
```

`--write` 只在零回退时生效，避免用更新基线掩盖回退。该门禁证明"修改没有破坏既有行为"，仍然不代表模型准确率。

## Website Research 对比能力

阶段 4 为单页和受限多页网站抽取增加了离线对比契约。它可以报告预期标题召回率、召回率差值、已访问页面数、下载字节数、Tool 调用次数、Tool 延迟、模型调用次数，以及在有数据时的 Provider Token 用量。Fixture 证明：即使根页面不含项目，系统仍能发现受支持的项目页和发表页；外部链接、本地网络链接和私有链接不会进入执行计划。

这是能力测试，不是生产环境基准测试。它使用虚构的内存网站图和注入的确定性提交器，因此不声称真实模型的网站抽取准确率或真实网络延迟。如需发布正式对比结果，仍需使用已审核的多页网站，并在明确授权后运行 Provider 实验。

## LLM Judge 校准

事实性指标用确定性 Gold Label 评测，但叙事质量没有标准答案。项目为此落地了 LLM-as-a-Judge 的校准协议（Q35 的后续方向）：人工评分与 Judge 评分在同一样本上配对，按维度计算 exact / within-one agreement、MAE 和二次加权 Cohen's Kappa，全部维度通过门槛（Kappa ≥ 0.6、within-one ≥ 0.9）后才允许引用 Judge 分数。

```bash
npm run eval:judge        # 生成校准报告（零模型调用）
```

当前数据集为 20 个合成预标注样本，只证明校准管线可运行并进入 CI 门禁；用真实 Agent 输出做人工评分前，不能宣称 Judge 已校准。机器可读实现：[`lib/evals/judge-calibration.ts`](../lib/evals/judge-calibration.ts)。

## Creative Retrieval 评测

阶段 7 增加了一个包含 10 个用例、无需网络的 Creative Retrieval 数据集，覆盖中英文词汇匹配、元数据分类、视觉灵感使用策略和隔离状态实现参考。当前素材库共 13 条，评测结果为：Recall@3 100%、Precision@3 60%、nDCG 100%、许可证策略违规率 0%、Creative Brief 引用完整率 100%。

这些标签尚处于预标注状态，引用完整率只能证明参考素材来源可追溯，不能证明检索结果必然提升设计质量。因此，该报告可用于回归检查和许可证策略决策，但不能用来宣称用户更喜欢所选美术风格。由于素材库少于 200 条，且词汇检索 Recall 高于门槛，本次评测的结论是：**当前不引入 Embedding 或向量数据库**。机器可读数据源：[`evals/reports/creative-retrieval-v1.json`](../evals/reports/creative-retrieval-v1.json)。
