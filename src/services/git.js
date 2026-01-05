import simpleGit from 'simple-git';

export class GitService {
  constructor(basePath = process.cwd()) {
    this.git = simpleGit(basePath);
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
    const log = await this.git.log({ from: sha, to: sha, maxCount: 1 });
    if (!log.latest) {
      throw new Error(`无法获取 commit ${sha} 的信息`);
    }
    return {
      sha: log.latest.hash,
      message: log.latest.message
    };
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
}

export default GitService;
