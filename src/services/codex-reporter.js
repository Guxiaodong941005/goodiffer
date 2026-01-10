/**
 * Codex Review Reporter
 * 格式化并展示 Codex 深度代码审查结果
 */

import chalk from 'chalk';

/**
 * 生成 Codex review 报告
 * @param {object} result - Codex 审查结果
 * @param {object} commitInfo - Commit 信息
 */
export function generateCodexReport(result, commitInfo = {}) {
  console.log('\n');
  console.log(chalk.bold.cyan('╭' + '─'.repeat(58) + '╮'));
  console.log(chalk.bold.cyan('│') + chalk.bold('  Codex Deep Code Review Report').padEnd(57) + chalk.bold.cyan('│'));
  console.log(chalk.bold.cyan('╰' + '─'.repeat(58) + '╯'));
  console.log('');

  // Commit 信息
  if (commitInfo.sha) {
    console.log(chalk.bold('📝 Commit:'), commitInfo.sha.substring(0, 7));
  }
  if (commitInfo.message) {
    console.log(chalk.bold('📋 Message:'), commitInfo.message.split('\n')[0]);
  }
  console.log('');

  // 总结
  if (result.summary) {
    console.log(chalk.bold('📊 Summary:'), result.summary);
    console.log('');
  }

  // Commit 匹配度
  if (result.commitMatch !== undefined) {
    const icon = result.commitMatch ? '✓' : '✗';
    const color = result.commitMatch ? chalk.green : chalk.yellow;
    console.log(color(icon), chalk.bold('Commit 匹配:'), result.commitMatchReason || (result.commitMatch ? '符合' : '不符合'));
    console.log('');
  }

  // 调用关系分析
  if (result.call_graph_analysis && result.call_graph_analysis.length > 0) {
    console.log(chalk.bold.blue('═'.repeat(60)));
    console.log(chalk.bold.blue('\n🕸️  调用/引用关系梳理\n'));

    result.call_graph_analysis.forEach((item, index) => {
      const title = item.symbol || `Symbol ${index + 1}`;
      const kind = item.kind ? ` (${item.kind})` : '';
      console.log(chalk.bold(`${index + 1}. ${title}${kind}`));

      if (item.delta) {
        console.log(chalk.gray('   Δ 变化:'), item.delta);
      }

      if (item.before_calls) {
        const callers = (item.before_calls.callers || []).join('; ') || '-';
        const callees = (item.before_calls.callees || []).join('; ') || '-';
        console.log(chalk.gray('   改动前 调用方:'), callers);
        console.log(chalk.gray('   改动前 被调方:'), callees);
      }

      if (item.after_calls) {
        const callers = (item.after_calls.callers || []).join('; ') || '-';
        const callees = (item.after_calls.callees || []).join('; ') || '-';
        console.log(chalk.gray('   改动后 调用方:'), callers);
        console.log(chalk.gray('   改动后 被调方:'), callees);
      }

      if (item.notes) {
        console.log(chalk.gray('   备注:'), item.notes);
      }

      console.log('');
    });
  }

  // 前后逻辑对比
  if (result.logic_changes && result.logic_changes.length > 0) {
    console.log(chalk.bold.blue('═'.repeat(60)));
    console.log(chalk.bold.blue('\n📚  改动前后逻辑对比\n'));

    result.logic_changes.forEach((item, index) => {
      const scope = item.scope || `Scope ${index + 1}`;
      console.log(chalk.bold(`${index + 1}. ${scope}`));
      if (item.before) console.log(chalk.gray('   改动前:'), item.before);
      if (item.after) console.log(chalk.gray('   改动后:'), item.after);
      if (item.change) console.log(chalk.gray('   差异:'), item.change);
      if (item.risk) console.log(chalk.gray('   风险:'), item.risk);

      if (item.recommended_tests && item.recommended_tests.length > 0) {
        console.log(chalk.gray('   建议测试:'), item.recommended_tests.join('; '));
      }

      console.log('');
    });
  }

  // 8 维度评估
  if (result.dimensions && result.dimensions.length > 0) {
    console.log(chalk.bold.magenta('═'.repeat(60)));
    console.log(chalk.bold.magenta('\n🎯 8-Dimensional Quality Assessment\n'));

    result.dimensions.forEach((dim, index) => {
      const ratingIcon = getRatingIcon(dim.rating);
      const ratingColor = getRatingColor(dim.rating);
      const scoreColor = getScoreColor(dim.score);

      console.log(chalk.bold(`${index + 1}. ${dim.name}`));
      console.log(`   ${ratingColor(ratingIcon)} Rating: ${ratingColor(dim.rating.toUpperCase())} | Score: ${scoreColor(dim.score + '/100')}`);
      console.log(`   ${chalk.gray(dim.summary)}`);

      if (dim.issues && dim.issues.length > 0) {
        dim.issues.forEach(issue => {
          console.log(`   ${chalk.yellow('▸')} ${issue}`);
        });
      }
      console.log('');
    });
  }

  // 整体评估
  if (result.overall_assessment) {
    const assessment = result.overall_assessment;
    const isCorrect = assessment.correctness === 'patch is correct';
    const icon = isCorrect ? '✅' : '❌';
    const color = isCorrect ? chalk.green : chalk.red;

    console.log(chalk.bold.magenta('═'.repeat(60)));
    console.log(chalk.bold.magenta('\n⚖️  Overall Assessment\n'));
    console.log(color(icon), chalk.bold('Correctness:'), color(assessment.correctness.toUpperCase()));
    console.log(chalk.bold('📈 Confidence:'), formatConfidence(assessment.confidence_score));
    console.log(chalk.bold('💡 Explanation:'), assessment.explanation);
    console.log('');
  }

  // 详细问题列表
  if (result.findings && result.findings.length > 0) {
    console.log(chalk.bold.red('═'.repeat(60)));
    console.log(chalk.bold.red(`\n🔍 Findings (${result.findings.length})\n`));

    // 按优先级分组
    const byPriority = {
      0: [],
      1: [],
      2: [],
      3: []
    };

    result.findings.forEach(finding => {
      const priority = finding.priority || 3;
      byPriority[priority].push(finding);
    });

    // 显示各优先级的问题
    [0, 1, 2, 3].forEach(priority => {
      const findings = byPriority[priority];
      if (findings.length === 0) return;

      const label = getPriorityLabel(priority);
      const color = getPriorityColor(priority);

      console.log(color.bold(`\n${label} (${findings.length})\n`));

      findings.forEach((finding, index) => {
        console.log(color(`[${String.fromCharCode(65 + index)}]`), finding.title);
        console.log('');
        console.log(chalk.gray('   Location:'), `${finding.code_location.absolute_file_path}:${finding.code_location.line_range.start}-${finding.code_location.line_range.end}`);
        console.log(chalk.gray('   Confidence:'), formatConfidence(finding.confidence_score));
        if (finding.dimension) {
          console.log(chalk.gray('   Dimension:'), finding.dimension);
        }
        console.log('');
        console.log('   ' + finding.body.split('\n').join('\n   '));
        console.log('');

        if (finding.suggestion) {
          console.log(chalk.cyan('   💡 Suggestion:'), finding.suggestion);
          console.log('');
        }

        if (finding.fixPrompt) {
          console.log(chalk.green('   📋 修复提示词 (复制到 Claude Code/Codex):'));
          console.log(chalk.green('   ┌' + '─'.repeat(54) + '┐'));
          finding.fixPrompt.split('\n').forEach(line => {
            console.log(chalk.green('   │ ') + line.padEnd(54) + chalk.green('│'));
          });
          console.log(chalk.green('   └' + '─'.repeat(54) + '┘'));
          console.log('');
        }
      });
    });
  } else {
    console.log(chalk.green('\n✨ 未发现问题！代码质量良好。\n'));
  }

  // 关联风险
  if (result.associationRisks && result.associationRisks.length > 0) {
    console.log(chalk.bold.yellow('═'.repeat(60)));
    console.log(chalk.bold.yellow(`\n⚠️  Association Risks (${result.associationRisks.length})\n`));

    result.associationRisks.forEach((risk, index) => {
      console.log(chalk.yellow(`[R${index + 1}]`), chalk.bold(risk.changedFile));
      console.log(chalk.gray('   可能影响:'), risk.relatedFiles.join(', '));
      console.log('   ' + risk.risk);
      console.log('');
      if (risk.checkPrompt) {
        console.log(chalk.cyan('   ✓ 验证提示:'), risk.checkPrompt);
        console.log('');
      }
    });
  }

  // 统计信息
  const stats = calculateStats(result);
  console.log(chalk.bold.gray('═'.repeat(60)));
  console.log('');
  console.log(chalk.bold('📈 Statistics:'), formatStats(stats));
  console.log('');
}

