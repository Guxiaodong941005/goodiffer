import Conf from 'conf';

const config = new Conf({
  projectName: 'goodiffer-nodejs',
  schema: {
    provider: {
      type: 'string',
      enum: ['claude', 'openai', 'custom'],
      default: 'claude'
    },
    apiHost: {
      type: 'string',
      default: ''
    },
    apiKey: {
      type: 'string',
      default: ''
    },
    model: {
      type: 'string',
      default: ''
    }
  }
});

export function getConfig() {
  return {
    provider: config.get('provider'),
    apiHost: config.get('apiHost'),
    apiKey: config.get('apiKey'),
    model: config.get('model')
  };
}

export function setConfig(key, value) {
  config.set(key, value);
}

export function clearConfig() {
  config.clear();
}

export function isConfigured() {
  const cfg = getConfig();
  return cfg.apiKey && cfg.apiHost && cfg.model;
}

export default config;
