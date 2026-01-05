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

  // 显示 Overall Correctness
  if (result.overall_correctness) {
    const isCorrect = result.overall_correctness === 'patch is correct';
    const correctIcon = isCorrect ? chalk.green('✓ CORRECT') : chalk.red('✗ INCORRECT');
    console.log(chalk.bold('🏁 Overall:'), correctIcon);
    if (result.overall_explanation) {
      console.log(chalk.gray('   '), result.overall_explanation);
    }
    if (result.overall_confidence_score !== undefined) {
      const confidence = (result.overall_confidence_score * 100).toFixed(0);
      console.log(chalk.gray('    置信度:'), chalk.cyan(`${confidence}%`));
    }
    console.log();
  }

  logger.divider();

  // 按优先级分组显示 findings
  const findings = result.findings || [];

  // 兼容旧格式 issues
  const issues = result.issues || [];

  if (findings.length > 0) {
    // 新格式: 按优先级分组
    const p0 = findings.filter(f => f.priority === 0);
    const p1 = findings.filter(f => f.priority === 1);
    const p2 = findings.filter(f => f.priority === 2);
    const p3 = findings.filter(f => f.priority === 3);
    const noP = findings.filter(f => f.priority === undefined || f.priority === null);

    // 显示 P0
    if (p0.length > 0) {
      console.log();
      console.log(chalk.red.bold(`🔴 P0 - CRITICAL (${p0.length})`));
      console.log();
      p0.forEach((finding, index) => {
        printFinding(finding, `P0-${index + 1}`, chalk.red);
      });
    }

    // 显示 P1
    if (p1.length > 0) {
      console.log();
      console.log(chalk.yellow.bold(`🟠 P1 - URGENT (${p1.length})`));
      console.log();
      p1.forEach((finding, index) => {
        printFinding(finding, `P1-${index + 1}`, chalk.yellow);
      });
    }

    // 显示 P2
    if (p2.length > 0) {
      console.log();
      console.log(chalk.blue.bold(`🟡 P2 - NORMAL (${p2.length})`));
      console.log();
      p2.forEach((finding, index) => {
        printFinding(finding, `P2-${index + 1}`, chalk.blue);
      });
    }

    // 显示 P3
    if (p3.length > 0) {
      console.log();
      console.log(chalk.gray.bold(`🔵 P3 - LOW (${p3.length})`));
      console.log();
      p3.forEach((finding, index) => {
        printFinding(finding, `P3-${index + 1}`, chalk.gray);
      });
    }

    // 显示无优先级的
    if (noP.length > 0) {
      console.log();
      console.log(chalk.white.bold(`⚪ OTHER (${noP.length})`));
      console.log();
      noP.forEach((finding, index) => {
        printFinding(finding, `F${index + 1}`, chalk.white);
      });
    }
  } else if (issues.length > 0) {
    // 旧格式兼容: 按级别分组
    const errors = issues.filter(i => i.level === 'error');
    const warnings = issues.filter(i => i.level === 'warning');
    const infos = issues.filter(i => i.level === 'info');

    if (errors.length > 0) {
      console.log();
      console.log(chalk.red.bold(`🔴 ERRORS (${errors.length})`));
      console.log();
      errors.forEach((issue, index) => {
        printIssue(issue, `E${String(index + 1).padStart(3, '0')}`, chalk.red);
      });
    }

    if (warnings.length > 0) {
      console.log();
      console.log(chalk.yellow.bold(`🟡 WARNINGS (${warnings.length})`));
      console.log();
      warnings.forEach((issue, index) => {
        printIssue(issue, `W${String(index + 1).padStart(3, '0')}`, chalk.yellow);
      });
    }

    if (infos.length > 0) {
      console.log();
      console.log(chalk.blue.bold(`🔵 INFO (${infos.length})`));
      console.log();
      infos.forEach((issue, index) => {
        printIssue(issue, `I${String(index + 1).padStart(3, '0')}`, chalk.blue);
      });
    }
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

  if (findings.length > 0) {
    const p0Count = findings.filter(f => f.priority === 0).length;
    const p1Count = findings.filter(f => f.priority === 1).length;
    const p2Count = findings.filter(f => f.priority === 2).length;
    const p3Count = findings.filter(f => f.priority === 3).length;

    console.log(
      chalk.gray('📈 统计:'),
      chalk.red(`${p0Count} P0`),
      chalk.yellow(`${p1Count} P1`),
      chalk.blue(`${p2Count} P2`),
      chalk.gray(`${p3Count} P3`),
      chalk.magenta(`${risks.length} risks`)
    );
  } else {
    const errors = issues.filter(i => i.level === 'error');
    const warnings = issues.filter(i => i.level === 'warning');
    const infos = issues.filter(i => i.level === 'info');

    console.log(
      chalk.gray('📈 统计:'),
      chalk.red(`${errors.length} errors`),
      chalk.yellow(`${warnings.length} warnings`),
      chalk.blue(`${infos.length} info`),
      chalk.magenta(`${risks.length} risks`)
    );
  }
  console.log();
}

function printFinding(finding, id, colorFn) {
  // 显示标题
  console.log(colorFn(`[${id}]`), chalk.bold(finding.title));

  // 显示位置
  if (finding.code_location) {
    const loc = finding.code_location;
    const lineRange = loc.line_range ? `${loc.line_range.start}-${loc.line_range.end}` : '?';
    console.log(chalk.gray(`    📍 ${loc.absolute_file_path}:${lineRange}`));
  }

  // 显示置信度
  if (finding.confidence_score !== undefined) {
    const confidence = (finding.confidence_score * 100).toFixed(0);
    console.log(chalk.gray(`    🎯 置信度: ${confidence}%`));
  }

  // 显示问题描述
  console.log();
  console.log(chalk.white('    '), finding.body);

  if (finding.suggestion) {
    console.log();
    console.log(chalk.green('    💡 建议:'), finding.suggestion);
  }

  if (finding.fixPrompt) {
    console.log();
    console.log(chalk.cyan('    📋 修复提示词 (复制到 cc/codex):'));
    console.log(chalk.gray('    ┌' + '─'.repeat(52) + '┐'));
    const lines = finding.fixPrompt.split('\n');
    lines.forEach(line => {
      console.log(chalk.gray('    │ ') + line.padEnd(50) + chalk.gray(' │'));
    });
    console.log(chalk.gray('    └' + '─'.repeat(52) + '┘'));
  }
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
