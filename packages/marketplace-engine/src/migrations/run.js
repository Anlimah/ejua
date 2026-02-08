#!/usr/bin/env node

/**
 * Simple migration runner using raw SQL files.
 * Usage:
 *   node run.js up    — run all pending migrations
 *   node run.js down  — rollback last migration
 */

const fs = require('fs');
const path = require('path');
const { getDb, testConnection, closeDb } = require('../utils/db');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function ensureMigrationTable(db) {
  await db.raw(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getExecuted(db) {
  const rows = await db('_migrations').select('name').orderBy('id');
  return rows.map((r) => r.name);
}

async function runUp(db) {
  await ensureMigrationTable(db);
  const executed = await getExecuted(db);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.includes('_down'))
    .sort();

  const pending = files.filter((f) => !executed.includes(f));

  if (pending.length === 0) {
    console.log('No pending migrations.');
    return;
  }

  for (const file of pending) {
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    await db.raw(sql);
    await db('_migrations').insert({ name: file });
    console.log(`  ✓ ${file} applied`);
  }

  console.log(`\nAll ${pending.length} migration(s) applied.`);
}

async function runDown(db) {
  await ensureMigrationTable(db);
  const executed = await getExecuted(db);

  if (executed.length === 0) {
    console.log('No migrations to rollback.');
    return;
  }

  const last = executed[executed.length - 1];
  const downFile = last.replace('.sql', '_down.sql');
  const downPath = path.join(MIGRATIONS_DIR, downFile);

  if (!fs.existsSync(downPath)) {
    console.error(`Rollback file not found: ${downFile}`);
    process.exit(1);
  }

  console.log(`Rolling back: ${last}`);
  const sql = fs.readFileSync(downPath, 'utf-8');
  await db.raw(sql);
  await db('_migrations').where('name', last).del();
  console.log(`  ✓ ${last} rolled back`);
}

async function main() {
  const direction = process.argv[2] || 'up';
  const db = getDb();

  try {
    await testConnection();

    if (direction === 'up') {
      await runUp(db);
    } else if (direction === 'down') {
      await runDown(db);
    } else {
      console.error('Usage: node run.js [up|down]');
      process.exit(1);
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
