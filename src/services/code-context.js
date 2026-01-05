import fs from 'fs/promises';
import path from 'path';
import { getMCPClient, MCPClientService } from './mcp-client.js';
import logger from '../utils/logger.js';

/**
 * 代码上下文服务
 * 提供 Tool Use 定义和执行逻辑
 */
export class CodeContextService {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.mcpClient = null;
    this.useMCP = false;
  }

  /**
   * 初始化服务
   * @param {boolean} enableMCP - 是否启用 MCP
   */
  async initialize(enableMCP = false) {
    if (enableMCP) {
      this.mcpClient = getMCPClient();

      // 尝试连接 Claude Code MCP
      const connected = await this.mcpClient.connect({
        cwd: this.projectRoot
      });

      this.useMCP = connected;

      if (!connected) {
        logger.warning('MCP 连接失败，将使用本地文件读取');
      }
    }
  }

  /**
   * 关闭服务
   */
  async close() {
    if (this.mcpClient) {
      await this.mcpClient.disconnect();
    }
  }

  /**
   * 获取 Claude API Tool Use 工具定义
   */
  static getToolDefinitions() {
    return [
      {
        name: 'read_file',
        description: '读取项目中的源代码文件，用于获取函数定义、类定义等代码上下文。当你需要查看某个被调用的函数、类或模块的具体实现时使用此工具。',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: '相对于项目根目录的文件路径，如 "src/utils/helper.js"'
            },
            line_start: {
              type: 'number',
              description: '起始行号 (可选，从 1 开始)'
            },
            line_end: {
              type: 'number',
              description: '结束行号 (可选)'
            }
          },
          required: ['file_path']
        }
      },
      {
        name: 'find_definition',
        description: '查找函数、类、变量的定义位置。当 diff 中调用了某个函数但你不知道它的实现时使用。',
        input_schema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: '要查找的符号名称，如函数名 "getUserById" 或类名 "UserService"'
            },
            file_hint: {
              type: 'string',
              description: '提示文件路径，帮助缩小搜索范围 (可选)'
            }
          },
          required: ['symbol']
        }
      },
      {
        name: 'search_code',
        description: '在项目中搜索代码模式。用于查找特定函数的使用位置、类的实例化位置等。',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: '搜索的代码模式，支持正则表达式'
            },
            file_pattern: {
              type: 'string',
              description: '文件匹配模式，如 "*.js" 或 "*.ts" (可选)'
            }
          },
          required: ['pattern']
        }
      },
      {
        name: 'list_files',
        description: '列出目录下的文件结构，帮助了解项目组织。',
        input_schema: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: '要列出的目录路径，相对于项目根目录，默认为 "."'
            },
            pattern: {
              type: 'string',
              description: '文件匹配模式，如 "*.js" (可选)'
            }
          },
          required: []
        }
      }
    ];
  }

  /**
   * 执行工具调用
   * @param {string} toolName - 工具名称
   * @param {Object} toolInput - 工具输入
   */
  async executeTool(toolName, toolInput) {
    try {
      switch (toolName) {
        case 'read_file':
          return await this.readFile(toolInput);
        case 'find_definition':
          return await this.findDefinition(toolInput);
        case 'search_code':
          return await this.searchCode(toolInput);
        case 'list_files':
          return await this.listFiles(toolInput);
        default:
          return { error: `未知工具: ${toolName}` };
      }
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 读取文件
   */
  async readFile({ file_path, line_start, line_end }) {
    const fullPath = path.resolve(this.projectRoot, file_path);

    // 安全检查：确保路径在项目内
    if (!fullPath.startsWith(this.projectRoot)) {
      return { error: '不允许访问项目目录外的文件' };
    }

    try {
      // 优先使用 MCP
      if (this.useMCP && this.mcpClient) {
        const result = await this.mcpClient.readFile(fullPath);
        if (result && result.content) {
          return this.formatFileContent(result.content, line_start, line_end);
        }
      }

      // 回退到本地读取
      const content = await fs.readFile(fullPath, 'utf-8');
      return this.formatFileContent(content, line_start, line_end);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { error: `文件不存在: ${file_path}` };
      }
      return { error: `读取文件失败: ${error.message}` };
    }
  }

  /**
   * 格式化文件内容（带行号范围）
   */
  formatFileContent(content, lineStart, lineEnd) {
    const lines = content.split('\n');
    const start = lineStart ? Math.max(1, lineStart) : 1;
    const end = lineEnd ? Math.min(lines.length, lineEnd) : lines.length;

    const selectedLines = lines.slice(start - 1, end);
    const numberedLines = selectedLines.map((line, i) => `${start + i}: ${line}`);

    return {
      content: numberedLines.join('\n'),
      total_lines: lines.length,
      showing: `${start}-${end}`
    };
  }

  /**
   * 查找定义
   */
  async findDefinition({ symbol, file_hint }) {
    // 优先使用 MCP 的 LSP 功能
    if (this.useMCP && this.mcpClient && this.mcpClient.hasToolAvailable('goToDefinition')) {
      // 需要先找到符号所在位置
      const searchResult = await this.searchCode({ pattern: symbol, file_pattern: file_hint });
      if (searchResult.matches && searchResult.matches.length > 0) {
        const firstMatch = searchResult.matches[0];
        try {
          const defResult = await this.mcpClient.goToDefinition(
            firstMatch.file,
            firstMatch.line,
            firstMatch.column || 1
          );
          return defResult;
        } catch {
          // 回退到搜索
        }
      }
    }

    // 回退：使用正则搜索定义模式
    const patterns = [
      `function\\s+${symbol}\\s*\\(`,           // function name()
      `const\\s+${symbol}\\s*=`,                // const name =
      `let\\s+${symbol}\\s*=`,                  // let name =
      `var\\s+${symbol}\\s*=`,                  // var name =
      `class\\s+${symbol}\\s*[{<]`,             // class Name { or class Name<T>
      `interface\\s+${symbol}\\s*[{<]`,         // interface Name
      `type\\s+${symbol}\\s*=`,                 // type Name =
      `export\\s+(default\\s+)?function\\s+${symbol}`,
      `export\\s+(default\\s+)?class\\s+${symbol}`,
      `${symbol}\\s*:\\s*function`,             // name: function
      `${symbol}\\s*=\\s*\\([^)]*\\)\\s*=>`,    // name = () =>
      `async\\s+${symbol}\\s*\\(`,              // async name()
      `def\\s+${symbol}\\s*\\(`,                // Python: def name()
      `class\\s+${symbol}\\s*:`,                // Python: class Name:
    ];

    const combinedPattern = patterns.join('|');
    return await this.searchCode({
      pattern: combinedPattern,
      file_pattern: file_hint || '*'
    });
  }

  /**
   * 搜索代码
   */
  async searchCode({ pattern, file_pattern }) {
    // 优先使用 MCP
    if (this.useMCP && this.mcpClient && this.mcpClient.hasToolAvailable('Grep')) {
      try {
        const result = await this.mcpClient.searchCode(pattern, this.projectRoot);
        return this.formatSearchResult(result);
      } catch {
        // 回退到本地搜索
      }
    }

    // 本地搜索（简单实现）
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      let cmd = `grep -rn "${pattern.replace(/"/g, '\\"')}" --include="${file_pattern || '*'}" .`;
      const { stdout } = await execAsync(cmd, {
        cwd: this.projectRoot,
        maxBuffer: 1024 * 1024 // 1MB
      });

      const matches = stdout.split('\n')
        .filter(line => line.trim())
        .slice(0, 20) // 限制结果数量
        .map(line => {
          const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
          if (match) {
            return {
              file: match[1],
              line: parseInt(match[2]),
              content: match[3].trim()
            };
          }
          return null;
        })
        .filter(Boolean);

      return { matches, total: matches.length };
    } catch (error) {
      // grep 没找到时返回空
      if (error.code === 1) {
        return { matches: [], total: 0 };
      }
      return { error: `搜索失败: ${error.message}` };
    }
  }

  /**
   * 列出文件
   */
  async listFiles({ directory = '.', pattern }) {
    const targetDir = path.resolve(this.projectRoot, directory);

    // 安全检查
    if (!targetDir.startsWith(this.projectRoot)) {
      return { error: '不允许访问项目目录外的路径' };
    }

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const files = entries
        .filter(entry => {
          if (pattern) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(entry.name);
          }
          return true;
        })
        .map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file'
        }))
        .slice(0, 50); // 限制数量

      return { directory, files, total: files.length };
    } catch (error) {
      return { error: `列出目录失败: ${error.message}` };
    }
  }

  /**
   * 格式化搜索结果
   */
  formatSearchResult(result) {
    if (result && result.content) {
      // 解析 MCP 返回的内容
      const lines = result.content.split('\n').slice(0, 20);
      const matches = lines.map(line => {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          return {
            file: match[1],
            line: parseInt(match[2]),
            content: match[3].trim()
          };
        }
        return null;
      }).filter(Boolean);

      return { matches, total: matches.length };
    }
    return result;
  }
}

// 单例
let codeContextInstance = null;

export function getCodeContextService(projectRoot) {
  if (!codeContextInstance || codeContextInstance.projectRoot !== projectRoot) {
    codeContextInstance = new CodeContextService(projectRoot);
  }
  return codeContextInstance;
}

export default CodeContextService;
