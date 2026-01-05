import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dayjs from 'dayjs';
import { getDatabase, getConfigDir } from './database.js';
import { AIClient } from './ai-client.js';
import { getConfig } from '../utils/config-store.js';
import { buildProjectReportPrompt, buildDeveloperReportPrompt } from '../prompts/report-prompt.js';

export class ReportGenerator {
  constructor() {
    this.db = getDatabase();
    this.config = getConfig();
    this.aiClient = new AIClient(this.config);
  }

  // 计算数据哈希 (用于缓存校验)
  calculateDataHash(data) {
    const str = JSON.stringify(data);
    return crypto.createHash('md5').update(str).digest('hex');
  }

  // 生成日期范围键 (用于缓存)
  buildDateRangeKey(options) {
    const since = options.since || 'default';
    const until = options.until || 'default';
    return `${since}:${until}`;
  }

  // 检查缓存是否有效
  checkCache(reportType, targetId, dateRangeKey, currentLatestReviewId) {
    const cache = this.db.getReportCache(reportType, targetId, dateRangeKey);
    if (!cache) {
      return { valid: false, reason: '无缓存记录' };
    }

    // 检查是否有新数据
    if (cache.last_review_id < currentLatestReviewId) {
      return { valid: false, reason: '有新的 Review 数据' };
    }

    // 检查缓存文件是否存在
    if (!fs.existsSync(cache.report_path)) {
      return { valid: false, reason: '缓存文件不存在' };
    }

    return { valid: true, cache };
  }

  // 生成项目报告
  async generateProjectReport(projectName, options = {}, onProgress) {
    // 获取项目
    const project = this.db.getProject(projectName);
    if (!project) {
      throw new Error(`项目 "${projectName}" 不存在`);
    }

    // 构建日期范围
    const dateRange = this.buildDateRange(options);
    const dateRangeKey = this.buildDateRangeKey(options);

    // 获取当前最新 review ID
    const latestReviewId = this.db.getLatestReviewId({
      projectId: project.id,
      since: dateRange.since,
      until: dateRange.until
    });

    // 检查缓存
    if (!options.force) {
      const cacheCheck = this.checkCache('project', project.id, dateRangeKey, latestReviewId);
      if (cacheCheck.valid) {
        if (onProgress) onProgress('使用缓存报告 (数据无变化)...');
        return cacheCheck.cache.report_path;
      }
      if (onProgress && cacheCheck.reason !== '无缓存记录') {
        onProgress(`缓存失效: ${cacheCheck.reason}，重新生成...`);
      }
    }

    // 收集数据
    if (onProgress) onProgress('正在收集项目数据...');
    const data = await this.gatherProjectData(project, dateRange);

    // 构建提示词
    if (onProgress) onProgress('正在生成报告...');
    const prompt = buildProjectReportPrompt(data);

    // 调用 AI 生成 HTML
    const html = await this.aiClient.analyze(prompt);

    // 保存报告
    const outputPath = this.saveReport(html, projectName, options.output);

    // 更新缓存
    const dataHash = this.calculateDataHash(data);
    this.db.saveReportCache('project', project.id, dateRangeKey, latestReviewId, dataHash, outputPath);

    return outputPath;
  }

  // 生成开发者报告
  async generateDeveloperReport(developerEmail, options = {}, onProgress) {
    // 获取开发者
    const developer = this.db.getDeveloper(developerEmail);
    if (!developer) {
      throw new Error(`开发者 "${developerEmail}" 不存在`);
    }

    // 构建日期范围
    const dateRange = this.buildDateRange(options);
    const dateRangeKey = this.buildDateRangeKey(options);

    // 获取当前最新 review ID
    const latestReviewId = this.db.getLatestReviewId({
      developerId: developer.id,
      since: dateRange.since,
      until: dateRange.until
    });

    // 检查缓存
    if (!options.force) {
      const cacheCheck = this.checkCache('developer', developer.id, dateRangeKey, latestReviewId);
      if (cacheCheck.valid) {
        if (onProgress) onProgress('使用缓存报告 (数据无变化)...');
        return cacheCheck.cache.report_path;
      }
      if (onProgress && cacheCheck.reason !== '无缓存记录') {
        onProgress(`缓存失效: ${cacheCheck.reason}，重新生成...`);
      }
    }

    // 收集数据
    if (onProgress) onProgress('正在收集开发者数据...');
    const data = await this.gatherDeveloperData(developer, dateRange);

    // 构建提示词
    if (onProgress) onProgress('正在生成报告...');
    const prompt = buildDeveloperReportPrompt(data);

    // 调用 AI 生成 HTML
    const html = await this.aiClient.analyze(prompt);

    // 保存报告
    const safeName = developerEmail.replace(/[@.]/g, '_');
    const outputPath = this.saveReport(html, `developer_${safeName}`, options.output);

    // 更新缓存
    const dataHash = this.calculateDataHash(data);
    this.db.saveReportCache('developer', developer.id, dateRangeKey, latestReviewId, dataHash, outputPath);

    return outputPath;
  }

  // 构建日期范围
  buildDateRange(options) {
    const dateRange = {
      start: options.since ? dayjs(options.since).format('YYYY-MM-DD') : dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
      end: options.until ? dayjs(options.until).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
    };

    return {
      ...dateRange,
      since: options.since ? dayjs(options.since).startOf('day').toISOString() : null,
      until: options.until ? dayjs(options.until).endOf('day').toISOString() : null
    };
  }

