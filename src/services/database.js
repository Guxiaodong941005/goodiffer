import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// 获取配置目录
function getConfigDir() {
  const configDir = path.join(os.homedir(), '.config', 'goodiffer-nodejs');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return configDir;
}

class GoodifferDatabase {
  constructor() {
    this.dbPath = path.join(getConfigDir(), 'goodiffer.db');
    this.db = null;
  }

  init() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTables();
    return this;
  }

  createTables() {
    // 项目表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 开发者表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS developers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        git_email TEXT NOT NULL UNIQUE,
        git_name TEXT NOT NULL,
        display_name TEXT,
        team TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 开发者别名映射表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS developer_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_pattern TEXT NOT NULL,
        developer_id INTEGER NOT NULL,
        FOREIGN KEY (developer_id) REFERENCES developers(id)
      )
    `);

    // Code Review 记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        developer_id INTEGER NOT NULL,
        commit_sha TEXT NOT NULL,
        commit_message TEXT NOT NULL,
        commit_date DATETIME NOT NULL,
        branch TEXT,
        review_type TEXT NOT NULL,
        from_sha TEXT,
        to_sha TEXT,
        files_changed INTEGER DEFAULT 0,
        insertions INTEGER DEFAULT 0,
        deletions INTEGER DEFAULT 0,
        diff_content TEXT,
        ai_response TEXT NOT NULL,
        summary TEXT,
        commit_match INTEGER,
        commit_match_reason TEXT,
        error_count INTEGER DEFAULT 0,
        warning_count INTEGER DEFAULT 0,
        info_count INTEGER DEFAULT 0,
        risk_count INTEGER DEFAULT 0,
        model_used TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (developer_id) REFERENCES developers(id)
      )
    `);

    // Issues 详细表 (支持新旧两种格式)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        level TEXT,
        type TEXT,
        file TEXT,
        line TEXT,
        code TEXT,
        description TEXT,
        suggestion TEXT,
        fix_prompt TEXT,
        title TEXT,
        body TEXT,
        priority INTEGER,
        confidence_score REAL,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
      )
    `);

    // 关联风险表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS association_risks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        changed_file TEXT NOT NULL,
        related_files TEXT,
        risk TEXT NOT NULL,
        check_prompt TEXT,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_developer ON reviews(developer_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(commit_date);
      CREATE INDEX IF NOT EXISTS idx_reviews_commit ON reviews(commit_sha);
      CREATE INDEX IF NOT EXISTS idx_issues_review ON issues(review_id);
      CREATE INDEX IF NOT EXISTS idx_issues_level ON issues(level);
    `);

    // 报告缓存表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS report_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        date_range_key TEXT NOT NULL,
        last_review_id INTEGER NOT NULL,
        data_hash TEXT NOT NULL,
        report_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(report_type, target_id, date_range_key)
      )
    `);

    // 迁移：添加新列到 issues 表 (如果不存在)
    this.migrateIssuesTable();
  }

  // 数据库迁移：为 issues 表添加新字段
  migrateIssuesTable() {
    try {
      // 检查是否有 title 列
      const columns = this.db.prepare("PRAGMA table_info(issues)").all();
      const columnNames = columns.map(c => c.name);

      if (!columnNames.includes('title')) {
        this.db.exec('ALTER TABLE issues ADD COLUMN title TEXT');
      }
      if (!columnNames.includes('body')) {
        this.db.exec('ALTER TABLE issues ADD COLUMN body TEXT');
      }
      if (!columnNames.includes('priority')) {
        this.db.exec('ALTER TABLE issues ADD COLUMN priority INTEGER');
      }
      if (!columnNames.includes('confidence_score')) {
        this.db.exec('ALTER TABLE issues ADD COLUMN confidence_score REAL');
      }
    } catch (e) {
      // 忽略迁移错误
    }
  }

  // ============ 项目操作 ============

  getOrCreateProject(name, projectPath) {
    let project = this.db.prepare('SELECT * FROM projects WHERE name = ?').get(name);
    if (!project) {
      const result = this.db.prepare(
        'INSERT INTO projects (name, path) VALUES (?, ?)'
      ).run(name, projectPath);
      project = { id: result.lastInsertRowid, name, path: projectPath };
    } else {
      // 更新路径和时间
      this.db.prepare(
        'UPDATE projects SET path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(projectPath, project.id);
    }
    return project;
  }

  getProject(name) {
    return this.db.prepare('SELECT * FROM projects WHERE name = ?').get(name);
  }

  listProjects() {
    return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  }

  // ============ 开发者操作 ============

  getOrCreateDeveloper(gitEmail, gitName) {
    let developer = this.db.prepare('SELECT * FROM developers WHERE git_email = ?').get(gitEmail);
    if (!developer) {
      const result = this.db.prepare(
        'INSERT INTO developers (git_email, git_name, display_name) VALUES (?, ?, ?)'
      ).run(gitEmail, gitName, gitName);
      developer = { id: result.lastInsertRowid, git_email: gitEmail, git_name: gitName, display_name: gitName };
    }
    return developer;
  }

  getDeveloper(email) {
    return this.db.prepare('SELECT * FROM developers WHERE git_email = ?').get(email);
  }

  getDeveloperById(id) {
    return this.db.prepare('SELECT * FROM developers WHERE id = ?').get(id);
  }

  listDevelopers() {
    return this.db.prepare('SELECT * FROM developers ORDER BY git_name').all();
  }

  updateDeveloper(email, updates) {
    const { displayName, team } = updates;
    if (displayName !== undefined) {
      this.db.prepare('UPDATE developers SET display_name = ? WHERE git_email = ?').run(displayName, email);
    }
    if (team !== undefined) {
      this.db.prepare('UPDATE developers SET team = ? WHERE git_email = ?').run(team, email);
    }
  }

  // 设置开发者别名
  setDeveloperAlias(emailPattern, targetEmail) {
    const target = this.getDeveloper(targetEmail);
    if (!target) {
      throw new Error(`开发者 ${targetEmail} 不存在`);
    }
    // 删除旧的映射
    this.db.prepare('DELETE FROM developer_aliases WHERE email_pattern = ?').run(emailPattern);
    // 添加新映射
    this.db.prepare(
      'INSERT INTO developer_aliases (email_pattern, developer_id) VALUES (?, ?)'
    ).run(emailPattern, target.id);
  }

  // 解析开发者（考虑别名）
  resolveDeveloper(email) {
    // 先检查别名映射
    const alias = this.db.prepare(`
      SELECT developer_id FROM developer_aliases
      WHERE ? LIKE email_pattern
      ORDER BY LENGTH(email_pattern) DESC
      LIMIT 1
    `).get(email);

    if (alias) {
      return this.getDeveloperById(alias.developer_id);
    }

    // 直接匹配
    return this.getDeveloper(email);
  }

  // ============ Review 操作 ============

  saveReview(reviewData) {
    const {
      projectId, developerId, commitSha, commitMessage, commitDate, branch,
      reviewType, fromSha, toSha, filesChanged, insertions, deletions,
      diffContent, aiResponse, summary, commitMatch, commitMatchReason,
      errorCount, warningCount, infoCount, riskCount, modelUsed,
      issues, associationRisks
    } = reviewData;

    // 插入 review 记录
    const result = this.db.prepare(`
      INSERT INTO reviews (
        project_id, developer_id, commit_sha, commit_message, commit_date, branch,
        review_type, from_sha, to_sha, files_changed, insertions, deletions,
        diff_content, ai_response, summary, commit_match, commit_match_reason,
        error_count, warning_count, info_count, risk_count, model_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId, developerId, commitSha, commitMessage, commitDate, branch,
      reviewType, fromSha, toSha, filesChanged, insertions, deletions,
      diffContent, aiResponse, summary, commitMatch ? 1 : 0, commitMatchReason,
      errorCount, warningCount, infoCount, riskCount, modelUsed
    );

    const reviewId = result.lastInsertRowid;

    // 插入 issues (支持新旧两种格式)
    if (issues && issues.length > 0) {
      const insertIssue = this.db.prepare(`
        INSERT INTO issues (review_id, level, type, file, line, code, description, suggestion, fix_prompt, title, body, priority, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const issue of issues) {
        // 判断是新格式还是旧格式
        const isNewFormat = issue.priority !== undefined || issue.title !== undefined;

        if (isNewFormat) {
          // 新格式 (findings)
          const file = issue.code_location?.absolute_file_path || '';
          const lineRange = issue.code_location?.line_range;
          const line = lineRange ? `${lineRange.start}-${lineRange.end}` : '';
          // 将 priority 映射到 level
          const priorityToLevel = { 0: 'error', 1: 'error', 2: 'warning', 3: 'info' };
          const level = priorityToLevel[issue.priority] || 'info';

          insertIssue.run(
            reviewId,
            level,
            '', // type
            file,
            line,
            '', // code
            issue.body || '',
            issue.suggestion || '',
            issue.fixPrompt || '',
            issue.title || '',
            issue.body || '',
            issue.priority,
            issue.confidence_score || null
          );
        } else {
          // 旧格式 (issues)
          insertIssue.run(
            reviewId,
            issue.level || 'info',
            issue.type || '',
            issue.file || '',
            issue.line || '',
            issue.code || '',
            issue.description || '',
            issue.suggestion || '',
            issue.fixPrompt || '',
            '', // title
            '', // body
            null, // priority
            null  // confidence_score
          );
        }
      }
    }

    // 插入关联风险
    if (associationRisks && associationRisks.length > 0) {
      const insertRisk = this.db.prepare(`
        INSERT INTO association_risks (review_id, changed_file, related_files, risk, check_prompt)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const risk of associationRisks) {
        insertRisk.run(
          reviewId, risk.changedFile || '',
          JSON.stringify(risk.relatedFiles || []),
          risk.risk || '', risk.checkPrompt || ''
        );
      }
    }

    return reviewId;
  }

  getReview(id) {
    const review = this.db.prepare(`
      SELECT r.*, p.name as project_name, d.display_name as developer_name, d.git_email as developer_email
      FROM reviews r
      JOIN projects p ON r.project_id = p.id
      JOIN developers d ON r.developer_id = d.id
      WHERE r.id = ?
    `).get(id);

    if (review) {
      review.issues = this.db.prepare('SELECT * FROM issues WHERE review_id = ?').all(id);
      review.associationRisks = this.db.prepare('SELECT * FROM association_risks WHERE review_id = ?').all(id);
    }

    return review;
  }

  queryReviews(filters = {}) {
    const { projectId, developerId, since, until, limit = 50, offset = 0 } = filters;

    let sql = `
      SELECT r.*, p.name as project_name, d.display_name as developer_name, d.git_email as developer_email
      FROM reviews r
      JOIN projects p ON r.project_id = p.id
      JOIN developers d ON r.developer_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (projectId) {
      sql += ' AND r.project_id = ?';
      params.push(projectId);
    }

    if (developerId) {
      sql += ' AND r.developer_id = ?';
      params.push(developerId);
    }

    if (since) {
      sql += ' AND r.commit_date >= ?';
      params.push(since);
    }

    if (until) {
      sql += ' AND r.commit_date <= ?';
      params.push(until);
    }

    sql += ' ORDER BY r.commit_date DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params);
  }

  // ============ 统计查询 ============

  getProjectStats(projectId, dateRange = {}) {
    let sql = `
      SELECT
        COUNT(*) as total_reviews,
        SUM(error_count) as total_errors,
        SUM(warning_count) as total_warnings,
        SUM(info_count) as total_infos,
        SUM(risk_count) as total_risks,
        SUM(insertions) as total_insertions,
        SUM(deletions) as total_deletions,
        SUM(files_changed) as total_files_changed,
        COUNT(DISTINCT developer_id) as developer_count
      FROM reviews
      WHERE project_id = ?
    `;
    const params = [projectId];

    if (dateRange.since) {
      sql += ' AND commit_date >= ?';
      params.push(dateRange.since);
    }

    if (dateRange.until) {
      sql += ' AND commit_date <= ?';
      params.push(dateRange.until);
    }

    return this.db.prepare(sql).get(...params);
  }

  getDeveloperStats(developerId, dateRange = {}) {
    let sql = `
      SELECT
        COUNT(*) as total_reviews,
        SUM(error_count) as total_errors,
        SUM(warning_count) as total_warnings,
        SUM(info_count) as total_infos,
        SUM(risk_count) as total_risks,
        SUM(insertions) as total_insertions,
        SUM(deletions) as total_deletions,
        SUM(files_changed) as total_files_changed,
        COUNT(DISTINCT project_id) as project_count,
        SUM(CASE WHEN commit_match = 1 THEN 1 ELSE 0 END) as commit_match_count
      FROM reviews
      WHERE developer_id = ?
    `;
    const params = [developerId];

    if (dateRange.since) {
      sql += ' AND commit_date >= ?';
      params.push(dateRange.since);
    }

    if (dateRange.until) {
      sql += ' AND commit_date <= ?';
      params.push(dateRange.until);
    }

    return this.db.prepare(sql).get(...params);
  }

  getDeveloperStatsByProject(projectId, dateRange = {}) {
    let sql = `
      SELECT
        d.id, d.display_name, d.git_email, d.team,
        COUNT(*) as total_reviews,
        SUM(r.error_count) as total_errors,
        SUM(r.warning_count) as total_warnings,
        SUM(r.info_count) as total_infos,
        SUM(r.risk_count) as total_risks,
        SUM(r.insertions) as total_insertions,
        SUM(r.deletions) as total_deletions,
        SUM(CASE WHEN r.commit_match = 1 THEN 1 ELSE 0 END) as commit_match_count
      FROM reviews r
      JOIN developers d ON r.developer_id = d.id
      WHERE r.project_id = ?
    `;
    const params = [projectId];

    if (dateRange.since) {
      sql += ' AND r.commit_date >= ?';
      params.push(dateRange.since);
    }

    if (dateRange.until) {
      sql += ' AND r.commit_date <= ?';
      params.push(dateRange.until);
    }

    sql += ' GROUP BY d.id ORDER BY total_reviews DESC';

    return this.db.prepare(sql).all(...params);
  }

  getIssueTypeDistribution(filters = {}) {
    const { projectId, developerId, since, until } = filters;

    let sql = `
      SELECT i.type, i.level, COUNT(*) as count
      FROM issues i
      JOIN reviews r ON i.review_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (projectId) {
      sql += ' AND r.project_id = ?';
      params.push(projectId);
    }

    if (developerId) {
      sql += ' AND r.developer_id = ?';
      params.push(developerId);
    }

    if (since) {
      sql += ' AND r.commit_date >= ?';
      params.push(since);
    }

    if (until) {
      sql += ' AND r.commit_date <= ?';
      params.push(until);
    }

    sql += ' GROUP BY i.type, i.level ORDER BY count DESC';

    return this.db.prepare(sql).all(...params);
  }

  // 获取开发者的典型问题
  getDeveloperTopIssues(developerId, limit = 5) {
    return this.db.prepare(`
      SELECT i.*, r.commit_sha, r.commit_message, p.name as project_name
      FROM issues i
      JOIN reviews r ON i.review_id = r.id
      JOIN projects p ON r.project_id = p.id
      WHERE r.developer_id = ?
      ORDER BY
        CASE i.level WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        r.commit_date DESC
      LIMIT ?
    `).all(developerId, limit);
  }

  // 获取所有 reviews 的详细数据（用于报告生成）
  getReviewsWithDetails(filters = {}) {
    const reviews = this.queryReviews(filters);

    for (const review of reviews) {
      review.issues = this.db.prepare('SELECT * FROM issues WHERE review_id = ?').all(review.id);
      review.associationRisks = this.db.prepare('SELECT * FROM association_risks WHERE review_id = ?').all(review.id);
    }

    return reviews;
  }

  // ============ 报告缓存操作 ============

  // 获取报告缓存
  getReportCache(reportType, targetId, dateRangeKey) {
    return this.db.prepare(`
      SELECT * FROM report_cache
      WHERE report_type = ? AND target_id = ? AND date_range_key = ?
    `).get(reportType, targetId, dateRangeKey);
  }

  // 保存报告缓存
  saveReportCache(reportType, targetId, dateRangeKey, lastReviewId, dataHash, reportPath) {
    return this.db.prepare(`
      INSERT OR REPLACE INTO report_cache (report_type, target_id, date_range_key, last_review_id, data_hash, report_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(reportType, targetId, dateRangeKey, lastReviewId, dataHash, reportPath);
  }

  // 获取最新 review ID (用于缓存检测)
  getLatestReviewId(filters = {}) {
    const { projectId, developerId, since, until } = filters;

    let sql = 'SELECT MAX(id) as max_id FROM reviews WHERE 1=1';
    const params = [];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    if (developerId) {
      sql += ' AND developer_id = ?';
      params.push(developerId);
    }

    if (since) {
      sql += ' AND commit_date >= ?';
      params.push(since);
    }

    if (until) {
      sql += ' AND commit_date <= ?';
      params.push(until);
    }

    const result = this.db.prepare(sql).get(...params);
    return result?.max_id || 0;
  }

  // 删除过期缓存
  cleanExpiredCache(days = 7) {
    return this.db.prepare(`
      DELETE FROM report_cache
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `).run(days);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// 单例实例
let instance = null;

export function getDatabase() {
  if (!instance) {
    instance = new GoodifferDatabase();
    instance.init();
  }
  return instance;
}

export { GoodifferDatabase, getConfigDir };
export default GoodifferDatabase;
