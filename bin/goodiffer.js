#!/usr/bin/env node

import { program } from 'commander';
import { initCommand } from '../src/commands/init.js';
import { analyzeCommand } from '../src/commands/analyze.js';
import { configCommand } from '../src/commands/config.js';

program
  .name('goodiffer')
  .description('AI-powered git diff analyzer for code review')
  .version('1.0.0');

// 默认命令 - 分析
program
  .option('-s, --staged', '分析暂存区的更改')
  .option('-c, --commit <sha>', '分析指定的 commit')
  .option('--from <sha>', '起始 commit (与 --to 配合使用)')
  .option('--to <sha>', '结束 commit (与 --from 配合使用)')
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

program.parse();
