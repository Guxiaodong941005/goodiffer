import chalk from 'chalk';

const logger = {
  info(message) {
    console.log(chalk.blue('ℹ'), message);
  },

  success(message) {
    console.log(chalk.green('✔'), message);
  },

  warning(message) {
    console.log(chalk.yellow('⚠'), message);
  },

  error(message) {
    console.log(chalk.red('✖'), message);
  },

  title(message) {
    console.log();
    console.log(chalk.bold.cyan(`━━━ ${message} ━━━`));
    console.log();
  },

  box(title, content) {
    const lines = content.split('\n');
    const maxLen = Math.max(title.length, ...lines.map(l => l.length));
    const border = '─'.repeat(maxLen + 2);

    console.log(chalk.gray(`┌${border}┐`));
    console.log(chalk.gray('│'), chalk.bold(title.padEnd(maxLen)), chalk.gray('│'));
    console.log(chalk.gray(`├${border}┤`));
    lines.forEach(line => {
      console.log(chalk.gray('│'), line.padEnd(maxLen), chalk.gray('│'));
    });
    console.log(chalk.gray(`└${border}┘`));
  },

  divider() {
    console.log(chalk.gray('━'.repeat(50)));
  }
};

export default logger;
