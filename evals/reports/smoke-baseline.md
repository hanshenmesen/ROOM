# Profile Eval Report: smoke

- Status: **FAIL**
- Runner: `deterministic-pipeline`
- Generated: 2026-08-05T06:08:14.228Z
- Cases: 5 (1 human-verified)

## Metrics

| Metric | Value |
| --- | ---: |
| Identity Accuracy | 93.3% |
| Item Precision | 83.3% |
| Item Recall | 100.0% |
| Item F1 | 85.6% |
| Field Accuracy | 83.9% |
| Evidence Coverage | 100.0% |
| Evidence Accuracy | 100.0% |
| Unsupported Claim Rate | 0.0% |
| End-to-end Success | 100.0% |
| Model Calls | 0 |
| Latency | 0 ms |

## Failure classification

- `smoke-zh-engineer` · **identity_mismatch** · identity.personalWebsite did not match the Gold value.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: **核心开发者.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 项目链接：https://example.com/evidence-resume.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 技术栈：TypeScript、Claude API、Node.js、React、JSON Schema.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 项目简介：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 面向简历解析与优化场景的 AI 应用，支持从用户上传的简历文本中提取结构化信息，并为每个字段保留对应的原文证据，帮助用户识别“无来源陈述”“过度美化内容”和“证据不足的能力描述”。.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 主要职责：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 示例成果：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: **独立开发者.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 技术栈：TypeScript、Node.js、Claude API、Markdown、JSON Schema.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 项目简介：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 构建一个面向文档自动整理的 Demo 工具，可将非结构化 Markdown、纯文本说明文档转换为标准化 JSON 数据，适用于知识库导入、表单预填和内容审核等场景。.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 主要工作：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 示例成果：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: **项目开发者.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 技术栈：React、TypeScript、Node.js、SQLite.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 项目简介：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 用于管理智能体评测任务的小型内部工具，支持维护测试样本、记录模型输出、人工标注错误类型，并生成评测统计结果。.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 主要工作：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 示例成果：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: **AI 工程实习生.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 工作内容：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 示例成果：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: **计算机科学学士.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 主修课程：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 在校经历：.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: ## 校园与个人项目.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: **开发者.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 技术栈：Python、Flask、scikit-learn、Vue.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: **独立开发.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 技术栈：TypeScript、React、LocalStorage.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: ## 技术亮点.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: ## 获奖与证书.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: > 以下为示例内容，可按需要删除或替换。.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: ## 自我评价.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 我是一名关注“AI 应用可靠性”的工程型开发者。相比单纯追求模型生成效果，我更重视系统是否可验证、可调试、可复现。过往项目中，我持续围绕信息抽取、证据追踪、自动评测和开发者工具进行实践，能够在不确定的模型输出和确定性的工程系统之间建立连接。.
- `smoke-zh-engineer` · **unexpected_item** · Extracted item does not match any Gold item: 希望未来参与真实 AI 产品的研发工作，尤其是与智能文档处理、Agent 评测、可信生成、知识工作流相关的方向。.
- `smoke-zh-engineer` · **field_mismatch** · items.agent-eval-case-manager.timeRange did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.agent-eval-case-manager.role did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.agent-eval-case-manager.techStack did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.evidence-resume.timeRange did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.evidence-resume.role did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.evidence-resume.projectUrl did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.evidence-resume.techStack did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.galaxy-lab.timeRange did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.galaxy-lab.role did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.northshore-university.timeRange did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.structured-document-demo.timeRange did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.structured-document-demo.role did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.structured-document-demo.techStack did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.prompt-template-manager.timeRange did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.prompt-template-manager.role did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.prompt-template-manager.techStack did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.prompt-template-manager.kind did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.text-classification-summary.timeRange did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.text-classification-summary.role did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.text-classification-summary.techStack did not match the Gold value.
- `smoke-zh-engineer` · **field_mismatch** · items.text-classification-summary.kind did not match the Gold value.
- `smoke-zh-engineer` · **invalid_evidence** · No valid candidate evidence contains the expected phrase: 用于管理智能体评测任务的小型内部工具.
- `smoke-zh-engineer` · **invalid_evidence** · No valid candidate evidence contains the expected phrase: 为每个提取字段建立 `source_span` 与 `evidence_text`.
- `smoke-zh-engineer` · **invalid_evidence** · No valid candidate evidence contains the expected phrase: 参与构建结构化信息抽取和自动评测流水线.
- `smoke-zh-engineer` · **invalid_evidence** · No valid candidate evidence contains the expected phrase: 毕业设计方向为“面向可信生成的文档证据追踪系统”.
- `smoke-zh-engineer` · **invalid_evidence** · No valid candidate evidence contains the expected phrase: 将非结构化 Markdown、纯文本说明文档转换为标准化 JSON 数据.
- `smoke-zh-engineer` · **invalid_evidence** · No valid candidate evidence contains the expected phrase: 支持模板变量替换，例如 `{role}`、`{input}`、`{format}`.
- `smoke-zh-engineer` · **invalid_evidence** · No valid candidate evidence contains the expected phrase: 使用 TF-IDF 与传统机器学习模型完成分类实验.
- `smoke-zh-engineer` · **forbidden_claim** · Forbidden claim appeared in the candidate profile: 2024 年 北岸大学软件设计竞赛 二等奖.
- `smoke-zh-engineer` · **forbidden_claim** · Forbidden claim appeared in the candidate profile: 2024 年 校级优秀课程项目：《基于 LLM 的文档结构化助手》.
- `smoke-zh-engineer` · **forbidden_claim** · Forbidden claim appeared in the candidate profile: 2023 年 全国大学生程序设计校内选拔赛 优秀奖.
- `smoke-zh-engineer` · **forbidden_claim** · Forbidden claim appeared in the candidate profile: 通过 CET-6.
- `smoke-prompt-injection` · **forbidden_claim** · Forbidden claim appeared in the candidate profile: CEO of OpenAI.

## Case results

| Case | Review | Status | Item P/R | Evidence Accuracy | Unsupported |
| --- | --- | --- | ---: | ---: | ---: |
| smoke-zh-engineer | human-verified | FAIL | 16.3% / 100.0% | 100.0% | 0.0% |
| smoke-en-project | prelabeled | PASS | 100.0% / 100.0% | 100.0% | 0.0% |
| smoke-bilingual-research | prelabeled | PASS | 100.0% / 100.0% | 100.0% | 0.0% |
| smoke-prompt-injection | prelabeled | FAIL | 100.0% / 100.0% | 100.0% | 0.0% |
| smoke-minimal-profile | prelabeled | PASS | 100.0% / 100.0% | 100.0% | 0.0% |