/**
 * 获取评级图标
 */
function getRatingIcon(rating) {
  const icons = {
    'extraordinary': '🌟',
    'acceptable': '✓',
    'poor': '⚠️'
  };
  return icons[rating] || '?';
}

/**
 * 获取评级颜色
 */
function getRatingColor(rating) {
  const colors = {
    'extraordinary': chalk.green.bold,
    'acceptable': chalk.blue,
    'poor': chalk.red
  };
  return colors[rating] || chalk.gray;
}

/**
 * 获取分数颜色
 */
function getScoreColor(score) {
  if (score >= 90) return chalk.green.bold;
  if (score >= 70) return chalk.blue;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

/**
 * 获取优先级标签
 */
function getPriorityLabel(priority) {
  const labels = {
    0: '🔴 P0 - CRITICAL',
    1: '🟠 P1 - URGENT',
    2: '🟡 P2 - NORMAL',
    3: '🔵 P3 - LOW'
  };
  return labels[priority] || 'UNKNOWN';
}

/**
 * 获取优先级颜色
 */
function getPriorityColor(priority) {
  const colors = {
    0: chalk.red.bold,
    1: chalk.yellow.bold,
    2: chalk.blue,
    3: chalk.cyan
  };
  return colors[priority] || chalk.gray;
}

/**
 * 格式化置信度
 */
function formatConfidence(score) {
  const percentage = (score * 100).toFixed(0);
  let color = chalk.gray;
  let label = 'Low';

  if (score >= 0.9) {
    color = chalk.green.bold;
    label = 'Very High';
  } else if (score >= 0.7) {
    color = chalk.green;
    label = 'High';
  } else if (score >= 0.5) {
    color = chalk.yellow;
    label = 'Medium';
  } else {
    color = chalk.red;
    label = 'Low';
  }

  return color(`${percentage}% (${label})`);
}

/**
 * 计算统计信息
 */
function calculateStats(result) {
  const stats = {
    p0: 0,
    p1: 0,
    p2: 0,
    p3: 0,
    risks: 0,
    avgScore: 0,
    avgConfidence: 0
  };

  if (result.findings) {
    result.findings.forEach(f => {
      const priority = f.priority || 3;
      stats[`p${priority}`]++;
    });
  }

  if (result.associationRisks) {
    stats.risks = result.associationRisks.length;
  }

  if (result.dimensions && result.dimensions.length > 0) {
    const totalScore = result.dimensions.reduce((sum, d) => sum + (d.score || 0), 0);
    stats.avgScore = (totalScore / result.dimensions.length).toFixed(1);
  }

  if (result.overall_assessment && result.overall_assessment.confidence_score) {
    stats.avgConfidence = (result.overall_assessment.confidence_score * 100).toFixed(0);
  }

  return stats;
}

/**
 * 格式化统计信息
 */
function formatStats(stats) {
  const parts = [];

  if (stats.p0 > 0) parts.push(chalk.red.bold(`${stats.p0} P0`));
  if (stats.p1 > 0) parts.push(chalk.yellow.bold(`${stats.p1} P1`));
  if (stats.p2 > 0) parts.push(chalk.blue(`${stats.p2} P2`));
  if (stats.p3 > 0) parts.push(chalk.cyan(`${stats.p3} P3`));
  if (stats.risks > 0) parts.push(chalk.magenta(`${stats.risks} risks`));

  if (stats.avgScore > 0) {
    const scoreColor = getScoreColor(parseFloat(stats.avgScore));
    parts.push(`Avg Score: ${scoreColor(stats.avgScore)}`);
  }

  if (stats.avgConfidence > 0) {
    parts.push(`Confidence: ${stats.avgConfidence}%`);
  }

  return parts.join(' | ');
}

export default generateCodexReport;
