import inquirer from 'inquirer';
import { setConfig, getConfig } from '../utils/config-store.js';
import logger from '../utils/logger.js';

const API_HOSTS = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  packyapi: 'https://www.packyapi.com'
};

const MODELS = {
  anthropic: ['claude-sonnet-4-5-20250929', 'claude-3-opus-20240229', 'claude-3-5-sonnet-20241022'],
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  packyapi: ['claude-sonnet-4-5-20250929', 'gpt-4o']
};

export async function initCommand() {
  logger.title('Goodiffer 配置向导');

  const currentConfig = getConfig();

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'hostChoice',
      message: '选择 API Host:',
      choices: [
        { name: 'Anthropic (官方 Claude API)', value: 'anthropic' },
        { name: 'OpenAI (官方 GPT API)', value: 'openai' },
        { name: 'PackyAPI (第三方代理)', value: 'packyapi' },
        { name: '自定义 URL', value: 'custom' }
      ],
      default: currentConfig.apiHost ? 'custom' : 'anthropic'
    },
    {
      type: 'input',
      name: 'customHost',
      message: '输入自定义 API Host URL:',
      when: (ans) => ans.hostChoice === 'custom',
      default: currentConfig.apiHost || '',
      validate: (input) => {
        if (!input) return '请输入 API Host URL';
        try {
          new URL(input);
          return true;
        } catch {
          return '请输入有效的 URL';
        }
      }
    },
    {
      type: 'password',
      name: 'apiKey',
      message: '输入 API Key:',
      mask: '*',
      default: currentConfig.apiKey || '',
      validate: (input) => input ? true : '请输入 API Key'
    },
    {
      type: 'list',
      name: 'modelChoice',
      message: '选择模型:',
      choices: (ans) => {
        const host = ans.hostChoice;
        if (host === 'custom') {
          return [
            { name: 'claude-sonnet-4-5-20250929', value: 'claude-sonnet-4-5-20250929' },
            { name: 'gpt-4o', value: 'gpt-4o' },
            { name: '自定义模型', value: 'custom' }
          ];
        }
        const models = MODELS[host] || MODELS.anthropic;
        return [
          ...models.map(m => ({ name: m, value: m })),
          { name: '自定义模型', value: 'custom' }
        ];
      }
    },
    {
      type: 'input',
      name: 'customModel',
      message: '输入自定义模型名称:',
      when: (ans) => ans.modelChoice === 'custom',
      validate: (input) => input ? true : '请输入模型名称'
    }
  ]);

  // 确定 API Host
  let apiHost;
  if (answers.hostChoice === 'custom') {
    apiHost = answers.customHost;
  } else {
    apiHost = API_HOSTS[answers.hostChoice];
  }

  // 确定 provider
  let provider;
  if (answers.hostChoice === 'anthropic' || answers.hostChoice === 'packyapi') {
    provider = 'claude';
  } else if (answers.hostChoice === 'openai') {
    provider = 'openai';
  } else {
    // 自定义时根据模型名判断
    const model = answers.customModel || answers.modelChoice;
    provider = model.toLowerCase().startsWith('claude') ? 'claude' : 'openai';
  }

  // 确定模型
  const model = answers.customModel || answers.modelChoice;

  // 保存配置
  setConfig('apiHost', apiHost);
  setConfig('apiKey', answers.apiKey);
  setConfig('model', model);
  setConfig('provider', provider);

  console.log();
  logger.success('配置已保存!');
  console.log();
  console.log(`  API Host: ${apiHost}`);
  console.log(`  Model:    ${model}`);
  console.log(`  Provider: ${provider}`);
  console.log();
  logger.info('运行 goodiffer 开始分析代码');
}

export default initCommand;
