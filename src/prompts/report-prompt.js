// 项目报告提示词
export function buildProjectReportPrompt(data) {
  return `你是一个专业的技术团队 Code Review 分析师。请根据以下数据生成一份专业的 H5 报告页面。

## 报告类型
项目汇总报告

## 时间范围
${data.dateRange.start} 至 ${data.dateRange.end}

## 项目信息
项目名称: ${data.project.name}
总 Review 次数: ${data.stats.totalReviews}
参与开发者: ${data.developers.length} 人

## 汇总统计
- 总 Commits: ${data.stats.totalReviews}
- 总代码行变更: +${data.stats.totalInsertions} / -${data.stats.totalDeletions}
- 错误数: ${data.stats.totalErrors}
- 警告数: ${data.stats.totalWarnings}
- 信息数: ${data.stats.totalInfos}
- 风险数: ${data.stats.totalRisks}

## 各开发者详细数据
${data.developerStats.map(dev => `
### ${dev.displayName} (${dev.email})
- Commits: ${dev.totalReviews}
- 代码变更: +${dev.insertions} / -${dev.deletions}
- 错误: ${dev.errors}, 警告: ${dev.warnings}
- Commit 匹配率: ${dev.commitMatchRate}%

典型问题示例:
${dev.topIssues.map(issue => `- [${issue.level}] ${issue.file}: ${issue.description}`).join('\n') || '无'}

关联风险示例:
${dev.topRisks.map(risk => `- ${risk.changedFile}: ${risk.risk}`).join('\n') || '无'}
`).join('\n')}

## 最近 Review 记录
${data.recentReviews.map(r => `
---
Commit: ${r.commitSha.substring(0, 8)} - ${r.commitMessage}
开发者: ${r.developerName}
日期: ${r.commitDate}
摘要: ${r.summary || '无摘要'}
问题统计: ${r.errorCount} errors, ${r.warningCount} warnings
`).join('\n')}

## 输出要求

请生成一份专业的 H5 报告页面，要求如下：

### 1. 页面结构
- **顶部头区**: 报告标题、项目名称、时间范围、生成时间
- **概览卡片区**: 关键统计数字 (Reviews数、代码变更、问题总数)
- **开发者分析区**: 每个开发者的详细分析卡片
- **问题分布图**: 使用 CSS 绘制简单的柱状图
- **时间线区**: Review 历史时间线
- **详细记录区**: 可折叠的详细 Review 记录

### 2. 开发者分析内容 (针对每个开发者生成)
请根据数据分析每位开发者的：
- **优点**: 从数据中提炼积极方面（如：代码质量好、commit描述清晰、错误率低等）
- **缺点**: 需要改进的地方（基于 error/warning 数据分析）
- **风险点**: 常见的关联风险模式
- **工作记录**: commit 历史摘要和代码贡献统计
- **改进建议**: 具体可执行的建议

### 3. 视觉设计
- 现代简洁的卡片式设计
- 配色方案:
  - 主色: #3B82F6 (蓝色)
  - 成功: #10B981 (绿色)
  - 错误: #EF4444 (红色)
  - 警告: #F59E0B (橙色)
  - 背景: #F9FAFB
- 圆角卡片和阴影效果
- 支持响应式布局（移动端适配）

### 4. 技术要求
- **单文件 HTML**：所有 CSS 和 JavaScript 内联
- **无外部依赖**：可离线查看，不引用任何 CDN
- **图表用 CSS 绘制**：不使用 Chart.js 等库
- **支持打印**：添加打印媒体查询
- **中文界面**
- **折叠功能**：详细记录区域可展开/收起

### 5. 交互功能
- 点击开发者卡片展开详情
- 详细记录区可折叠
- 统计数字悬停显示详细信息

直接输出完整的 HTML 代码，不要包含 markdown 代码块标记，不要有任何解释文字。`;
}

// 开发者个人报告提示词
export function buildDeveloperReportPrompt(data) {
  return `你是一个专业的技术团队 Code Review 分析师。请为开发者生成个人 Code Review 报告。

## 开发者信息
姓名: ${data.developer.displayName}
邮箱: ${data.developer.email}
团队: ${data.developer.team || '未设置'}

## 时间范围
${data.dateRange.start} 至 ${data.dateRange.end}

## 参与项目
${data.projects.map(p => `- ${p.name}: ${p.commits} commits`).join('\n')}

## 汇总统计
- 总 Commits: ${data.stats.totalReviews}
- 总代码行变更: +${data.stats.totalInsertions} / -${data.stats.totalDeletions}
- 总错误: ${data.stats.totalErrors}
- 总警告: ${data.stats.totalWarnings}
- Commit 匹配率: ${data.stats.commitMatchRate}%

## 问题类型分布
${data.issueDistribution.map(t => `- ${t.type} (${t.level}): ${t.count} 次`).join('\n')}

## 典型问题示例
${data.topIssues.map(issue => `
### ${issue.level.toUpperCase()}: ${issue.type || '其他'}
文件: ${issue.file}${issue.line ? ':' + issue.line : ''}
问题: ${issue.description}
建议: ${issue.suggestion || '无'}
`).join('\n')}

## 关联风险模式
${data.topRisks.map(risk => `
- 文件: ${risk.changedFile}
- 影响: ${risk.relatedFiles}
- 风险: ${risk.risk}
`).join('\n') || '无关联风险记录'}

## 详细 Review 记录
${data.reviews.map(r => `
---
项目: ${r.projectName}
Commit: ${r.commitSha.substring(0, 8)} - ${r.commitMessage}
日期: ${r.commitDate}
摘要: ${r.summary || '无'}
问题: ${r.errorCount}E / ${r.warningCount}W / ${r.infoCount}I
`).join('\n')}

## 输出要求

生成个人 Code Review 报告 H5 页面，要求：

### 1. 页面结构
- **个人概览卡片**: 姓名、团队、关键指标
- **能力分析区**: 优点、缺点、风险点详细分析
- **趋势图区**: 问题数量趋势（CSS绘制）
- **工作记录**: 按项目分组的 commit 时间线
- **改进建议**: 3-5条具体建议

### 2. 能力分析内容
**优点** (从数据提炼):
- 代码质量方面的积极表现
- commit message 清晰度评价
- 错误率/警告率分析

**缺点** (基于问题数据):
- 最常见的问题类型
- 需要重点关注的代码领域

**风险点**:
- 常见的关联风险模式
- 需要额外注意的代码修改习惯

### 3. 改进建议
基于数据给出 3-5 条具体可执行的建议，例如：
- "建议在修改 X 类文件时，同时检查 Y 文件的相关逻辑"
- "注意 Z 类型的问题，可以通过 ... 方式预防"

### 4. 技术要求
与项目报告相同：
- 单文件 HTML，内联 CSS/JS
- 无外部依赖
- 响应式设计
- 支持打印
- 中文界面

直接输出完整的 HTML 代码，不要包含 markdown 代码块标记，不要有任何解释文字。`;
}

export default { buildProjectReportPrompt, buildDeveloperReportPrompt };
