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

## 最近 Review 记录 (含完整详情)
${data.recentReviews.map(r => `
---
ID: ${r.id}
Commit: ${r.commitSha} - ${r.commitMessage}
开发者: ${r.developerName} (${r.developerEmail})
分支: ${r.branch || 'unknown'}
日期: ${r.commitDate}
代码变更: +${r.insertions} / -${r.deletions} (${r.filesChanged} files)
摘要: ${r.summary || '无摘要'}
问题统计: ${r.errorCount} errors, ${r.warningCount} warnings, ${r.infoCount} infos
风险统计: ${r.riskCount} risks

### Issues 详情:
${(r.issues || []).map(issue => `
- [${issue.level?.toUpperCase() || 'INFO'}] ${issue.title || issue.type || '问题'}
  文件: ${issue.file || 'N/A'}${issue.line ? ':' + issue.line : ''}
  ${issue.code ? '代码: ' + issue.code : ''}
  描述: ${issue.description || issue.body || 'N/A'}
  建议: ${issue.suggestion || 'N/A'}
`).join('') || '无问题'}

### 关联风险:
${(r.associationRisks || []).map(risk => `
- 修改文件: ${risk.changedFile}
  关联文件: ${risk.relatedFiles}
  风险: ${risk.risk}
`).join('') || '无关联风险'}
`).join('\n')}

## 输出要求

请生成一份专业的 H5 报告页面，要求如下：

### 1. 页面结构 (双视图设计)
页面需要支持两种视图，通过 JavaScript 切换：

**主视图 (列表视图)**:
- **顶部头区**: 报告标题、项目名称、时间范围、生成时间
- **概览卡片区**: 关键统计数字 (Reviews数、代码变更、问题总数)
- **开发者分析区**: 每个开发者的详细分析卡片
- **问题分布图**: 使用 CSS 绘制简单的柱状图
- **最近 Review 列表**: 可点击的 commit 列表卡片

**详情视图 (Commit 详情页)**:
- **返回按钮**: 点击返回主视图
- **Commit 头部**:
  - Commit SHA (短格式) 和完整 commit message
  - 开发者信息和日期
  - 分支名称
  - 代码变更统计 (+X / -Y, Z files)
- **摘要区**: 显示 summary 内容
- **问题统计卡片**: 分类显示 errors/warnings/infos/risks 数量
- **Issues 列表区**:
  - 按级别 (error/warning/info) 分组显示
  - 每个 issue 显示: 级别标签、文件位置、描述、建议
  - 使用不同颜色区分级别 (红/橙/蓝)
- **关联风险区**: 显示修改文件、关联文件和风险描述

### 2. 交互功能 (重要!)
- **点击 Review 列表中的任意一行**，切换到该 commit 的详情视图
- **详情视图有返回按钮**，点击返回主列表视图
- 使用 JavaScript 控制显示/隐藏，实现 SPA 式体验
- 不需要 URL 变化，只需要 DOM 显示切换
- 点击开发者卡片展开详情
- 统计数字悬停显示详细信息

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
- Review 列表项需要有悬停效果，明确表示可点击

### 4. 技术要求
- **单文件 HTML**：所有 CSS 和 JavaScript 内联
- **无外部依赖**：可离线查看，不引用任何 CDN
- **图表用 CSS 绘制**：不使用 Chart.js 等库
- **支持打印**：添加打印媒体查询
- **中文界面**
- **所有 commit 的详情数据**都要嵌入到 HTML 中（可以用 JSON 或直接渲染隐藏的 DOM）

