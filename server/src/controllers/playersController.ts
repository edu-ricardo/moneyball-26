import { Request, Response } from 'express';
import { db } from '../db/database';

// Helper to build WHERE clause
function buildWhereClause(filtersParam: string | undefined): { whereStr: string, params: any[] } {
  if (!filtersParam) return { whereStr: '', params: [] };
  try {
    const filters = JSON.parse(filtersParam);
    if (!Array.isArray(filters) || filters.length === 0) return { whereStr: '', params: [] };
    
    const conditions: string[] = [];
    const params: any[] = [];
    
    filters.forEach(f => {
      // Basic validation
      if (!f.col || !f.op || f.val === undefined) return;
      
      const safeCol = `"${String(f.col).replace(/"/g, '""')}"`;
      let op = '=';
      let val = f.val;
      
      switch (f.op) {
        case '>': op = '>'; break;
        case '<': op = '<'; break;
        case '>=': op = '>='; break;
        case '<=': op = '<='; break;
        case '=': op = '='; break;
        case 'LIKE': 
          op = 'LIKE'; 
          val = `%${val}%`;
          break;
        case '!=': op = '!='; break;
      }
      
      conditions.push(`${safeCol} ${op} ?`);
      params.push(val);
    });
    
    if (conditions.length === 0) return { whereStr: '', params: [] };
    return { whereStr: `WHERE ${conditions.join(' AND ')}`, params };
  } catch (err) {
    return { whereStr: '', params: [] };
  }
}

export const getPlayersByImportId = (req: Request, res: Response) => {
  const importIdStr = req.params.importId as string;
  const importId = parseInt(importIdStr, 10);
  if (isNaN(importId)) return res.status(400).json({ error: 'Invalid import ID' });
  
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const sortBy = (req.query.sortBy as string) || 'id';
  const sortOrder = (req.query.sortOrder as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  
  const { whereStr, params: whereParams } = buildWhereClause(req.query.filters as string);
  
  // Safe column name for sorting (if user sorts by a complex name, wrap in quotes)
  const safeSortBy = `"${sortBy.replace(/"/g, '""')}"`;
  
  const offset = (page - 1) * limit;
  const tableName = `data_import_${importId}`;
  
  // Get total count
  db.get(`SELECT COUNT(*) as total FROM ${tableName} ${whereStr}`, whereParams, (err, countRow: any) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const total = countRow ? countRow.total : 0;
    
    const dataQuery = `SELECT * FROM ${tableName} ${whereStr} ORDER BY ${safeSortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    const params = [...whereParams, limit, offset];
    
    // Fetch generated columns info
    db.all(`PRAGMA table_xinfo(${tableName})`, (err, pragmaRows: any[]) => {
      let calculatedFields: string[] = [];
      if (!err && pragmaRows) {
        // hidden: 2 means GENERATED ALWAYS AS ... VIRTUAL
        // hidden: 3 means GENERATED ALWAYS AS ... STORED
        calculatedFields = pragmaRows.filter(r => r.hidden === 2 || r.hidden === 3).map(r => r.name);
      }

      db.all(dataQuery, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({
          data: rows,
          calculatedFields,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        });
      });
    });
  });
};

export const getScatterData = (req: Request, res: Response) => {
  const importIdStr = req.params.importId as string;
  const importId = parseInt(importIdStr, 10);
  if (isNaN(importId)) return res.status(400).json({ error: 'Invalid import ID' });
  
  const { whereStr, params: whereParams } = buildWhereClause(req.query.filters as string);
  const tableName = `data_import_${importId}`;
  
  // Fetch up to 2000 rows for the scatter plot to keep it performant
  db.all(`SELECT * FROM ${tableName} ${whereStr} LIMIT 2000`, whereParams, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};
