const { execSync } = require('child_process');

if (process.env.CI) {
  process.exit(0);
}

execSync('electron-builder install-app-deps', { stdio: 'inherit' });

