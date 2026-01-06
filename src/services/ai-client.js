import OpenAI from 'openai';

export class AIClient {
  constructor(config) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.apiHost = config.apiHost;
    this.model = config.model;

    // 根据模型名称判断使用哪种 API 格式
    this.useAnthropicFormat = this.model && this.model.toLowerCase().startsWith('claude');

    if (!this.useAnthropicFormat) {
      // OpenAI 兼容格式 API
      const baseUrl = this.buildOpenAIBaseUrl();
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: baseUrl
      });
    }
  }

  buildOpenAIBaseUrl() {
    if (!this.apiHost) {
      return 'https://api.openai.com/v1';
    }

    let host = this.apiHost.replace(/\/+$/, '');

    if (!host.endsWith('/v1')) {
      host = `${host}/v1`;
    }

    return host;
  }

  async analyzeStream(prompt, onChunk) {
    if (this.useAnthropicFormat) {
      return this.analyzeWithClaudeFetch(prompt, onChunk);
    } else {
      return this.analyzeWithOpenAI(prompt, onChunk);
    }
  }

  /**
   * 带 Tool Use 的分析方法
   * @param {string} prompt - 提示词
   * @param {Array} tools - 工具定义
   * @param {Function} toolExecutor - 工具执行器 (toolName, toolInput) => result
   * @param {Function} onProgress - 进度回调
   * @param {number} maxIterations - 最大迭代次数
   */
  async analyzeWithTools(prompt, tools, toolExecutor, onProgress, maxIterations = 5) {
    if (!this.useAnthropicFormat) {
      // OpenAI 暂不支持 tool use，回退到普通分析
      return this.analyzeStream(prompt, onProgress);
    }

    const baseUrl = (this.apiHost || 'https://api.anthropic.com').replace(/\/+$/, '');
    const url = `${baseUrl}/v1/messages`;

    let messages = [{ role: 'user', content: prompt }];
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      if (onProgress) {
        onProgress({ type: 'iteration', iteration: iterations });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model || 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          tools: tools,
          messages: messages
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      const data = await response.json();

      // 检查停止原因
      const stopReason = data.stop_reason;

      // 检查是否需要调用工具
      const toolUseBlocks = data.content.filter(block => block.type === 'tool_use');

      // 如果停止原因是 end_turn 或没有工具调用，返回文本结果
      if (stopReason === 'end_turn' || toolUseBlocks.length === 0) {
        const textContent = data.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('');

        return textContent;
      }

      // 处理工具调用
      if (onProgress) {
        onProgress({
          type: 'tool_calls',
          tools: toolUseBlocks.map(t => ({ name: t.name, input: t.input }))
        });
      }

      // 添加助手消息
      messages.push({ role: 'assistant', content: data.content });

      // 执行工具并收集结果
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        try {
          const result = await toolExecutor(toolBlock.name, toolBlock.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          });

          if (onProgress) {
            onProgress({
              type: 'tool_result',
              tool: toolBlock.name,
              success: true
            });
          }
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: error.message }),
            is_error: true
          });

          if (onProgress) {
            onProgress({
              type: 'tool_result',
              tool: toolBlock.name,
              success: false,
              error: error.message
            });
          }
        }
      }

      // 添加工具结果消息
      messages.push({ role: 'user', content: toolResults });
    }

    throw new Error(`超过最大迭代次数 (${maxIterations})`);
  }

  // 使用原生 fetch 调用 Claude API (绕过 SDK 的 Cloudflare 问题)
  async analyzeWithClaudeFetch(prompt, onChunk) {
    const baseUrl = (this.apiHost || 'https://api.anthropic.com').replace(/\/+$/, '');
    const url = `${baseUrl}/v1/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model || 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        stream: true,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText}`);
    }

    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              const text = parsed.delta.text;
              fullContent += text;
              if (onChunk) {
                onChunk(text);
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    return fullContent;
  }

  async analyzeWithOpenAI(prompt, onChunk) {
    let fullContent = '';

    const stream = await this.client.chat.completions.create({
      model: this.model || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: true
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        fullContent += text;
        if (onChunk) {
          onChunk(text);
        }
      }
    }

    return fullContent;
  }

  // 非流式分析 (备用)
  async analyze(prompt) {
    if (this.useAnthropicFormat) {
      const baseUrl = (this.apiHost || 'https://api.anthropic.com').replace(/\/+$/, '');
      const url = `${baseUrl}/v1/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model || 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.content[0].text;
    } else {
      const response = await this.client.chat.completions.create({
        model: this.model || 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });
      return response.choices[0].message.content;
    }
  }

  /**
   * Codex 深度代码审查 (支持高推理模式和结构化输出)
   * @param {string} prompt - 提示词
   * @param {object} options - 配置选项
   * @param {object} options.schema - JSON Schema (可选)
   * @param {string} options.reasoningEffort - 推理强度: 'low'|'medium'|'high' (默认 'high')
   * @param {Function} options.onProgress - 进度回调 (可选)
   * @returns {Promise<object>} 结构化的审查结果
   */
  async analyzeWithCodex(prompt, options = {}) {
    const {
      schema = null,
      reasoningEffort = 'high',
      onProgress = null
    } = options;

    // Claude 模型也支持 Codex review，只是没有 reasoning 加成
    if (this.useAnthropicFormat) {
      return this.analyzeWithCodexClaude(prompt, options);
    }

    // 检测是否为 GPT-5.x-Codex 模型 (支持 reasoning 参数)
    const isCodexModel = this.model && (
      this.model.includes('gpt-5') ||
      this.model.includes('codex') ||
      this.model.includes('o3') ||
      this.model.includes('o1')
    );

    // 所有 OpenAI 兼容模型都使用 Chat Completions API
    return this.analyzeWithCodexChatCompletions(prompt, {
      ...options,
      isCodexModel
    });
  }

  /**
   * OpenAI Chat Completions API
   * 支持普通 GPT 模型和 Codex 模型（通过 reasoning 参数）
   * 使用原生 fetch 避免 SDK 兼容性问题
   */
  async analyzeWithCodexChatCompletions(prompt, options = {}) {
    const {
      schema = null,
      reasoningEffort = 'high',
      isCodexModel = false,
      onProgress = null
    } = options;

    const baseUrl = this.buildOpenAIBaseUrl();
    const url = `${baseUrl}/chat/completions`;

    // 构建请求参数
    const requestBody = {
      model: this.model || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 16000
    };

    // Codex 模型支持 reasoning 参数
    if (isCodexModel && reasoningEffort && reasoningEffort !== 'none') {
      if (onProgress) onProgress({
        type: 'info',
        message: `Codex 高推理模式: ${reasoningEffort}`
      });
      requestBody.reasoning = { effort: reasoningEffort };
    }

    // 注意: PackyAPI 等第三方代理可能不支持 response_format
    // 通过 prompt 来控制 JSON 输出，不使用 response_format 参数

    try {
      if (onProgress) onProgress({
        type: 'analyzing',
        message: isCodexModel ? 'Codex 深度分析中...' : 'GPT 深度分析中...'
      });

      // 使用原生 fetch 替代 SDK，避免兼容性问题
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      if (onProgress) onProgress({ type: 'complete', message: '分析完成' });

      try {
        return JSON.parse(content);
      } catch (parseError) {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1].trim());
        }
        throw new Error(`无法解析 AI 响应为 JSON: ${parseError.message}`);
      }
    } catch (error) {
      if (onProgress) onProgress({ type: 'error', message: error.message });
      throw error;
    }
  }

  /**
   * Claude 版本的 Codex 深度审查
   * Claude 不支持 reasoning 参数，但仍可使用 8 维度评估
   */
  async analyzeWithCodexClaude(prompt, options = {}) {
    const { onProgress = null } = options;

    if (onProgress) onProgress({
      type: 'info',
      message: 'Claude 模式: 8 维度深度审查 (无 reasoning 加成)'
    });

    const baseUrl = (this.apiHost || 'https://api.anthropic.com').replace(/\/+$/, '');
    const url = `${baseUrl}/v1/messages`;

    try {
      if (onProgress) onProgress({ type: 'analyzing', message: 'Claude 深度分析中...' });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model || 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.content[0].text;

      if (onProgress) onProgress({ type: 'complete', message: '分析完成' });

      // 解析 JSON 响应
      try {
        return JSON.parse(content);
      } catch (parseError) {
        // 如果解析失败，尝试提取 JSON
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1].trim());
        }
        throw new Error(`无法解析 Claude 响应为 JSON: ${parseError.message}`);
      }
    } catch (error) {
      if (onProgress) onProgress({ type: 'error', message: error.message });
      throw error;
    }
  }

  /**
   * Codex 深度审查 (流式版本)
   * 用于大型代码审查任务，提供实时反馈
   */
  async analyzeWithCodexStream(prompt, options = {}) {
    const {
      reasoningEffort = 'high',
      onChunk = null,
      onProgress = null
    } = options;

    if (this.useAnthropicFormat) {
      return this.analyzeWithClaudeFetch(prompt, onChunk);
    }

    const isCodexModel = this.model && (
      this.model.includes('gpt-5') ||
      this.model.includes('codex') ||
      this.model.includes('o3') ||
      this.model.includes('o1')
    );

    const requestParams = {
      model: this.model || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 16000,
      stream: true
    };

    if (isCodexModel && reasoningEffort) {
      if (onProgress) onProgress({
        type: 'info',
        message: `启用高推理模式: ${reasoningEffort}`
      });
      requestParams.reasoning = { effort: reasoningEffort };
    }

    let fullContent = '';

    try {
      const stream = await this.client.chat.completions.create(requestParams);

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          fullContent += text;
          if (onChunk) {
            onChunk(text);
          }
        }
      }

      return fullContent;
    } catch (error) {
      if (onProgress) onProgress({ type: 'error', message: error.message });
      throw error;
    }
  }
}

export default AIClient;
