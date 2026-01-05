export function buildReviewPrompt(commitMessage, diff) {
  return `你是一个专业的 Code Reviewer。请分析以下代码变更。

## Commit Message
${commitMessage}

## 代码变更 (Git Diff)
\`\`\`diff
${diff}
\`\`\`

## 任务
1. 首先理解 commit message 描述的意图
2. 分析代码变更是否符合 commit 描述
3. 识别潜在问题:
   - 编译/运行时错误风险
   - 逻辑错误
   - 代码关联性问题 (修改可能影响其他模块)

## 输出格式
请以 JSON 格式返回分析结果:

\`\`\`json
{
  "summary": "变更概述 (1-2句话)",
  "commitMatch": true/false,
  "commitMatchReason": "代码是否符合commit描述的说明",
  "issues": [
    {
      "level": "error|warning|info",
      "type": "compile|logic|association|style",
      "file": "文件路径",
      "line": "行号或行号范围",
      "code": "问题代码片段",
      "description": "问题描述",
      "suggestion": "修复建议",
      "fixPrompt": "可复制到 Claude Code/Codex 的修复提示词"
    }
  ],
  "associationRisks": [
    {
      "changedFile": "修改的文件",
      "relatedFiles": ["可能受影响的文件1", "可能受影响的文件2"],
      "risk": "风险描述",
      "checkPrompt": "检查提示词"
    }
  ]
}
\`\`\`

## 注意事项
- 只报告真正的问题，不要过度警告
- fixPrompt 应该简洁明了，可以直接复制使用
- 如果没有问题，issues 数组可以为空
- 关联风险只在确实存在时才报告`;
}

export default buildReviewPrompt;
