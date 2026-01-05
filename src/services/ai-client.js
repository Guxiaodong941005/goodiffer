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
}

export default AIClient;
