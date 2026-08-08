# AI 时代的产品与运营能力（2024-2026）

> "Evals are the new PRDs."（Dianne Penn, Anthropic）· "Writing evals is going to be a core skill for product managers."（Kevin Weil, OpenAI CPO）

## 框架速查

| 框架 | 一句话 | 何时用 |
|---|---|---|
| Eval 三组件 | Dataset / Task / Scorer | AI 功能从 demo 走向可持续迭代 |
| 错误分析三步法 | Open coding → Axial coding → 理论饱和 | 搭 eval 之前的第一步 |
| LLM-as-Judge 四要素 | 角色+上下文+目标+术语定义，须人工校准 | 规模化评估主观维度 |
| Golden Dataset 六步 | 一个下午启动的最小 eval | 想引入 eval 文化但没时间搞大工程 |
| 抱怨→回归飞轮（Anthropic 式） | 用户抱怨变成永不复发的回归资产 | 频繁换模型、怕"修好一处坏三处" |
| Model Maximalism（Kevin Weil） | 为下一档模型能力设计，不为当前缺陷建脚手架 | 排期超过一个模型迭代周期时 |
| HITL 置信度阈值 | 高置信自动执行（可撤销）、低置信升级人工 | 输出触发真实动作（退款/发信/改数据） |
| 成本-延迟-质量三角 | 先用 eval 锁质量下限再谈省钱 | 推理成本失控时 |
| AI 价值三层 | Save time / Improve / Power up | 评估 AI 功能提案的真实价值 |
| 混合客服模型（Klarna 教训） | AI 处理 tier-1，人工兜底，永远可达真人 | 客服/运营自动化的人机分工 |

## 核心操作

### Eval 纪律
- 新 AI 功能立项**先写 eval 而非 PRD**：一句话定义好输出 → 找 10 个真实输入样本 → 为每个写可接受标准 → 给现状打分 → 与工程约定维护方式——一个下午即可启动（golden dataset 是"每次迭代被执行而非被阅读"的活规格）。
- Dataset：20-50 条覆盖核心场景、边缘情况、已知 bug；题目无歧义（两个专家独立判断一致）；正反都测。
- Scorer 选择铁律：确定性判断（关键词/长度/格式）用代码；主观维度（语气/同理心）用 LLM-as-judge 但**必须用人工标注定期校准**；人类评分只用于校准、不用于大规模评测。
- 警惕两个数字：通过率 100% 通常说明题目太简单；标注员间一致性 33% 等于瞎猜——先对齐"好"的定义再谈自动化。

### 错误分析（最常被跳过的一步）
每周固定 30-60 分钟**逐条读原始 transcript**：先 open coding 自由记录失败类型，再归纳成 5-6 个类别（axial coding），读到不再产生新错误模式为止（理论饱和）。指定一名"benevolent dictator"对"什么算对"拥有最终裁决权。"Sweat the tokens as much as they sweat the pixels."

### 概率思维与产品形态
- 接受产品建在 60%-99.5% 正确率不等的组件上，**默认为失败设计**：低置信度自动升级人工、AI 动作可撤销、人有最终决定权；正确率≠体验（Klarna 的 AI 答对了用户仍不满）。
- 不确定的输出不用确定的视觉呈现："AI 建议" vs "AI 已验证"分级标签；AI 失败时保留用户现场并解释——错误绝不吞掉用户工作。
- **多步链路先算成功率乘积**：80%×50%×40%=10%，每加一个环节先问能否砍掉。
- 交付结果而非工具：裸 prompt 输入是"强大、低效、高门槛"的交互，用模板和默认值降门槛。

### Model Maximalism
模型 3-4 个月一迭代、成本每年数量级下降、能力跳跃式出现（jagged edge）。判断标准："这个 workaround 在下一代模型发布后还有价值吗？"对主题持强观点、对具体原型持弱观点；每个新模型 checkpoint 重估"昨天不可能的事今天是否可能"。"Today's AI models are the worst you'll ever use for the rest of your life."

### Prototype-first
先花 1-5 小时用 AI 工具做可交互原型给干系人"反应"，再写文档——"十个人各有想法，原型给了共同语言"（Teresa Torres）。早期用粗糙原型学习，后期才用设计系统打磨，防止干系人误以为已可上线。

### AI 客服四条红线
1. 永远保留可达真人的通道（Klarna 裁 700 客服后被迫重雇的核心教训）；
2. 显著披露对方是 AI；
3. 升级人工时保留完整对话上下文，定期实测升级通道可用；
4. 复杂、情绪化、涉合规（争议、销户）工单直接给人。

### 人的不可替代项
AI 时代溢价最高的两样东西：**judgment**（取舍与品味）和 **agency**（知道该构建什么）。用 LLM 规模化聚类全量反馈提取主题，但价值排序、资源取舍、伦理判断自己做。先自己形成观点，再让 AI 当"会反驳你的思想伙伴"——"A thinking partner does not just agree with you; it should add to you."管理者保持动手："If you're a manager, you have to be hands-on."

## 反面模式

- Vibe check 代替 eval：demo 好看就上线——MIT 研究显示 95% 企业 AI 试点无可测 ROI。
- 把 PRD 当交付终点：静态文档追不上模型迭代，写完即腐烂。
- 不读 transcript 只看仪表盘。
- LLM-as-judge 未经人工校准就当真。
- 围绕当前模型缺陷建重脚手架。
- 全 AI 替代砍掉人工通道。
- AI 功能跟风：为了"有 AI"而做 AI。
- 把价值判断、取舍、伦理外包给 AI。
- 失败归因错位：企业 AI 失败仅约 23% 源于模型/数据质量，其余是治理、配置和变更管理——但团队总先怪模型。

## 来源

Lenny's Podcast/Newsletter（Dianne Penn · Kevin Weil · Hamel Husain & Shreya Shankar · Aman Khan）· Mind the Product《Evals are the new PRD》· Teresa Torres AI Prototyping · 53AI《做AI产品近2年的25条核心认知》· Klarna 2024-2025 公开复盘 · 火山引擎四阶十二步法
