import ora from 'ora';
import { getConfig, isConfigured } from '../utils/config-store.js';
import { GitService } from '../services/git.js';
import { AIClient } from '../services/ai-client.js';
import { buildReviewPrompt } from '../prompts/review-prompt.js';
import { generateReport } from '../services/reporter.js';
import logger from '../utils/logger.js';

export async function analyzeCommand(options) {
  // 检查配置
  if (!isConfigured()) {
    logger.error('请先运行 goodiffer init 进行配置');
    process.exit(1);
  }

  const config = getConfig();
  const git = new GitService();

  // 检查是否在 git 仓库中
  const isRepo = await git.isGitRepo();
  if (!isRepo) {
    logger.error('当前目录不是 git 仓库');
    process.exit(1);
  }

  let spinner = ora('获取 Git 信息...').start();

  try {
    // 获取 commit 信息和 diff
    let commitInfo;
    let diff;

    if (options.staged) {
      // 分析暂存区
      commitInfo = { message: '(暂存区更改)', sha: 'staged' };
      diff = await git.getStagedDiff();
    } else if (options.commit) {
      // 分析指定 commit
      commitInfo = await git.getCommitInfo(options.commit);
      diff = await git.getCommitDiff(options.commit);
    } else if (options.from && options.to) {
      // 分析 commit 范围
      commitInfo = { message: `${options.from}..${options.to}`, sha: 'range' };
      diff = await git.getRangeDiff(options.from, options.to);
    } else {
      // 默认: 分析最近一次 commit
      commitInfo = await git.getLastCommitInfo();
      diff = await git.getLastCommitDiff();
    }

    if (!diff || diff.trim() === '') {
      spinner.fail('没有找到代码变更');
      process.exit(1);
    }

    spinner.succeed('获取 Git 信息完成');

    // 构建提示词
    const prompt = buildReviewPrompt(commitInfo.message, diff);

    // 调用 AI 分析
    spinner = ora('AI 正在分析代码...').start();

    const aiClient = new AIClient(config);
    let response = '';

    try {
      response = await aiClient.analyzeStream(prompt, (chunk) => {
        // 流式输出时更新 spinner
        spinner.text = `AI 正在分析... (${response.length} 字符)`;
      });
    } catch (error) {
      spinner.fail('AI 分析失败');
      if (error.message.includes('401')) {
        logger.error('API Key 无效或已过期');
      } else if (error.message.includes('403')) {
        logger.error('API 请求被拒绝 (403)');
        logger.info('请检查:');
        console.log('  1. API Key 是否正确');
        console.log('  2. API Host 是否正确');
        console.log('  3. 模型名称是否正确');
        console.log('');
        console.log(`  当前配置:`);
        console.log(`    apiHost: ${config.apiHost}`);
        console.log(`    model: ${config.model}`);
      } else if (error.message.includes('429')) {
        logger.error('请求过于频繁，请稍后重试');
      } else {
        logger.error(`API 错误: ${error.message}`);
      }
      process.exit(1);
    }

    spinner.succeed('AI 分析完成');

    // 生成报告
    generateReport(response, commitInfo);

  } catch (error) {
    spinner.fail('分析失败');
    logger.error(error.message);
    process.exit(1);
  }
}

export default analyzeCommand;
