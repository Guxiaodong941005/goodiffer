# Goodiffer

AI-powered git diff analyzer for code review - 基于 AI 的 Git Diff 智能分析工具

[![npm version](https://badge.fury.io/js/goodiffer.svg)](https://www.npmjs.com/package/goodiffer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🤖 支持 Claude (Anthropic) 和 GPT (OpenAI) 模型
- 🔍 自动分析 git diff，识别潜在问题
- 📊 生成结构化的代码审查报告
- 🔗 检测代码关联性风险
- 📋 生成可复制的修复提示词，方便在 Claude Code / Codex 中使用
- 🌐 支持第三方 API 代理
- 🔮 **NEW** 支持代码上下文获取 (Tool Use)，AI 可按需读取相关源码

## Installation

```bash
npm install -g goodiffer
```

## Quick Start

```bash
# 1. 初始化配置
goodiffer init

# 2. 分析最近一次 commit
goodiffer

# 3. 查看帮助
goodiffer --help
```

## Usage

### 初始化配置

```bash
goodiffer init
```

交互式配置：
- 选择 API Host (Anthropic/OpenAI/PackyAPI/自定义)
- 输入 API Key
- 选择模型 (claude-sonnet-4-5/gpt-4o/自定义)

### 分析命令

```bash
# 分析最近一次 commit (默认)
goodiffer

# 分析暂存区
goodiffer -s
goodiffer --staged

# 分析指定 commit
goodiffer -c <commit-sha>
goodiffer --commit <commit-sha>

# 分析 commit 范围
goodiffer --from <start-sha> --to <end-sha>

# 分析最近 n 条 commit (n <= 10)
goodiffer -n 3          # 分析最近 3 条 commit
goodiffer -n 5          # 分析最近 5 条 commit

# 分析第 n 条到第 m 条 commit (m-n <= 10)
goodiffer -n 2 -m 5     # 分析第 2 到第 5 条 commit
goodiffer -n 3 -m 8     # 分析第 3 到第 8 条 commit

# 启用代码上下文获取 (AI 可按需读取相关源码)
goodiffer --context     # 分析时 AI 可以读取项目中的其他文件
goodiffer -c abc123 --context  # 分析指定 commit，启用上下文
```

### 代码上下文模式 (--context)

启用 `--context` 选项后，AI 在分析代码时可以：

1. **read_file** - 读取项目中的源文件，了解函数/类的具体实现
2. **find_definition** - 查找函数、类、变量的定义位置
3. **search_code** - 在项目中搜索代码模式
4. **list_files** - 列出目录结构

这使得 AI 能够：
- 验证被调用函数的实现是否正确
- 检查类型定义和接口
- 发现潜在的关联影响

> **注意**: 此功能需要 Claude 模型（使用 Tool Use API），建议在 Claude Code 环境中使用。

### 配置管理

```bash
# 查看当前配置
goodiffer config list

# 设置配置项
goodiffer config set apiHost https://api.anthropic.com
goodiffer config set model claude-sonnet-4-5-20250929

# 清除配置
goodiffer config clear
```

## Output Example

```
╭──────────────────────────────────────────────────────────╮
│  Goodiffer Analysis Report                               │
╰──────────────────────────────────────────────────────────╯

📝 Commit: feat: add user authentication

📊 Summary: 添加用户认证功能，包含登录表单和 API 调用

🎯 Commit 匹配: ✓ 代码修改符合 commit 描述

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 ERRORS (1)

[E001] src/auth/login.js:45-52
问题: 未处理 API 调用失败的情况

📋 修复提示词 (复制到 cc/codex):
┌────────────────────────────────────────────────────────┐
│ 在 src/auth/login.js 第45行添加 try-catch 处理异常    │
└────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 统计: 1 errors 0 warnings 0 info 0 risks
```

## Supported API Providers

| Provider | API Host | Models |
|----------|----------|--------|
| Anthropic | https://api.anthropic.com | claude-sonnet-4-5, claude-3-opus |
| OpenAI | https://api.openai.com | gpt-4o, gpt-4-turbo |
| PackyAPI | https://www.packyapi.com | claude-*, gpt-* |
| Custom | 自定义 URL | 任意模型 |

## Configuration

配置文件存储在 `~/.config/goodiffer-nodejs/config.json`

可配置项：
- `apiHost` - API 服务地址
- `apiKey` - API 密钥
- `model` - 模型名称
- `provider` - 提供商 (claude/openai/custom)

## Requirements

- Node.js >= 18.0.0
- Git

## License

MIT
