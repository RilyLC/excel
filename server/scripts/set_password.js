#!/usr/bin/env node
/**
 * Usage:
 *  node scripts/set_password.js --username alice --password myNewPass
 *  node scripts/set_password.js --id 3 --password myNewPass
 *  node scripts/set_password.js --username alice            (will prompt for password)
 *
 * This script updates the user's password in the DB using bcryptjs.
 */

const db = require('../db');
const bcrypt = require('bcryptjs');

function parseArgs() {
  const raw = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === '--help' || a === '-h') {
      args.help = true; break;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = raw[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next; i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/set_password.js --username <username> [--password <password>]
  node scripts/set_password.js --id <userId> [--password <password>]

If --password is omitted, you'll be prompted to enter the new password (hidden input).
`);
}

function promptHidden(promptText) {
  return new Promise((resolve) => {
    const readline = require('readline');
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(promptText);

    stdin.resume();
    stdin.setRawMode(true);

    let password = '';

    stdin.on('data', function charHandler(ch) {
      ch = String(ch);
      switch (ch) {
        case '\r':
        case '\n':
        case '\u0004': // EOT
          stdin.setRawMode(false);
          stdout.write('\n');
          stdin.pause();
          stdin.removeListener('data', charHandler);
          resolve(password);
          break;
        case '\u0003': // Ctrl-C
          process.exit();
          break;
        case '\u0008': // backspace
        case '\u007f': // delete (on some terminals)
          if (password.length > 0) {
            password = password.slice(0, -1);
            // Move cursor back, overwrite with space, move back again
            stdout.write('\b \b');
          }
          break;
        default:
          // Masking
          stdout.write('*');
          password += ch;
          break;
      }
    });
  });
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    process.exit(0);
  }

  const identifier = args.username || args.id;
  if (!identifier) {
    console.error('Error: --username or --id is required.');
    usage();
    process.exit(1);
  }

  let password = args.password;
  if (!password) {
    password = await promptHidden('New password: ');
    if (!password) {
      console.error('Error: empty password');
      process.exit(1);
    }
  }

  // Find user
  let user;
  if (args.username) {
    user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(args.username);
  } else {
    // id provided
    const idNum = Number(args.id);
    if (Number.isNaN(idNum)) {
      console.error('Error: --id must be a number');
      process.exit(1);
    }
    user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(idNum);
  }

  if (!user) {
    console.error('Error: user not found');
    process.exit(2);
  }

  const hashed = bcrypt.hashSync(password, 10);
  const info = db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);

  if (info.changes === 1) {
    console.log(`Password updated for user '${user.username}' (id=${user.id}).`);
    process.exit(0);
  } else {
    console.error('Error: failed to update password');
    process.exit(3);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(99);
});