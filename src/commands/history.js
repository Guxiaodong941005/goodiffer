import chalk from 'chalk';
import dayjs from 'dayjs';
import { getDatabase } from '../services/database.js';
import { GitService } from '../services/git.js';
import logger from '../utils/logger.js';

export async function historyCommand(options) {
  const db = getDatabase();
  const git = new GitService();

  // 构建筛选条件
  const filters = {
    limit: parseInt(options.limit) || 20,
    offset: 0
  };

  // 项目筛选
  if (options.project !== undefined) {
    let projectName;
    if (options.project === true) {
      // -p 无参数，使用当前项目
      projectName = await git.getProjectName();
    } else {
      projectName = options.project;
    }

    const project = db.getProject(projectName);
    if (!project) {
      logger.error(`项目 "${projectName}" 不存在`);
      console.log();
      console.log('可用项目:');
      const projects = db.listProjects();
      projects.forEach(p => {
        console.log(`  - ${p.name}`);
      });
      return;
    }
    filters.projectId = project.id;
  }

  // 开发者筛选
  if (options.developer) {
    const developers = db.listDevelopers();
    const dev = developers.find(d =>
      d.display_name.toLowerCase().includes(options.developer.toLowerCase()) ||
      d.git_email.toLowerCase().includes(options.developer.toLowerCase())
    );

    if (!dev) {
      logger.error(`开发者 "${options.developer}" 不存在`);
      console.log();
      console.log('可用开发者:');
      developers.forEach(d => {
        console.log(`  - ${d.display_name} (${d.git_email})`);
      });
      return;
    }
    filters.developerId = dev.id;
  }

  // 日期筛选
  if (options.since) {
    filters.since = dayjs(options.since).startOf('day').toISOString();
  }
  if (options.until) {
    filters.until = dayjs(options.until).endOf('day').toISOString();
  }

  // 查询记录
  const reviews = db.queryReviews(filters);

  if (reviews.length === 0) {
    logger.info('没有找到匹配的 Review 记录');
    return;
  }

  // JSON 输出
  if (options.json) {
    console.log(JSON.stringify(reviews, null, 2));
    return;
  }

  // 表格输出
  logger.title('Code Review 历史记录');

  console.log(chalk.gray(`共 ${reviews.length} 条记录`));
  console.log();

  for (const review of reviews) {
    const date = dayjs(review.commit_date).format('YYYY-MM-DD HH:mm');
    const sha = review.commit_sha.substring(0, 7);

    // 状态颜色
    let statusIcon = chalk.green('✓');
    if (review.error_count > 0) {
      statusIcon = chalk.red('✗');
    } else if (review.warning_count > 0) {
      statusIcon = chalk.yellow('⚠');
    }

    console.log(
      statusIcon,
      chalk.gray(date),
      chalk.cyan(`[${sha}]`),
      chalk.white(review.commit_message.substring(0, 50))
    );
    console.log(
      '  ',
      chalk.gray('项目:'), review.project_name,
      chalk.gray('| 开发者:'), review.developer_name,
      chalk.gray('| 问题:'),
      chalk.red(`${review.error_count}E`),
      chalk.yellow(`${review.warning_count}W`),
      chalk.blue(`${review.info_count}I`)
    );
    console.log();
  }
}

export default historyCommand;
