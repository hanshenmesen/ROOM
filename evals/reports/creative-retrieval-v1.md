# Creative Retrieval 评测报告：creative-retrieval-v1

- 评测结果：**通过**
- 素材库规模：13 条参考素材
- 测试用例：10 个（预标注）
- Top K：3
- 是否建议引入向量检索：**否**

## 总体指标

| 指标 | 结果 |
| --- | ---: |
| 召回率 Recall@K | 100.0% |
| 精确率 Precision@K | 60.0% |
| 排序质量 nDCG | 100.0% |
| 许可证策略违规率 | 0.0% |
| Creative Brief 引用完整率 | 100.0% |

## 分用例结果

| 用例 | 检索结果 | R@K | P@K | nDCG |
| --- | --- | ---: | ---: | ---: |
| 低多边形房间（`low-poly-room`） | maxime-morel, sooah-room-folio, joan-ramos | 100.0% | 33.3% | 100.0% |
| 引导式个人房间（`guided-personal-room`） | sooah-room-folio, joan-ramos, maxime-morel | 100.0% | 33.3% | 100.0% |
| 3D 世界新手引导与恢复（`world-onboarding-recovery`） | bruno-simon | 100.0% | 100.0% | 100.0% |
| React 无障碍降级页（`accessible-react-fallback`） | react18-portfolio | 100.0% | 100.0% | 100.0% |
| 电脑画廊房间（`computer-gallery-room`） | joan-ramos, maxime-morel, sooah-room-folio | 100.0% | 33.3% | 100.0% |
| 双语低多边形房间（`bilingual-low-poly-room`） | maxime-morel, joan-ramos, sooah-room-folio | 100.0% | 33.3% | 100.0% |
| 双语世界恢复引导（`bilingual-world-recovery`） | bruno-simon | 100.0% | 100.0% | 100.0% |
| 赛博朋克视觉灵感（`cyberpunk-visual-inspiration`） | jesses-ramen, thibault-gamefolio, david-heckhoff | 100.0% | 33.3% | 100.0% |
| 太空职业叙事灵感（`space-career-inspiration`） | thibault-gamefolio, jesses-ramen, david-heckhoff | 100.0% | 33.3% | 100.0% |
| 隔离状态复古实现素材（`quarantined-retro-implementation`） | — | 100.0% | 100.0% | 100.0% |
