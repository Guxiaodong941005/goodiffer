import ora from 'ora';
import open from 'open';
import { getDatabase } from '../services/database.js';
import { ReportGenerator } from '../services/report-generator.js';
import { GitService } from '../services/git.js';
import { isConfigured } from '../utils/config-store.js';
import logger from '../utils/logger.js';

export async function reportCommand(options) {
  // 检查配置
  if (!isConfigured()) {
    logger.error('请先运行 goodiffer init 进行配置');
    process.exit(1);
  }

  const db = getDatabase();
  const git = new GitService();
  const generator = new ReportGenerator();

  let spinner;

  try {
    if (options.developer) {
      // 生成开发者报告
      const developer = db.getDeveloper(options.developer);
      if (!developer) {
        // 尝试模糊匹配
        const developers = db.listDevelopers();
        const match = developers.find(d =>
          d.display_name.toLowerCase().includes(options.developer.toLowerCase()) ||
          d.git_email.toLowerCase().includes(options.developer.toLowerCase())
        );

        if (!match) {
          logger.error(`开发者 "${options.developer}" 不存在`);
          console.log();
          console.log('可用开发者:');
          developers.forEach(d => {
            console.log(`  - ${d.display_name} (${d.git_email})`);
          });
          return;
        }
        options.developer = match.git_email;
      }

      spinner = ora('正在生成开发者报告...').start();

      const outputPath = await generator.generateDeveloperReport(
        options.developer,
        options,
        (msg) => { spinner.text = msg; }
      );

      spinner.succeed('报告生成完成');
      console.log();
      logger.success(`报告已保存到: ${outputPath}`);

      if (options.open) {
        await open(outputPath);
      }

    } else {
      // 生成项目报告
      let projectName;

      if (options.project === true || options.project === undefined) {
        // 使用当前项目
        projectName = await git.getProjectName();
      } else if (options.project) {
        projectName = options.project;
      }

      // 检查项目是否存在
      const project = db.getProject(projectName);
      if (!project) {
        logger.error(`项目 "${projectName}" 暂无 Review 记录`);
        console.log();

        const projects = db.listProjects();
        if (projects.length > 0) {
          console.log('可用项目:');
          projects.forEach(p => {
            console.log(`  - ${p.name}`);
          });
        } else {
          console.log('提示: 运行 goodiffer 分析代码后会自动保存记录');
        }
        return;
      }

      // 检查是否有足够的数据
      const stats = db.getProjectStats(project.id, {});
      if (!stats || stats.total_reviews === 0) {
        logger.error('项目暂无足够的 Review 数据生成报告');
        console.log();
        console.log('提示: 运行 goodiffer 分析更多 commit 后再生成报告');
        return;
      }

      spinner = ora('正在生成项目报告...').start();

      const outputPath = await generator.generateProjectReport(
        projectName,
        options,
        (msg) => { spinner.text = msg; }
      );

      spinner.succeed('报告生成完成');
      console.log();
      logger.success(`报告已保存到: ${outputPath}`);
      console.log();

      // 显示报告统计
      console.log(`  项目: ${projectName}`);
      console.log(`  Reviews: ${stats.total_reviews}`);
      console.log(`  问题: ${stats.total_errors || 0}E / ${stats.total_warnings || 0}W / ${stats.total_infos || 0}I`);

      if (options.open) {
        console.log();
        logger.info('正在打开报告...');
        await open(outputPath);
      }
    }

  } catch (error) {
    if (spinner) {
      spinner.fail('报告生成失败');
    }
    logger.error(error.message);

    if (error.message.includes('401') || error.message.includes('403')) {
      console.log();
      logger.info('提示: 请检查 API 配置是否正确');
    }
  }
}

export default reportCommand;
