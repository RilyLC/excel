#!/usr/bin/env node
/**
 * Usage:
 *  node scripts/create_user.js --username alice --password mySecretPass
 *  node scripts/create_user.js --username bob --password anotherPass --role admin
 *
 * This script creates a new user in the database.
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
  node scripts/create_user.js --username <username> --password <password> [--role <role>]

  Options:
    --username <string>   The username for the new user (required)
    --password <string>   The password for the new user (required)
    --role <string>       The role of the user (default: 'user')
                          Available roles: 'user', 'admin'
`);
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    usage();
    process.exit(0);
  }

  const { username, password, role = 'user' } = args;

  if (!username || !password) {
    console.error('Error: --username and --password are required.');
    usage();
    process.exit(1);
  }


  try {
    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      console.error(`Error: User '${username}' already exists.`);
      process.exit(1);
    }

    console.log(`Creating user '${username}' with role '${role}'...`);
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
    const info = stmt.run(username, hashedPassword, role);

    console.log(`Success! User '${username}' created with ID: ${info.lastInsertRowid}`);

  } catch (err) {
    console.error('Failed to create user:', err);
    process.exit(1);
  }
}

main();
