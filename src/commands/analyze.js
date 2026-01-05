import ora from 'ora';
import { getConfig, isConfigured } from '../utils/config-store.js';
import { GitService } from '../services/git.js';
import { AIClient } from '../services/ai-client.js';
import { buildReviewPrompt } from '../prompts/review-prompt.js';
import { generateReport } from '../services/reporter.js';
import { getDatabase } from '../services/database.js';
import logger from '../utils/logger.js';

// 解析 AI 响应
function parseAIResponse(response) {
  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

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

  // 处理 -n 和 -m 参数的多 commit 模式
  if (options.n || options.m) {
    await analyzeMultipleCommits(options, config, git);
    return;
  }

  let spinner = ora('获取 Git 信息...').start();

  try {
    // 获取 commit 信息和 diff
    let commitInfo;
    let diff;
    let reviewType = 'commit';
    let author;
    let diffStats;

    if (options.staged) {
      // 分析暂存区
      commitInfo = { message: '(暂存区更改)', sha: 'staged' };
      diff = await git.getStagedDiff();
      reviewType = 'staged';
      author = await git.getCommitAuthor('staged');
      diffStats = await git.getStagedDiffStats();
    } else if (options.commit) {
      // 分析指定 commit
      commitInfo = await git.getCommitInfo(options.commit);
      diff = await git.getCommitDiff(options.commit);
      author = await git.getCommitAuthor(options.commit);
      diffStats = await git.getDiffStats(`${options.commit}~1`, options.commit);
    } else if (options.from && options.to) {
      // 分析 commit 范围
      commitInfo = { message: `${options.from}..${options.to}`, sha: 'range' };
      diff = await git.getRangeDiff(options.from, options.to);
      reviewType = 'range';
      author = await git.getLastCommitAuthor();
      diffStats = await git.getDiffStats(options.from, options.to);
    } else {
      // 默认: 分析最近一次 commit
      commitInfo = await git.getLastCommitInfo();
      diff = await git.getLastCommitDiff();
      author = await git.getLastCommitAuthor();
      diffStats = await git.getDiffStats('HEAD~1', 'HEAD');
    }

    if (!diff || diff.trim() === '') {
      spinner.fail('没有找到代码变更');
      process.exit(1);
    }

    // 获取项目信息和分支
    const projectName = await git.getProjectName();
    const branch = await git.getCurrentBranch();

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

    // 保存到数据库 (除非指定 --no-save)
    if (options.save !== false) {
      try {
        const db = getDatabase();

        // 获取或创建项目
        const project = db.getOrCreateProject(projectName, process.cwd());

        // 获取或创建开发者
        const developer = db.getOrCreateDeveloper(author.email, author.name);

        // 解析 AI 响应
        const parsed = parseAIResponse(response);

        // 提取统计数据
        let summary = '';
        let commitMatch = false;
        let commitMatchReason = '';
        let errorCount = 0;
        let warningCount = 0;
        let infoCount = 0;
        let riskCount = 0;
        let issues = [];
        let associationRisks = [];

        if (parsed) {
          summary = parsed.summary || '';
          commitMatch = parsed.commitMatch || false;
          commitMatchReason = parsed.commitMatchReason || '';

          // 支持新格式 findings (按优先级统计)
          if (parsed.findings && Array.isArray(parsed.findings)) {
            issues = parsed.findings;
            errorCount = issues.filter(i => i.priority === 0 || i.priority === 1).length; // P0, P1 算 error
            warningCount = issues.filter(i => i.priority === 2).length; // P2 算 warning
            infoCount = issues.filter(i => i.priority === 3 || i.priority === undefined).length; // P3 算 info
          } else if (parsed.issues && Array.isArray(parsed.issues)) {
            // 兼容旧格式
            issues = parsed.issues;
            errorCount = issues.filter(i => i.level === 'error').length;
            warningCount = issues.filter(i => i.level === 'warning').length;
            infoCount = issues.filter(i => i.level === 'info').length;
          }

          if (parsed.associationRisks && Array.isArray(parsed.associationRisks)) {
            associationRisks = parsed.associationRisks;
            riskCount = associationRisks.length;
          }
        }

        // 保存 review 记录
        const reviewId = db.saveReview({
          projectId: project.id,
          developerId: developer.id,
          commitSha: commitInfo.sha,
          commitMessage: commitInfo.message,
          commitDate: author.date,
          branch,
          reviewType,
          fromSha: options.from || null,
          toSha: options.to || null,
          filesChanged: diffStats.filesChanged,
          insertions: diffStats.insertions,
          deletions: diffStats.deletions,
          diffContent: null, // 不存储 diff 内容以节省空间
          aiResponse: response,
          summary,
          commitMatch,
          commitMatchReason,
          errorCount,
          warningCount,
          infoCount,
          riskCount,
          modelUsed: config.model,
          issues,
          associationRisks
        });

        logger.success(`Review #${reviewId} 已保存到数据库`);
      } catch (dbError) {
        logger.warning(`保存到数据库失败: ${dbError.message}`);
      }
    }

  } catch (error) {
    spinner.fail('分析失败');
    logger.error(error.message);
    process.exit(1);
  }
}

