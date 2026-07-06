import sqlite3 from 'sqlite3';
import path from 'path';

// Use a physical database file
// Put inside 'uploads' so Docker volume can persist it easily
const dbPath = process.env.NODE_ENV === 'production' 
  ? path.resolve(__dirname, '../../uploads/database.sqlite')
  : path.resolve(__dirname, '../../database.sqlite');

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Create initial tables
    db.run(`
      CREATE TABLE IF NOT EXISTS imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        league TEXT,
        objective TEXT,
        year TEXT,
        position_sought TEXT,
        observation TEXT,
        import_date DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add observation column to existing databases (ignore error if it already exists)
    db.run(`ALTER TABLE imports ADD COLUMN observation TEXT`, () => {});

    db.run(`
      CREATE TABLE IF NOT EXISTS import_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id INTEGER,
        name TEXT,
        visible_columns TEXT,
        FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE CASCADE
      )
    `);
  }
});
