import { Request, Response } from 'express';
import { db } from '../db/database';

export const createImport = (req: Request, res: Response) => {
  const { name, league, objective, year, position_sought, observation, data } = req.body;

  if (!data || !Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'Data is missing or empty' });
  }

  // 1. Insert into imports table
  db.run(
    `INSERT INTO imports (name, league, objective, year, position_sought, observation) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, league, objective, year, position_sought, observation],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const importId = this.lastID;
      const tableName = `data_import_${importId}`;
      
      // 2. Type Inference
      const firstRow = data[0];
      const columnTypes: Record<string, string> = {};
      
      Object.keys(firstRow).forEach(key => {
        let isNumeric = true;
        let hasValue = false;
        
        for (let i = 0; i < Math.min(data.length, 100); i++) {
          const val = data[i][key];
          if (val !== null && val !== undefined && val !== '') {
            hasValue = true;
            // Check if it's a valid number. We allow optional leading/trailing whitespace.
            // Be careful with strings like "10,5" which in JS is NaN, but maybe it's text.
            if (isNaN(Number(val))) {
              isNumeric = false;
              break;
            }
          }
        }
        
        columnTypes[key] = (hasValue && isNumeric) ? 'REAL' : 'TEXT';
      });

      const columns = Object.keys(firstRow).map((key, index) => {
        // Sanitize column names for SQLite
        let safeName = key.replace(/[^a-zA-Z0-9_]/g, '_');
        if (!safeName) safeName = `col_${index}`;
        return `"${safeName}" ${columnTypes[key]}`;
      });
      
      const createTableQuery = `CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${columns.join(', ')})`;
      
      db.run(createTableQuery, (err) => {
        if (err) return res.status(500).json({ error: 'Error creating dynamic table: ' + err.message });
        
        // 3. Insert data rows
        const keys = Object.keys(firstRow).map((key, index) => {
          let safeName = key.replace(/[^a-zA-Z0-9_]/g, '_');
          if (!safeName) safeName = `col_${index}`;
          return `"${safeName}"`;
        });
        const placeholders = keys.map(() => '?').join(', ');
        const insertQuery = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
        
        const stmt = db.prepare(insertQuery);
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          data.forEach(row => {
            const values = Object.keys(firstRow).map(key => {
              const val = row[key];
              if (val === null || val === undefined || val === '') return null;
              
              if (columnTypes[key] === 'REAL') {
                return Number(val);
              }
              return String(val);
            });
            stmt.run(values);
          });
          db.run('COMMIT', (err) => {
            stmt.finalize();
            if (err) return res.status(500).json({ error: 'Error inserting data: ' + err.message });
            res.json({ success: true, importId });
          });
        });
      });
    }
  );
};

export const getImports = (req: Request, res: Response) => {
  db.all('SELECT * FROM imports ORDER BY import_date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

export const deleteImport = (req: Request, res: Response) => {
  const importIdStr = req.params.importId as string;
  const importId = parseInt(importIdStr, 10);
  
  if (isNaN(importId)) {
    return res.status(400).json({ error: 'Invalid import ID' });
  }

  // Use a transaction or sequential execution to delete from imports table and drop the dynamic table
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // Drop the data table if it exists
    const tableName = `data_import_${importId}`;
    db.run(`DROP TABLE IF EXISTS ${tableName}`, (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: `Failed to drop data table: ${err.message}` });
      }
    });
    
    // Delete from imports table
    db.run('DELETE FROM imports WHERE id = ?', [importId], function(err) {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: `Failed to delete from imports table: ${err.message}` });
      }
      
      // If no rows were affected, the ID didn't exist
      if (this.changes === 0) {
        db.run('ROLLBACK');
        return res.status(404).json({ error: 'Import not found' });
      }
      
      db.run('COMMIT', (err) => {
        if (err) return res.status(500).json({ error: `Failed to commit transaction: ${err.message}` });
        res.json({ message: 'Import deleted successfully', id: importId });
      });
    });
  });
};

export const addCalculatedField = (req: Request, res: Response) => {
  const importIdStr = req.params.importId as string;
  const importId = parseInt(importIdStr, 10);
  if (isNaN(importId)) return res.status(400).json({ error: 'Invalid import ID' });

  const { fieldName, formula } = req.body;
  if (!fieldName || !formula) return res.status(400).json({ error: 'fieldName and formula are required' });

  const tableName = `data_import_${importId}`;
  
  // Safe column name for the calculated field
  const safeFieldName = `"${fieldName.replace(/"/g, '""')}"`;
  
  // Create Generated Virtual Column in SQLite
  const query = `ALTER TABLE ${tableName} ADD COLUMN ${safeFieldName} REAL GENERATED ALWAYS AS (${formula}) VIRTUAL`;
  
  db.run(query, (err) => {
    if (err) {
      return res.status(400).json({ error: `Failed to create calculated field: ${err.message}` });
    }
    res.json({ message: 'Calculated field created successfully', fieldName });
  });
};

export const deleteColumn = (req: Request, res: Response) => {
  const importIdStr = req.params.importId as string;
  const colName = req.params.colName as string;
  const importId = parseInt(importIdStr, 10);
  
  if (isNaN(importId) || !colName) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const tableName = `data_import_${importId}`;
  const safeFieldName = `"${colName.replace(/"/g, '""')}"`;
  
  const query = `ALTER TABLE ${tableName} DROP COLUMN ${safeFieldName}`;
  
  db.run(query, (err) => {
    if (err) {
      return res.status(400).json({ error: `Failed to delete column (SQLite might require v3.35.0+): ${err.message}` });
    }
    res.json({ message: 'Column deleted successfully', colName });
  });
};
