import { getConfig, setConfig, clearConfig } from '../utils/config-store.js';
import logger from '../utils/logger.js';

export function configCommand(action, key, value) {
  switch (action) {
    case 'list':
      listConfig();
      break;
    case 'get':
      getConfigValue(key);
      break;
    case 'set':
      setConfigValue(key, value);
      break;
    case 'clear':
      clearAllConfig();
      break;
    default:
      logger.error(`未知操作: ${action}`);
      logger.info('可用操作: list, get, set, clear');
  }
}

function listConfig() {
  const config = getConfig();
  logger.title('当前配置');

  console.log(`  apiHost:  ${config.apiHost || '(未设置)'}`);
  console.log(`  provider: ${config.provider || '(未设置)'}`);
  console.log(`  model:    ${config.model || '(未设置)'}`);
  console.log(`  apiKey:   ${config.apiKey ? '*'.repeat(8) + '...' + config.apiKey.slice(-4) : '(未设置)'}`);

  // 显示实际 API 端点
  if (config.apiHost) {
    console.log('');
    // 根据模型名称判断端点
    if (config.model && config.model.toLowerCase().startsWith('claude')) {
      console.log(`  端点:     ${config.apiHost}/v1/messages`);
    } else {
      console.log(`  端点:     ${config.apiHost}/v1/chat/completions`);
    }
  }
}

function getConfigValue(key) {
  if (!key) {
    logger.error('请指定配置项名称');
    return;
  }
  const config = getConfig();
  if (key === 'apiKey' && config[key]) {
    console.log('*'.repeat(8) + '...' + config[key].slice(-4));
  } else {
    console.log(config[key] || '(未设置)');
  }
}

function setConfigValue(key, value) {
  if (!key || value === undefined) {
    logger.error('用法: goodiffer config set <key> <value>');
    return;
  }

  const validKeys = ['provider', 'apiHost', 'apiKey', 'model'];
  if (!validKeys.includes(key)) {
    logger.error(`无效的配置项: ${key}`);
    logger.info(`可用配置项: ${validKeys.join(', ')}`);
    return;
  }

  if (key === 'provider' && !['claude', 'openai', 'custom'].includes(value)) {
    logger.error('provider 必须是 claude、openai 或 custom');
    return;
  }

  setConfig(key, value);
  logger.success(`已设置 ${key}`);
}

function clearAllConfig() {
  clearConfig();
  logger.success('配置已清除');
}

export default configCommand;
