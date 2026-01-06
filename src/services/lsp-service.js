import { spawn } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger.js';

/**
 * LSP (Language Server Protocol) 服务
 * 提供代码智能功能：跳转定义、查找引用、类型信息等
 */
export class LSPService {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.servers = new Map(); // language -> server process
    this.requestId = 0;
    this.pendingRequests = new Map(); // id -> { resolve, reject }
    this.initialized = new Map(); // language -> boolean
    this.capabilities = new Map(); // language -> server capabilities
  }

  /**
   * 检测项目使用的编程语言
   */
  async detectLanguages() {
    const languages = new Set();

    try {
      // 检查常见配置文件
      const checks = [
        { file: 'package.json', lang: 'typescript' },
        { file: 'tsconfig.json', lang: 'typescript' },
        { file: 'jsconfig.json', lang: 'javascript' },
        { file: 'pyproject.toml', lang: 'python' },
        { file: 'requirements.txt', lang: 'python' },
        { file: 'setup.py', lang: 'python' },
        { file: 'go.mod', lang: 'go' },
        { file: 'Cargo.toml', lang: 'rust' },
      ];

      for (const check of checks) {
        try {
          await fs.access(path.join(this.projectRoot, check.file));
          languages.add(check.lang);
        } catch {
          // 文件不存在
        }
      }

      // 如果有 package.json 但没有 tsconfig，检查是否有 .ts 文件
      if (languages.has('typescript')) {
        // 保持 typescript
      } else {
        // 检查是否有 .js 文件
        try {
          const files = await fs.readdir(path.join(this.projectRoot, 'src'));
          if (files.some(f => f.endsWith('.js') || f.endsWith('.mjs'))) {
            languages.add('javascript');
          }
        } catch {
          // src 目录不存在
        }
      }
    } catch (error) {
      logger.warning(`语言检测失败: ${error.message}`);
    }

    return Array.from(languages);
  }

  /**
   * 获取语言对应的 LSP 服务器命令
   */
  getLSPCommand(language) {
    const commands = {
      typescript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
        fallback: { command: 'npx', args: ['typescript-language-server', '--stdio'] }
      },
      javascript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
        fallback: { command: 'npx', args: ['typescript-language-server', '--stdio'] }
      },
      python: {
        command: 'pyright-langserver',
        args: ['--stdio'],
        fallback: { command: 'npx', args: ['pyright-langserver', '--stdio'] }
      },
      go: {
        command: 'gopls',
        args: ['serve'],
        fallback: null
      }
    };

    return commands[language] || null;
  }

  /**
   * 启动指定语言的 LSP 服务器
   */
  async startServer(language) {
    if (this.servers.has(language)) {
      return true; // 已启动
    }

    const lspConfig = this.getLSPCommand(language);
    if (!lspConfig) {
      logger.warning(`不支持的语言: ${language}`);
      return false;
    }

    // 尝试启动服务器的函数
    const tryStartServer = (cmd, args) => {
      return new Promise((resolve) => {
        const serverProcess = spawn(cmd, args, {
          cwd: this.projectRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env }
        });

        let hasResolved = false;

        serverProcess.on('error', () => {
          if (!hasResolved) {
            hasResolved = true;
            resolve(null);
          }
        });

        // 给进程一小段时间来确认启动成功
        setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            resolve(serverProcess);
          }
        }, 500);
      });
    };

    try {
      // 尝试主命令
      let serverProcess = await tryStartServer(lspConfig.command, lspConfig.args);

      // 如果主命令失败，尝试 fallback
      if (!serverProcess && lspConfig.fallback) {
        serverProcess = await tryStartServer(lspConfig.fallback.command, lspConfig.fallback.args);
      }

      if (!serverProcess) {
        logger.warning(`无法启动 ${language} LSP 服务器 (未安装)`);
        return false;
      }

      // 设置消息处理
      this.setupMessageHandler(language, serverProcess);

      this.servers.set(language, serverProcess);

      // 发送 initialize 请求
      const initResult = await this.sendRequest(language, 'initialize', {
        processId: process.pid,
        rootUri: `file://${this.projectRoot}`,
        capabilities: {
          textDocument: {
            definition: { dynamicRegistration: false },
            references: { dynamicRegistration: false },
            hover: { contentFormat: ['plaintext', 'markdown'] },
            documentSymbol: { dynamicRegistration: false }
          }
        }
      });

      this.capabilities.set(language, initResult.capabilities || {});

      // 发送 initialized 通知
      this.sendNotification(language, 'initialized', {});

      this.initialized.set(language, true);
      logger.success(`${language} LSP 服务器已启动`);

      return true;
    } catch (error) {
      logger.warning(`启动 ${language} LSP 失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 设置 LSP 消息处理器
   */
  setupMessageHandler(language, serverProcess) {
    let buffer = '';
    let contentLength = -1;

    serverProcess.stdout.on('data', (data) => {
      buffer += data.toString();

      while (true) {
        if (contentLength === -1) {
          // 解析 header
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) break;

          const header = buffer.substring(0, headerEnd);
          const match = header.match(/Content-Length:\s*(\d+)/i);
          if (match) {
            contentLength = parseInt(match[1], 10);
          }
          buffer = buffer.substring(headerEnd + 4);
        }

        if (contentLength === -1) break;

        if (buffer.length >= contentLength) {
          const message = buffer.substring(0, contentLength);
          buffer = buffer.substring(contentLength);
          contentLength = -1;

          try {
            const json = JSON.parse(message);
            this.handleMessage(language, json);
          } catch {
            // 忽略解析错误
          }
        } else {
          break;
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      // LSP 服务器的 stderr 通常是日志
      // logger.debug(`[${language} LSP] ${data.toString()}`);
    });

    serverProcess.on('error', (error) => {
      logger.warning(`${language} LSP 进程错误: ${error.message}`);
      this.servers.delete(language);
      this.initialized.delete(language);
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        logger.warning(`${language} LSP 进程退出，代码: ${code}`);
      }
      this.servers.delete(language);
      this.initialized.delete(language);
    });
  }

  /**
   * 处理 LSP 消息
   */
  handleMessage(language, message) {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timeoutId } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      // 清理超时定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (message.error) {
        reject(new Error(message.error.message || 'LSP 错误'));
      } else {
        resolve(message.result);
      }
    }
  }

  /**
   * 发送 LSP 请求
   * @param {string} language - 语言
   * @param {string} method - LSP 方法
   * @param {Object} params - 参数
   * @param {number} timeout - 超时时间 (ms)
   */
  sendRequest(language, method, params, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const server = this.servers.get(language);
      if (!server) {
        reject(new Error(`${language} LSP 服务器未启动`));
        return;
      }

      const id = ++this.requestId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      const content = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

      this.pendingRequests.set(id, { resolve, reject });

      // 设置超时
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('LSP 请求超时'));
        }
      }, timeout);

      // 保存 timeout ID 以便清理
      const pending = this.pendingRequests.get(id);
      pending.timeoutId = timeoutId;

      server.stdin.write(header + content);
    });
  }

  /**
   * 发送 LSP 通知 (不需要响应)
   */
  sendNotification(language, method, params) {
    const server = this.servers.get(language);
    if (!server) return;

    const message = {
      jsonrpc: '2.0',
      method,
      params
    };

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

    server.stdin.write(header + content);
  }

  /**
   * 根据文件扩展名获取语言
   */
  getLanguageFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const langMap = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust'
    };
    return langMap[ext] || null;
  }

  /**
   * 确保文件对应的 LSP 服务器已启动
   */
  async ensureServerForFile(filePath) {
    const language = this.getLanguageFromFile(filePath);
    if (!language) return null;

    if (!this.initialized.get(language)) {
      await this.startServer(language);
    }

    return language;
  }

  /**
   * 通知 LSP 打开文件
   */
  async openFile(filePath) {
    const language = await this.ensureServerForFile(filePath);
    if (!language) return false;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const uri = `file://${path.resolve(filePath)}`;

      this.sendNotification(language, 'textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: language,
          version: 1,
          text: content
        }
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 跳转到定义
   * @param {string} filePath - 文件路径
   * @param {number} line - 行号 (1-based)
   * @param {number} character - 列号 (1-based)
   */
  async goToDefinition(filePath, line, character) {
    const language = await this.ensureServerForFile(filePath);
    if (!language) {
      return { error: '不支持的文件类型' };
    }

    await this.openFile(filePath);

    try {
      const result = await this.sendRequest(language, 'textDocument/definition', {
        textDocument: { uri: `file://${path.resolve(filePath)}` },
        position: { line: line - 1, character: character - 1 } // LSP 使用 0-based
      });

      return this.formatLocationResult(result);
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 查找引用
   * @param {string} filePath - 文件路径
   * @param {number} line - 行号 (1-based)
   * @param {number} character - 列号 (1-based)
   */
  async findReferences(filePath, line, character) {
    const language = await this.ensureServerForFile(filePath);
    if (!language) {
      return { error: '不支持的文件类型' };
    }

    await this.openFile(filePath);

    try {
      const result = await this.sendRequest(language, 'textDocument/references', {
        textDocument: { uri: `file://${path.resolve(filePath)}` },
        position: { line: line - 1, character: character - 1 },
        context: { includeDeclaration: true }
      });

      return this.formatLocationResult(result);
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 获取 Hover 信息 (类型、文档)
   * @param {string} filePath - 文件路径
   * @param {number} line - 行号 (1-based)
   * @param {number} character - 列号 (1-based)
   */
  async getHoverInfo(filePath, line, character) {
    const language = await this.ensureServerForFile(filePath);
    if (!language) {
      return { error: '不支持的文件类型' };
    }

    await this.openFile(filePath);

    try {
      const result = await this.sendRequest(language, 'textDocument/hover', {
        textDocument: { uri: `file://${path.resolve(filePath)}` },
        position: { line: line - 1, character: character - 1 }
      });

      if (!result) {
        return { info: null };
      }

      // 解析 hover 内容
      let content = '';
      if (result.contents) {
        if (typeof result.contents === 'string') {
          content = result.contents;
        } else if (result.contents.value) {
          content = result.contents.value;
        } else if (Array.isArray(result.contents)) {
          content = result.contents.map(c =>
            typeof c === 'string' ? c : c.value || ''
          ).join('\n');
        }
      }

      return {
        info: content,
        range: result.range ? {
          start: { line: result.range.start.line + 1, character: result.range.start.character + 1 },
          end: { line: result.range.end.line + 1, character: result.range.end.character + 1 }
        } : null
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 获取文档符号 (函数、类、变量列表)
   * @param {string} filePath - 文件路径
   */
  async getDocumentSymbols(filePath) {
    const language = await this.ensureServerForFile(filePath);
    if (!language) {
      return { error: '不支持的文件类型' };
    }

    await this.openFile(filePath);

    try {
      const result = await this.sendRequest(language, 'textDocument/documentSymbol', {
        textDocument: { uri: `file://${path.resolve(filePath)}` }
      });

      if (!result) {
        return { symbols: [] };
      }

      return {
        symbols: this.formatSymbols(result)
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 格式化位置结果
   */
  formatLocationResult(result) {
    if (!result) {
      return { locations: [] };
    }

    const locations = Array.isArray(result) ? result : [result];

    return {
      locations: locations.map(loc => {
        const uri = loc.uri || loc.targetUri;
        const range = loc.range || loc.targetRange;

        return {
          file: uri ? uri.replace('file://', '') : null,
          line: range ? range.start.line + 1 : null,
          character: range ? range.start.character + 1 : null,
          endLine: range ? range.end.line + 1 : null,
          endCharacter: range ? range.end.character + 1 : null
        };
      }).filter(l => l.file)
    };
  }

  /**
   * 格式化符号列表
   */
  formatSymbols(symbols, depth = 0) {
    const result = [];
    const symbolKindMap = {
      1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package',
      5: 'Class', 6: 'Method', 7: 'Property', 8: 'Field',
      9: 'Constructor', 10: 'Enum', 11: 'Interface', 12: 'Function',
      13: 'Variable', 14: 'Constant', 15: 'String', 16: 'Number',
      17: 'Boolean', 18: 'Array', 19: 'Object', 20: 'Key',
      21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event',
      25: 'Operator', 26: 'TypeParameter'
    };

    for (const sym of symbols) {
      const range = sym.range || sym.location?.range;
      result.push({
        name: sym.name,
        kind: symbolKindMap[sym.kind] || 'Unknown',
        depth,
        line: range ? range.start.line + 1 : null,
        endLine: range ? range.end.line + 1 : null
      });

      // 处理子符号
      if (sym.children && sym.children.length > 0) {
        result.push(...this.formatSymbols(sym.children, depth + 1));
      }
    }

    return result;
  }

  /**
   * 关闭所有 LSP 服务器
   */
  async shutdown() {
    for (const [language, server] of this.servers) {
      try {
        // 发送 shutdown 请求
        await this.sendRequest(language, 'shutdown', null).catch(() => {});
        // 发送 exit 通知
        this.sendNotification(language, 'exit', null);
        // 终止进程
        server.kill();
      } catch {
        // 忽略关闭错误
      }
    }

    this.servers.clear();
    this.initialized.clear();
    this.pendingRequests.clear();
  }

  /**
   * 检查 LSP 是否可用
   */
  isAvailable(language) {
    return this.initialized.get(language) === true;
  }

  /**
   * 获取已启动的语言列表
   */
  getActiveLanguages() {
    return Array.from(this.initialized.keys()).filter(lang => this.initialized.get(lang));
  }
}

// 单例
let lspInstance = null;

export function getLSPService(projectRoot) {
  if (!lspInstance || lspInstance.projectRoot !== projectRoot) {
    lspInstance = new LSPService(projectRoot);
  }
  return lspInstance;
}

export default LSPService;
