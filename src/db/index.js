const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || './solaris.db';

let db;

function getDB() {
  if (!db) {
    db = new sqlite3.Database(path.resolve(DB_PATH));
  }
  return db;
}

module.exports = { getDB };
