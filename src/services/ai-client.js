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