### 5. JavaScript 实现提示
\`\`\`javascript
// 参考实现结构
function showCommitDetail(commitId) {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('detail-view-' + commitId).style.display = 'block';
}

function showMainView() {
  // 隐藏所有详情视图
  document.querySelectorAll('.commit-detail-view').forEach(el => el.style.display = 'none');
  document.getElementById('main-view').style.display = 'block';
}
\`\`\`

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

## 详细 Review 记录 (含完整详情)
${data.reviews.map(r => `
---
ID: ${r.id}
项目: ${r.projectName}
Commit: ${r.commitSha} - ${r.commitMessage}
分支: ${r.branch || 'unknown'}
日期: ${r.commitDate}
代码变更: +${r.insertions} / -${r.deletions} (${r.filesChanged} files)
摘要: ${r.summary || '无'}
问题: ${r.errorCount}E / ${r.warningCount}W / ${r.infoCount}I
风险: ${r.riskCount}

### Issues 详情:
${(r.issues || []).map(issue => `
- [${issue.level?.toUpperCase() || 'INFO'}] ${issue.title || issue.type || '问题'}
  文件: ${issue.file || 'N/A'}${issue.line ? ':' + issue.line : ''}
  ${issue.code ? '代码: ' + issue.code : ''}
  描述: ${issue.description || issue.body || 'N/A'}
  建议: ${issue.suggestion || 'N/A'}
`).join('') || '无问题'}

### 关联风险:
${(r.associationRisks || []).map(risk => `
- 修改文件: ${risk.changedFile}
  关联文件: ${risk.relatedFiles}
  风险: ${risk.risk}
`).join('') || '无关联风险'}
`).join('\n')}

## 输出要求

生成个人 Code Review 报告 H5 页面，要求：

### 1. 页面结构 (双视图设计)
页面需要支持两种视图，通过 JavaScript 切换：

**主视图 (列表视图)**:
- **个人概览卡片**: 姓名、团队、关键指标
- **能力分析区**: 优点、缺点、风险点详细分析
- **趋势图区**: 问题数量趋势（CSS绘制）
- **工作记录列表**: 可点击的 commit 列表，按项目分组
- **改进建议**: 3-5条具体建议

**详情视图 (Commit 详情页)**:
- **返回按钮**: 点击返回主视图
- **Commit 头部**:
  - Commit SHA (短格式) 和完整 commit message
  - 项目名称和日期
  - 分支名称
  - 代码变更统计 (+X / -Y, Z files)
- **摘要区**: 显示 summary 内容
- **问题统计卡片**: 分类显示 errors/warnings/infos/risks 数量
- **Issues 列表区**:
  - 按级别 (error/warning/info) 分组显示
  - 每个 issue 显示: 级别标签、文件位置、描述、建议
  - 使用不同颜色区分级别 (红/橙/蓝)
- **关联风险区**: 显示修改文件、关联文件和风险描述

### 2. 交互功能 (重要!)
- **点击工作记录列表中的任意一行**，切换到该 commit 的详情视图
- **详情视图有返回按钮**，点击返回主列表视图
- 使用 JavaScript 控制显示/隐藏，实现 SPA 式体验
- 不需要 URL 变化，只需要 DOM 显示切换

### 3. 能力分析内容
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

### 4. 改进建议
基于数据给出 3-5 条具体可执行的建议，例如：
- "建议在修改 X 类文件时，同时检查 Y 文件的相关逻辑"
- "注意 Z 类型的问题，可以通过 ... 方式预防"

### 5. 技术要求
- 单文件 HTML，内联 CSS/JS
- 无外部依赖
- 响应式设计
- 支持打印
- 中文界面
- **所有 commit 的详情数据**都要嵌入到 HTML 中
- Review 列表项需要有悬停效果，明确表示可点击

### 6. JavaScript 实现提示
\`\`\`javascript
// 参考实现结构
function showCommitDetail(commitId) {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('detail-view-' + commitId).style.display = 'block';
}

function showMainView() {
  // 隐藏所有详情视图
  document.querySelectorAll('.commit-detail-view').forEach(el => el.style.display = 'none');
  document.getElementById('main-view').style.display = 'block';
}
\`\`\`

直接输出完整的 HTML 代码，不要包含 markdown 代码块标记，不要有任何解释文字。`;
}

export default { buildProjectReportPrompt, buildDeveloperReportPrompt };
