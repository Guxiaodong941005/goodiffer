import simpleGit from 'simple-git';
import path from 'path';

export class GitService {
  constructor(basePath = process.cwd()) {
    this.git = simpleGit(basePath);
    this.basePath = basePath;
  }

  async isGitRepo() {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async getLastCommitInfo() {
    const log = await this.git.log({ maxCount: 1 });
    if (!log.latest) {
      throw new Error('无法获取 commit 信息');
    }
    return {
      sha: log.latest.hash,
      message: log.latest.message
    };
  }

  async getCommitInfo(sha) {
    // 使用 raw 命令获取特定 commit 信息
    try {
      const result = await this.git.raw(['log', '-1', '--format=%H%n%s', sha]);
      const lines = result.trim().split('\n');
      if (lines.length < 2) {
        throw new Error(`无法获取 commit ${sha} 的信息`);
      }
      return {
        sha: lines[0],
        message: lines.slice(1).join('\n')
      };
    } catch (error) {
      throw new Error(`无法获取 commit ${sha} 的信息`);
    }
  }

  async getLastCommitDiff() {
    const diff = await this.git.diff(['HEAD~1', 'HEAD']);
    return diff;
  }

  async getCommitDiff(sha) {
    const diff = await this.git.diff([`${sha}~1`, sha]);
    return diff;
  }

  async getStagedDiff() {
    const diff = await this.git.diff(['--cached']);
    return diff;
  }

  async getRangeDiff(from, to) {
    const diff = await this.git.diff([from, to]);
    return diff;
  }

  async getChangedFiles() {
    const status = await this.git.status();
    return {
      staged: status.staged,
      modified: status.modified,
      created: status.created,
      deleted: status.deleted
    };
  }

  // 获取 commit 的 author 信息
  async getCommitAuthor(sha) {
    if (!sha || sha === 'staged') {
      // 对于暂存区，使用当前用户配置
      const config = await this.git.raw(['config', 'user.name']);
      const email = await this.git.raw(['config', 'user.email']);
      return {
        name: config.trim(),
        email: email.trim(),
        date: new Date().toISOString()
      };
    }

    // 使用 raw 命令获取特定 commit 的作者信息
    try {
      const result = await this.git.raw([
        'log', '-1',
        '--format=%an%n%ae%n%aI',
        sha
      ]);
      const lines = result.trim().split('\n');
      if (lines.length < 3) {
        throw new Error(`无法获取 commit ${sha} 的作者信息`);
      }
      return {
        name: lines[0],
        email: lines[1],
        date: lines[2]
      };
    } catch (error) {
      throw new Error(`无法获取 commit ${sha} 的作者信息`);
    }
  }

  // 获取最近 commit 的 author 信息
  async getLastCommitAuthor() {
    const log = await this.git.log({ maxCount: 1 });
    if (!log.latest) {
      throw new Error('无法获取 commit 作者信息');
    }
    return {
      name: log.latest.author_name,
      email: log.latest.author_email,
      date: log.latest.date
    };
  }

  // 获取项目名称 (从 remote 或目录名)
  async getProjectName() {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      if (origin && origin.refs && origin.refs.fetch) {
        // 从 URL 提取项目名
        const url = origin.refs.fetch;
        const match = url.match(/\/([^\/]+?)(?:\.git)?$/);
        if (match) return match[1];
      }
    } catch {
      // 忽略错误
    }
    // 回退到目录名
    return path.basename(this.basePath);
  }

  // 获取 diff 统计
  async getDiffStats(from, to) {
    try {
      let args = [];
      if (from && to) {
        args = [from, to];
      } else if (from) {
        args = [from];
      } else {
        args = ['HEAD~1', 'HEAD'];
      }

      const summary = await this.git.diffSummary(args);
      return {
        filesChanged: summary.changed || 0,
        insertions: summary.insertions || 0,
        deletions: summary.deletions || 0
      };
    } catch {
      return {
        filesChanged: 0,
        insertions: 0,
        deletions: 0
      };
    }
  }

  // 获取暂存区的 diff 统计
  async getStagedDiffStats() {
    try {
      const summary = await this.git.diffSummary(['--cached']);
      return {
        filesChanged: summary.changed || 0,
        insertions: summary.insertions || 0,
        deletions: summary.deletions || 0
      };
    } catch {
      return {
        filesChanged: 0,
        insertions: 0,
        deletions: 0
      };
    }
  }

  // 获取当前分支
  async getCurrentBranch() {
    try {
      const branch = await this.git.branch();
      return branch.current;
    } catch {
      return 'unknown';
    }
  }

  // 获取最近 n 条 commits (按时间从新到旧排序)
  async getRecentCommits(count) {
    const log = await this.git.log({ maxCount: count });
    return log.all.map(commit => ({
      sha: commit.hash,
      message: commit.message,
      author: {
        name: commit.author_name,
        email: commit.author_email,
        date: commit.date
      }
    }));
  }

  // 获取指定范围的 commits (从第 start 条到第 end 条，1-based，按时间从新到旧)
  async getCommitRange(start, end) {
    // start 和 end 是 1-based 索引
    // 例如 start=2, end=5 表示第 2、3、4、5 条 commit
    const skip = start - 1;
    const count = end - start + 1;

    const log = await this.git.log({
      maxCount: count,
      '--skip': skip
    });

    return log.all.map(commit => ({
      sha: commit.hash,
      message: commit.message,
      author: {
        name: commit.author_name,
        email: commit.author_email,
        date: commit.date
      }
    }));
  }
}

export default GitService;
