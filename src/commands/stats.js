import chalk from 'chalk';
import dayjs from 'dayjs';
import { getDatabase } from '../services/database.js';
import { GitService } from '../services/git.js';
import logger from '../utils/logger.js';

export async function statsCommand(options) {
  const db = getDatabase();
  const git = new GitService();

  // 日期范围
  const dateRange = {};
  if (options.since) {
    dateRange.since = dayjs(options.since).startOf('day').toISOString();
  }
  if (options.until) {
    dateRange.until = dayjs(options.until).endOf('day').toISOString();
  }

  if (options.developer) {
    // 开发者统计
    await showDeveloperStats(db, dateRange);
  } else {
    // 项目统计 (默认)
    await showProjectStats(db, git, dateRange);
  }
}

async function showProjectStats(db, git, dateRange) {
  const projectName = await git.getProjectName();
  const project = db.getProject(projectName);

  if (!project) {
    logger.info(`项目 "${projectName}" 暂无 Review 记录`);
    console.log();
    console.log('提示: 运行 goodiffer 分析代码后会自动保存记录');
    return;
  }

  const stats = db.getProjectStats(project.id, dateRange);
  const developerStats = db.getDeveloperStatsByProject(project.id, dateRange);

  logger.title(`项目统计: ${projectName}`);

  // 显示日期范围
  if (dateRange.since || dateRange.until) {
    const since = dateRange.since ? dayjs(dateRange.since).format('YYYY-MM-DD') : '最早';
    const until = dateRange.until ? dayjs(dateRange.until).format('YYYY-MM-DD') : '今天';
    console.log(chalk.gray(`时间范围: ${since} ~ ${until}`));
    console.log();
  }

  // 总体统计
  console.log(chalk.bold('📊 总体统计'));
  console.log('  ' + chalk.gray('Reviews:'), stats.total_reviews || 0);
  console.log('  ' + chalk.gray('开发者:'), stats.developer_count || 0);
  console.log('  ' + chalk.gray('代码变更:'),
    chalk.green(`+${stats.total_insertions || 0}`),
    chalk.red(`-${stats.total_deletions || 0}`)
  );
  console.log();

  // 问题统计
  console.log(chalk.bold('🔍 问题统计'));
  console.log('  ' + chalk.red('Errors:'), stats.total_errors || 0);
  console.log('  ' + chalk.yellow('Warnings:'), stats.total_warnings || 0);
  console.log('  ' + chalk.blue('Info:'), stats.total_infos || 0);
  console.log('  ' + chalk.magenta('Risks:'), stats.total_risks || 0);
  console.log();

  // 开发者排名
  if (developerStats.length > 0) {
    console.log(chalk.bold('👥 开发者贡献'));
    console.log();

    for (const dev of developerStats) {
      const matchRate = dev.total_reviews > 0
        ? Math.round((dev.commit_match_count / dev.total_reviews) * 100)
        : 0;

      console.log(`  ${chalk.cyan(dev.display_name)} ${chalk.gray(`(${dev.git_email})`)}`);
      console.log(`    Reviews: ${dev.total_reviews}`,
        chalk.gray('|'),
        `代码: ${chalk.green('+' + (dev.total_insertions || 0))} ${chalk.red('-' + (dev.total_deletions || 0))}`,
        chalk.gray('|'),
        `问题: ${chalk.red(dev.total_errors || 0)}E ${chalk.yellow(dev.total_warnings || 0)}W`,
        chalk.gray('|'),
        `Commit匹配: ${matchRate}%`
      );
      console.log();
    }
  }
}

async function showDeveloperStats(db, dateRange) {
  const developers = db.listDevelopers();

  if (developers.length === 0) {
    logger.info('暂无开发者数据');
    return;
  }

  logger.title('开发者统计');

  // 显示日期范围
  if (dateRange.since || dateRange.until) {
    const since = dateRange.since ? dayjs(dateRange.since).format('YYYY-MM-DD') : '最早';
    const until = dateRange.until ? dayjs(dateRange.until).format('YYYY-MM-DD') : '今天';
    console.log(chalk.gray(`时间范围: ${since} ~ ${until}`));
    console.log();
  }

  for (const dev of developers) {
    const stats = db.getDeveloperStats(dev.id, dateRange);

    if (!stats || stats.total_reviews === 0) continue;

    const matchRate = stats.total_reviews > 0
      ? Math.round((stats.commit_match_count / stats.total_reviews) * 100)
      : 0;

    console.log(chalk.bold.cyan(dev.display_name), chalk.gray(`<${dev.git_email}>`));
    if (dev.team) {
      console.log(chalk.gray(`  团队: ${dev.team}`));
    }
    console.log();

    console.log(`  📊 Reviews: ${stats.total_reviews}  |  参与项目: ${stats.project_count}`);
    console.log(`  💻 代码变更: ${chalk.green('+' + (stats.total_insertions || 0))} ${chalk.red('-' + (stats.total_deletions || 0))}`);
    console.log(`  🔍 问题: ${chalk.red((stats.total_errors || 0) + 'E')} ${chalk.yellow((stats.total_warnings || 0) + 'W')} ${chalk.blue((stats.total_infos || 0) + 'I')}`);
    console.log(`  ⚠️  风险: ${stats.total_risks || 0}`);
    console.log(`  ✓ Commit 匹配率: ${matchRate}%`);
    console.log();
    logger.divider();
    console.log();
  }
}

export default statsCommand;