export default analyzeCommand;

// 分析多个 commits
async function analyzeMultipleCommits(options, config, git) {
  const n = options.n ? parseInt(options.n, 10) : null;
  const m = options.m ? parseInt(options.m, 10) : null;

  // 验证参数
  if (m !== null && n === null) {
    logger.error('-m 参数必须与 -n 配合使用');
    process.exit(1);
  }

  if (n !== null && m === null) {
    // 只有 -n，表示分析最近 n 条
    if (n <= 0 || n > 10) {
      logger.error('n 必须在 1-10 之间');
      process.exit(1);
    }
  }

  if (n !== null && m !== null) {
    // 同时有 -n 和 -m，表示第 n 条到第 m 条
    if (n <= 0 || m <= 0) {
      logger.error('n 和 m 必须大于 0');
      process.exit(1);
    }
    if (m < n) {
      logger.error('m 必须大于等于 n');
      process.exit(1);
    }
    if (m - n > 10) {
      logger.error('m - n 不能超过 10');
      process.exit(1);
    }
  }

  let spinner = ora('获取 Git 信息...').start();

  try {
    // 获取 commits
    let commits;
    if (m !== null) {
      // 第 n 条到第 m 条
      commits = await git.getCommitRange(n, m);
    } else {
      // 最近 n 条
      commits = await git.getRecentCommits(n);
    }

    if (commits.length === 0) {
      spinner.fail('没有找到 commits');
      process.exit(1);
    }

    const projectName = await git.getProjectName();
    const branch = await git.getCurrentBranch();

    spinner.succeed(`找到 ${commits.length} 个 commit`);

    // 显示要分析的 commits
    logger.info('\n要分析的 commits:');
    commits.forEach((commit, index) => {
      const shortSha = commit.sha.substring(0, 7);
      const shortMsg = commit.message.split('\n')[0].substring(0, 50);
      console.log(`  ${index + 1}. ${shortSha} - ${shortMsg}`);
    });
    console.log('');

    // 逐个分析
    const aiClient = new AIClient(config);
    const results = [];

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const shortSha = commit.sha.substring(0, 7);

      spinner = ora(`[${i + 1}/${commits.length}] 分析 commit ${shortSha}...`).start();

      try {
        // 获取 diff
        const diff = await git.getCommitDiff(commit.sha);
        if (!diff || diff.trim() === '') {
          spinner.warn(`[${i + 1}/${commits.length}] commit ${shortSha} 没有代码变更，跳过`);
          continue;
        }

        const diffStats = await git.getDiffStats(`${commit.sha}~1`, commit.sha);

        // 构建提示词并分析
        const prompt = buildReviewPrompt(commit.message, diff);
        let response = '';

        try {
          response = await aiClient.analyzeStream(prompt, (chunk) => {
            spinner.text = `[${i + 1}/${commits.length}] 分析 commit ${shortSha}... (${response.length} 字符)`;
          });
        } catch (error) {
          spinner.fail(`[${i + 1}/${commits.length}] commit ${shortSha} 分析失败: ${error.message}`);
          continue;
        }

        spinner.succeed(`[${i + 1}/${commits.length}] commit ${shortSha} 分析完成`);

        // 生成报告
        generateReport(response, { sha: commit.sha, message: commit.message });

        // 保存到数据库
        if (options.save !== false) {
          try {
            const db = getDatabase();
            const project = db.getOrCreateProject(projectName, process.cwd());
            const developer = db.getOrCreateDeveloper(commit.author.email, commit.author.name);
            const parsed = parseAIResponse(response);

            let summary = '';
            let commitMatch = false;
            let commitMatchReason = '';
            let errorCount = 0;
            let warningCount = 0;
            let infoCount = 0;
            let riskCount = 0;
            let issues = [];
            let associationRisks = [];

            if (parsed) {
              summary = parsed.summary || '';
              commitMatch = parsed.commitMatch || false;
              commitMatchReason = parsed.commitMatchReason || '';

              // 支持新格式 findings (按优先级统计)
              if (parsed.findings && Array.isArray(parsed.findings)) {
                issues = parsed.findings;
                errorCount = issues.filter(i => i.priority === 0 || i.priority === 1).length;
                warningCount = issues.filter(i => i.priority === 2).length;
                infoCount = issues.filter(i => i.priority === 3 || i.priority === undefined).length;
              } else if (parsed.issues && Array.isArray(parsed.issues)) {
                issues = parsed.issues;
                errorCount = issues.filter(i => i.level === 'error').length;
                warningCount = issues.filter(i => i.level === 'warning').length;
                infoCount = issues.filter(i => i.level === 'info').length;
              }

              if (parsed.associationRisks && Array.isArray(parsed.associationRisks)) {
                associationRisks = parsed.associationRisks;
                riskCount = associationRisks.length;
              }
            }

            const reviewId = db.saveReview({
              projectId: project.id,
              developerId: developer.id,
              commitSha: commit.sha,
              commitMessage: commit.message,
              commitDate: commit.author.date,
              branch,
              reviewType: 'commit',
              fromSha: null,
              toSha: null,
              filesChanged: diffStats.filesChanged,
              insertions: diffStats.insertions,
              deletions: diffStats.deletions,
              diffContent: null,
              aiResponse: response,
              summary,
              commitMatch,
              commitMatchReason,
              errorCount,
              warningCount,
              infoCount,
              riskCount,
              modelUsed: config.model,
              issues,
              associationRisks
            });

            results.push({ commit, reviewId, success: true });
          } catch (dbError) {
            logger.warning(`保存 commit ${shortSha} 到数据库失败: ${dbError.message}`);
            results.push({ commit, success: false, error: dbError.message });
          }
        }

        // 在 commits 之间添加分隔线
        if (i < commits.length - 1) {
          console.log('\n' + '─'.repeat(60) + '\n');
        }

      } catch (error) {
        spinner.fail(`[${i + 1}/${commits.length}] commit ${shortSha} 处理失败: ${error.message}`);
        results.push({ commit, success: false, error: error.message });
      }
    }

    // 显示汇总
    console.log('\n' + '═'.repeat(60));
    logger.success(`\n分析完成！共处理 ${commits.length} 个 commit`);

    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      logger.info(`成功保存 ${successCount} 条记录到数据库`);
    }

  } catch (error) {
    spinner.fail('分析失败');
    logger.error(error.message);
    process.exit(1);
  }
}
