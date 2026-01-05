#!/usr/bin/env node

import { program } from 'commander';
import { initCommand } from '../src/commands/init.js';
import { analyzeCommand } from '../src/commands/analyze.js';
import { configCommand } from '../src/commands/config.js';
import { historyCommand } from '../src/commands/history.js';
import { statsCommand } from '../src/commands/stats.js';
import { developerCommand } from '../src/commands/developer.js';
import { reportCommand } from '../src/commands/report.js';

program
  .name('goodiffer')
  .description('AI-powered git diff analyzer for code review')
  .version('1.0.1');

// 默认命令 - 分析
program
  .option('-s, --staged', '分析暂存区的更改')
  .option('-c, --commit <sha>', '分析指定的 commit')
  .option('--from <sha>', '起始 commit (与 --to 配合使用)')
  .option('--to <sha>', '结束 commit (与 --from 配合使用)')
  .option('-n <number>', '分析最近 n 条 commit (n <= 10), 或与 -m 配合表示起始位置')
  .option('-m <number>', '与 -n 配合使用，表示结束位置 (m-n <= 10)')
  .option('--no-save', '不保存到数据库')
  .action(async (options) => {
    await analyzeCommand(options);
  });

// init 命令
program
  .command('init')
  .description('初始化配置')
  .action(async () => {
    await initCommand();
  });

// config 命令
program
  .command('config <action> [key] [value]')
  .description('配置管理 (list, get, set, clear)')
  .action((action, key, value) => {
    configCommand(action, key, value);
  });

// history 命令
program
  .command('history')
  .description('查看 Code Review 历史记录')
  .option('-p, --project [name]', '按项目筛选 (默认当前项目)')
  .option('-d, --developer <name>', '按开发者筛选')
  .option('--since <date>', '开始日期 (YYYY-MM-DD)')
  .option('--until <date>', '结束日期 (YYYY-MM-DD)')
  .option('-n, --limit <number>', '显示数量', '20')
  .option('--json', '输出 JSON 格式')
  .action(async (options) => {
    await historyCommand(options);
  });

// stats 命令
program
  .command('stats')
  .description('显示统计信息')
  .option('-p, --project', '项目统计 (默认)')
  .option('-d, --developer', '开发者统计')
  .option('--since <date>', '开始日期 (YYYY-MM-DD)')
  .option('--until <date>', '结束日期 (YYYY-MM-DD)')
  .action(async (options) => {
    await statsCommand(options);
  });

// developer 命令
program
  .command('developer <action> [args...]')
  .description('开发者管理 (list, alias, rename, team)')
  .action(async (action, args) => {
    await developerCommand(action, args);
  });

// report 命令
program
  .command('report')
  .description('生成 H5 分析报告')
  .option('-p, --project [name]', '项目名称 (默认当前项目)')
  .option('-d, --developer <email>', '生成个人报告')
  .option('--all', '包含所有项目')
  .option('--since <date>', '开始日期 (YYYY-MM-DD)')
  .option('--until <date>', '结束日期 (YYYY-MM-DD)')
  .option('-o, --output <path>', '输出文件路径')
  .option('--open', '生成后自动打开')
  .action(async (options) => {
    await reportCommand(options);
  });

program.parse();
