import chalk from 'chalk';
import { getDatabase } from '../services/database.js';
import logger from '../utils/logger.js';

export async function developerCommand(action, args) {
  const db = getDatabase();

  switch (action) {
    case 'list':
      listDevelopers(db);
      break;

    case 'alias':
      if (args.length < 2) {
        logger.error('用法: goodiffer developer alias <email_pattern> <target_email>');
        console.log();
        console.log('示例:');
        console.log('  goodiffer developer alias "john@old-email.com" "john@new-email.com"');
        console.log('  goodiffer developer alias "*@company.com" "team@company.com"');
        return;
      }
      setAlias(db, args[0], args[1]);
      break;

    case 'rename':
      if (args.length < 2) {
        logger.error('用法: goodiffer developer rename <email> <new_name>');
        console.log();
        console.log('示例:');
        console.log('  goodiffer developer rename "john@example.com" "John Doe"');
        return;
      }
      renameDeveloper(db, args[0], args[1]);
      break;

    case 'team':
      if (args.length < 2) {
        logger.error('用法: goodiffer developer team <email> <team_name>');
        console.log();
        console.log('示例:');
        console.log('  goodiffer developer team "john@example.com" "Frontend Team"');
        return;
      }
      setTeam(db, args[0], args[1]);
      break;

    default:
      logger.error(`未知操作: ${action}`);
      console.log();
      console.log('可用操作:');
      console.log('  list   - 列出所有开发者');
      console.log('  alias  - 设置邮箱别名映射');
      console.log('  rename - 修改显示名称');
      console.log('  team   - 设置团队');
  }
}

function listDevelopers(db) {
  const developers = db.listDevelopers();

  if (developers.length === 0) {
    logger.info('暂无开发者数据');
    console.log();
    console.log('提示: 运行 goodiffer 分析代码后会自动记录开发者信息');
    return;
  }

  logger.title('开发者列表');

  for (const dev of developers) {
    console.log(chalk.cyan(dev.display_name));
    console.log(chalk.gray(`  邮箱: ${dev.git_email}`));
    if (dev.team) {
      console.log(chalk.gray(`  团队: ${dev.team}`));
    }
    if (dev.display_name !== dev.git_name) {
      console.log(chalk.gray(`  Git 名: ${dev.git_name}`));
    }
    console.log();
  }

  console.log(chalk.gray(`共 ${developers.length} 位开发者`));
}

function setAlias(db, emailPattern, targetEmail) {
  try {
    db.setDeveloperAlias(emailPattern, targetEmail);
    logger.success(`已设置别名: ${emailPattern} → ${targetEmail}`);
  } catch (error) {
    logger.error(error.message);
  }
}

function renameDeveloper(db, email, newName) {
  const dev = db.getDeveloper(email);
  if (!dev) {
    logger.error(`开发者 "${email}" 不存在`);
    return;
  }

  db.updateDeveloper(email, { displayName: newName });
  logger.success(`已将 "${email}" 的显示名称修改为 "${newName}"`);
}

function setTeam(db, email, teamName) {
  const dev = db.getDeveloper(email);
  if (!dev) {
    logger.error(`开发者 "${email}" 不存在`);
    return;
  }

  db.updateDeveloper(email, { team: teamName });
  logger.success(`已将 "${dev.display_name}" 设置为团队 "${teamName}"`);
}

export default developerCommand;