  // 收集项目数据
  async gatherProjectData(project, dateRange) {
    const filters = {
      projectId: project.id,
      since: dateRange.since,
      until: dateRange.until,
      limit: 100
    };

    // 获取统计数据
    const stats = this.db.getProjectStats(project.id, {
      since: dateRange.since,
      until: dateRange.until
    });

    // 获取开发者统计
    const developerStatsRaw = this.db.getDeveloperStatsByProject(project.id, {
      since: dateRange.since,
      until: dateRange.until
    });

    // 获取最近的 reviews
    const recentReviews = this.db.queryReviews({ ...filters, limit: 20 });

    // 处理开发者统计
    const developerStats = developerStatsRaw.map(dev => {
      const topIssues = this.db.getDeveloperTopIssues(dev.id, 3);
      const matchRate = dev.total_reviews > 0
        ? Math.round((dev.commit_match_count / dev.total_reviews) * 100)
        : 0;

      return {
        displayName: dev.display_name,
        email: dev.git_email,
        team: dev.team,
        totalReviews: dev.total_reviews,
        insertions: dev.total_insertions || 0,
        deletions: dev.total_deletions || 0,
        errors: dev.total_errors || 0,
        warnings: dev.total_warnings || 0,
        commitMatchRate: matchRate,
        topIssues: topIssues.map(i => ({
          level: i.level,
          file: i.file,
          description: i.description
        })),
        topRisks: [] // 可以扩展添加风险统计
      };
    });

    return {
      project: {
        name: project.name,
        path: project.path
      },
      dateRange: {
        start: dateRange.start,
        end: dateRange.end
      },
      stats: {
        totalReviews: stats.total_reviews || 0,
        totalInsertions: stats.total_insertions || 0,
        totalDeletions: stats.total_deletions || 0,
        totalErrors: stats.total_errors || 0,
        totalWarnings: stats.total_warnings || 0,
        totalInfos: stats.total_infos || 0,
        totalRisks: stats.total_risks || 0
      },
      developers: developerStatsRaw.map(d => ({
        displayName: d.display_name,
        email: d.git_email
      })),
      developerStats,
      recentReviews: recentReviews.map(r => ({
        commitSha: r.commit_sha,
        commitMessage: r.commit_message,
        commitDate: dayjs(r.commit_date).format('YYYY-MM-DD HH:mm'),
        developerName: r.developer_name,
        summary: r.summary,
        errorCount: r.error_count,
        warningCount: r.warning_count
      }))
    };
  }

  // 收集开发者数据
  async gatherDeveloperData(developer, dateRange) {
    const filters = {
      developerId: developer.id,
      since: dateRange.since,
      until: dateRange.until,
      limit: 100
    };

    // 获取统计数据
    const stats = this.db.getDeveloperStats(developer.id, {
      since: dateRange.since,
      until: dateRange.until
    });

    // 获取 reviews
    const reviews = this.db.queryReviews(filters);

    // 获取问题分布
    const issueDistribution = this.db.getIssueTypeDistribution({
      developerId: developer.id,
      since: dateRange.since,
      until: dateRange.until
    });

    // 获取典型问题
    const topIssues = this.db.getDeveloperTopIssues(developer.id, 5);

    // 按项目分组统计
    const projectStats = {};
    reviews.forEach(r => {
      if (!projectStats[r.project_name]) {
        projectStats[r.project_name] = { name: r.project_name, commits: 0 };
      }
      projectStats[r.project_name].commits++;
    });

    // 获取关联风险
    const topRisks = [];
    for (const review of reviews.slice(0, 10)) {
      const risks = this.db.db.prepare('SELECT * FROM association_risks WHERE review_id = ? LIMIT 2').all(review.id);
      risks.forEach(risk => {
        topRisks.push({
          changedFile: risk.changed_file,
          relatedFiles: risk.related_files,
          risk: risk.risk
        });
      });
    }

    const matchRate = stats.total_reviews > 0
      ? Math.round((stats.commit_match_count / stats.total_reviews) * 100)
      : 0;

    return {
      developer: {
        displayName: developer.display_name,
        email: developer.git_email,
        team: developer.team
      },
      dateRange: {
        start: dateRange.start,
        end: dateRange.end
      },
      projects: Object.values(projectStats),
      stats: {
        totalReviews: stats.total_reviews || 0,
        totalInsertions: stats.total_insertions || 0,
        totalDeletions: stats.total_deletions || 0,
        totalErrors: stats.total_errors || 0,
        totalWarnings: stats.total_warnings || 0,
        commitMatchRate: matchRate
      },
      issueDistribution: issueDistribution.map(i => ({
        type: i.type || 'unknown',
        level: i.level,
        count: i.count
      })),
      topIssues: topIssues.map(i => ({
        level: i.level,
        type: i.type,
        file: i.file,
        line: i.line,
        description: i.description,
        suggestion: i.suggestion
      })),
      topRisks: topRisks.slice(0, 5),
      reviews: reviews.map(r => ({
        projectName: r.project_name,
        commitSha: r.commit_sha,
        commitMessage: r.commit_message,
        commitDate: dayjs(r.commit_date).format('YYYY-MM-DD HH:mm'),
        summary: r.summary,
        errorCount: r.error_count,
        warningCount: r.warning_count,
        infoCount: r.info_count
      }))
    };
  }

  // 保存报告
  saveReport(html, name, customOutput) {
    let outputPath;

    if (customOutput) {
      outputPath = path.resolve(customOutput);
    } else {
      const reportsDir = path.join(getConfigDir(), 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      const filename = `${name}_${dayjs().format('YYYY-MM-DD_HH-mm')}.html`;
      outputPath = path.join(reportsDir, filename);
    }

    // 确保目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, html, 'utf-8');
    return outputPath;
  }
}

export default ReportGenerator;
