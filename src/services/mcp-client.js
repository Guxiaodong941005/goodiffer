import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import path from 'path';
import logger from '../utils/logger.js';

/**
 * MCP Client 服务
 * 用于连接 LSP MCP Server 获取代码上下文
 */
export class MCPClientService {
  constructor() {
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.availableTools = [];
  }

  /**
   * 检测是否在 Claude Code 环境中
   */
  static isInClaudeCode() {
    return !!(
      process.env.CLAUDE_CODE ||
      process.env.CLAUDE_CODE_VERSION ||
      process.env.MCP_SERVER_URL
    );
  }

  /**
   * 连接到 MCP Server
   * @param {Object} options - 连接选项
   * @param {string} options.command - 启动 MCP server 的命令
   * @param {string[]} options.args - 命令参数
   * @param {string} options.cwd - 工作目录
   */
  async connect(options = {}) {
    // 如果不在 Claude Code 环境中，跳过 MCP 连接
    if (!MCPClientService.isInClaudeCode()) {
      this.connected = false;
      return false;
    }

    const {
      command,
      args,
      cwd = process.cwd()
    } = options;

    // 如果没有提供 command，无法连接
    if (!command) {
      this.connected = false;
      return false;
    }

    try {
      this.client = new Client({
        name: 'goodiffer',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {}
        }
      });

      // 创建 stdio transport
      this.transport = new StdioClientTransport({
        command,
        args: args || [],
        cwd,
        env: {
          ...process.env,
          // 确保 MCP server 在正确的目录运行
          PWD: cwd
        }
      });

      await this.client.connect(this.transport);
      this.connected = true;

      // 获取可用工具列表
      const toolsResult = await this.client.listTools();
      this.availableTools = toolsResult.tools || [];

      logger.success(`MCP 已连接，可用工具: ${this.availableTools.map(t => t.name).join(', ')}`);

      return true;
    } catch (error) {
      logger.warning(`MCP 连接失败: ${error.message}`);
      this.connected = false;
      return false;
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.client && this.connected) {
      try {
        await this.client.close();
      } catch {
        // 忽略关闭错误
      }
      this.connected = false;
    }
  }

  /**
   * 调用 MCP 工具
   * @param {string} toolName - 工具名称
   * @param {Object} args - 工具参数
   */
  async callTool(toolName, args) {
    if (!this.connected) {
      throw new Error('MCP 未连接');
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      return result;
    } catch (error) {
      throw new Error(`MCP 工具调用失败 [${toolName}]: ${error.message}`);
    }
  }

  /**
   * 获取函数/符号定义
   * @param {string} filePath - 文件路径
   * @param {number} line - 行号
   * @param {number} character - 列号
   */
  async goToDefinition(filePath, line, character) {
    return this.callTool('goToDefinition', {
      filePath,
      line,
      character
    });
  }

  /**
   * 查找符号引用
   * @param {string} filePath - 文件路径
   * @param {number} line - 行号
   * @param {number} character - 列号
   */
  async findReferences(filePath, line, character) {
    return this.callTool('findReferences', {
      filePath,
      line,
      character
    });
  }

  /**
   * 读取文件内容
   * @param {string} filePath - 文件路径
   */
  async readFile(filePath) {
    return this.callTool('Read', {
      file_path: path.resolve(filePath)
    });
  }

  /**
   * 搜索代码
   * @param {string} pattern - 搜索模式
   * @param {string} searchPath - 搜索路径
   */
  async searchCode(pattern, searchPath = '.') {
    return this.callTool('Grep', {
      pattern,
      path: searchPath
    });
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools() {
    return this.availableTools;
  }

  /**
   * 检查工具是否可用
   * @param {string} toolName - 工具名称
   */
  hasToolAvailable(toolName) {
    return this.availableTools.some(t => t.name === toolName);
  }
}

// 单例实例
let mcpInstance = null;

/**
 * 获取 MCP Client 实例
 */
export function getMCPClient() {
  if (!mcpInstance) {
    mcpInstance = new MCPClientService();
  }
  return mcpInstance;
}

export default MCPClientService;
