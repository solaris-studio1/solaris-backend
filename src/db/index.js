// src/db/index.js
// Conexión singleton a la base de datos SQLite

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './solaris.db';

let db;

function getDB() {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

module.exports = { getDB };
