import chalk from 'chalk';
import logger from '../utils/logger.js';

export function generateReport(aiResponse, commitInfo) {
  console.log();
  console.log(chalk.cyan('╭──────────────────────────────────────────────────────────╮'));
  console.log(chalk.cyan('│  ') + chalk.bold.white('Goodiffer Analysis Report') + chalk.cyan('                               │'));
  console.log(chalk.cyan('╰──────────────────────────────────────────────────────────╯'));
  console.log();

  // 显示 commit 信息
  console.log(chalk.blue('📝 Commit:'), commitInfo.message);
  console.log();

  // 尝试解析 JSON 响应
  let result;
  try {
    // 提取 JSON 部分 (可能包含在 markdown 代码块中)
    let jsonStr = aiResponse;
    const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    result = JSON.parse(jsonStr);
  } catch {
    // 如果无法解析为 JSON，直接显示原始响应
    console.log(chalk.yellow('📊 分析结果:'));
    console.log();
    console.log(aiResponse);
    return;
  }

  // 显示摘要
  if (result.summary) {
    console.log(chalk.green('📊 Summary:'), result.summary);
    console.log();
  }

  // 显示 commit 匹配情况
  if (result.commitMatch !== undefined) {
    const matchIcon = result.commitMatch ? chalk.green('✓') : chalk.red('✗');
    console.log(chalk.blue('🎯 Commit 匹配:'), matchIcon, result.commitMatchReason || '');
    console.log();
  }

  logger.divider();

  // 按级别分组显示问题
  const issues = result.issues || [];
  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');
  const infos = issues.filter(i => i.level === 'info');

  // 显示错误
  if (errors.length > 0) {
    console.log();
    console.log(chalk.red.bold(`🔴 ERRORS (${errors.length})`));
    console.log();
    errors.forEach((issue, index) => {
      printIssue(issue, `E${String(index + 1).padStart(3, '0')}`, chalk.red);
    });
  }

  // 显示警告
  if (warnings.length > 0) {
    console.log();
    console.log(chalk.yellow.bold(`🟡 WARNINGS (${warnings.length})`));
    console.log();
    warnings.forEach((issue, index) => {
      printIssue(issue, `W${String(index + 1).padStart(3, '0')}`, chalk.yellow);
    });
  }

  // 显示信息
  if (infos.length > 0) {
    console.log();
    console.log(chalk.blue.bold(`🔵 INFO (${infos.length})`));
    console.log();
    infos.forEach((issue, index) => {
      printIssue(issue, `I${String(index + 1).padStart(3, '0')}`, chalk.blue);
    });
  }

  // 显示关联风险
  const risks = result.associationRisks || [];
  if (risks.length > 0) {
    logger.divider();
    console.log();
    console.log(chalk.magenta.bold(`🔗 ASSOCIATION RISKS (${risks.length})`));
    console.log();
    risks.forEach((risk, index) => {
      printRisk(risk, index + 1);
    });
  }

  // 统计摘要
  logger.divider();
  console.log();
  console.log(
    chalk.gray('📈 统计:'),
    chalk.red(`${errors.length} errors`),
    chalk.yellow(`${warnings.length} warnings`),
    chalk.blue(`${infos.length} info`),
    chalk.magenta(`${risks.length} risks`)
  );
  console.log();
}

function printIssue(issue, id, colorFn) {
  console.log(colorFn(`[${id}]`), chalk.gray(`${issue.file}:${issue.line || '?'}`));
  console.log(chalk.white('问题:'), issue.description);

  if (issue.code) {
    console.log(chalk.gray('代码:'));
    console.log(chalk.gray('  ') + issue.code.split('\n').join('\n  '));
  }

  if (issue.suggestion) {
    console.log(chalk.green('建议:'), issue.suggestion);
  }

  if (issue.fixPrompt) {
    console.log();
    console.log(chalk.cyan('📋 修复提示词 (复制到 cc/codex):'));
    console.log(chalk.gray('┌' + '─'.repeat(56) + '┐'));
    const lines = issue.fixPrompt.split('\n');
    lines.forEach(line => {
      console.log(chalk.gray('│ ') + line.padEnd(54) + chalk.gray(' │'));
    });
    console.log(chalk.gray('└' + '─'.repeat(56) + '┘'));
  }
  console.log();
}

function printRisk(risk, index) {
  console.log(chalk.magenta(`[R${String(index).padStart(3, '0')}]`));
  console.log(chalk.white('修改文件:'), risk.changedFile);
  console.log(chalk.white('可能影响:'), (risk.relatedFiles || []).join(', '));
  console.log(chalk.white('风险:'), risk.risk);

  if (risk.checkPrompt) {
    console.log();
    console.log(chalk.cyan('📋 检查提示词:'));
    console.log(chalk.gray('┌' + '─'.repeat(56) + '┐'));
    const lines = risk.checkPrompt.split('\n');
    lines.forEach(line => {
      console.log(chalk.gray('│ ') + line.padEnd(54) + chalk.gray(' │'));
    });
    console.log(chalk.gray('└' + '─'.repeat(56) + '┘'));
  }
  console.log();
}

export default generateReport;
