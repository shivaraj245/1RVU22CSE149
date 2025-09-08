import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { initLogger, Log } from '../../logging-middleware/index';

// Always load .env from backend-test directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;
const DB_PATH = process.env.DATABASE_URL
  ? path.resolve(__dirname, '..', process.env.DATABASE_URL)
  : path.resolve(__dirname, '../db.sqlite');

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());

// Logging middleware init
initLogger({});

// Open SQLite DB
let db: Database<sqlite3.Database, sqlite3.Statement>;
(async () => {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  // Create tables if not exist
  await db.exec(`CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shortcode TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expiry_at TEXT NOT NULL,
    clicks_count INTEGER DEFAULT 0
  );`);
  await db.exec(`CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    referrer TEXT,
    country TEXT,
    FOREIGN KEY(url_id) REFERENCES urls(id)
  );`);

  await Log('backend','info','route',`server started on :${PORT}`);
  app.listen(PORT, () => {
    // No console.log allowed
  });
})();

// Helper: Shortcode generator
function generateShortcode(len = 6) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i=0; i<len; i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}
async function getUniqueShortcode() {
  for (let attempt=0; attempt<6; attempt++) {
    const code = generateShortcode(6 + Math.floor(attempt/4));
    const exists = await db.get('SELECT 1 FROM urls WHERE shortcode=?', code);
    if (!exists) return code;
  }
  throw new Error('unable to generate unique shortcode');
}

// POST /shorturls
app.post('/shorturls', async (req: Request, res: Response) => {
  const { url, validity, shortcode } = req.body;
  await Log('backend','info','handler',`create request shortcode=${shortcode || 'auto'} url=${url}`);
  // Validate
  if (!url || typeof url !== 'string') {
    await Log('backend','error','handler','invalid url');
    return res.status(400).json({ error: 'invalid url' });
  }
  let validMinutes = 30;
  if (validity !== undefined) {
    if (typeof validity !== 'number' || validity <= 0) {
      await Log('backend','error','handler','invalid validity');
      return res.status(400).json({ error: 'invalid validity' });
    }
    validMinutes = validity;
  }
  let code = shortcode;
  if (code) {
    if (!/^[A-Za-z0-9]{4,20}$/.test(code)) {
      await Log('backend','error','handler','invalid shortcode');
      return res.status(400).json({ error: 'invalid shortcode' });
    }
    const exists = await db.get('SELECT 1 FROM urls WHERE shortcode=?', code);
    if (exists) {
      await Log('backend','warn','handler',`shortcode collision attempt=${code}`);
      return res.status(409).json({ error: 'shortcode already exists' });
    }
  } else {
    try {
      code = await getUniqueShortcode();
    } catch {
      await Log('backend','error','handler','shortcode generation failed');
      return res.status(500).json({ error: 'could not generate shortcode' });
    }
  }
  const now = new Date();
  const expiry = new Date(now.getTime() + validMinutes * 60000);
  try {
    const result = await db.run(
      'INSERT INTO urls (shortcode, original_url, created_at, expiry_at) VALUES (?, ?, ?, ?)',
      code, url, now.toISOString(), expiry.toISOString()
    );
    await Log('backend','info','controller',`created short url id=${result.lastID} shortcode=${code}`);
    return res.status(201).json({
      shortLink: `http://localhost:${PORT}/${code}`,
      expiry: expiry.toISOString()
    });
  } catch (err) {
    await Log('backend','error','db','db insert failed');
    return res.status(500).json({ error: 'db error' });
  }
});

// GET /shorturls/:shortcode
app.get('/shorturls/:shortcode', async (req: Request, res: Response) => {
  const { shortcode } = req.params;
  await Log('backend','info','route',`stats requested shortcode=${shortcode}`);
  const urlRow = await db.get<any>('SELECT * FROM urls WHERE shortcode=?', shortcode);
  if (!urlRow) return res.status(404).json({ error: 'not found' });
  const clicks = await db.all<any[]>('SELECT timestamp, referrer, country FROM clicks WHERE url_id=?', urlRow.id);
  return res.json({
    shortcode: urlRow.shortcode,
    shortLink: `http://localhost:${PORT}/${urlRow.shortcode}`,
    url: urlRow.original_url,
    createdAt: urlRow.created_at,
    expiry: urlRow.expiry_at,
    clicks: urlRow.clicks_count,
    clickData: clicks.map((c: any) => ({ timestamp: c.timestamp, referrer: c.referrer, location: c.country }))
  });
});

// GET /:shortcode
app.get('/:shortcode', async (req: Request, res: Response) => {
  const { shortcode } = req.params;
  const urlRow = await db.get<any>('SELECT * FROM urls WHERE shortcode=?', shortcode);
  if (!urlRow) {
    await Log('backend','warn','route',`redirect not found shortcode=${shortcode}`);
    return res.status(404).json({ error: 'Link expired or invalid' });
  }
  if (new Date(urlRow.expiry_at) < new Date()) {
    await Log('backend','warn','route',`redirect expired shortcode=${shortcode}`);
    return res.status(410).json({ error: 'Link expired or invalid' });
  }
  await Log('backend','info','route',`redirect hit shortcode=${shortcode} ip=${req.ip || 'unknown'}`);
  // Country detection
  let country = req.get('cf-ipcountry') || req.get('x-country');
  if (!country) {
    const lang = req.get('accept-language');
    if (lang) {
      const match = lang.match(/^[a-zA-Z]{2,3}-([A-Z]{2})/);
      country = match ? match[1] : 'Unknown';
    } else {
      country = 'Unknown';
    }
  }
  try {
    await db.run('INSERT INTO clicks (url_id, timestamp, referrer, country) VALUES (?, ?, ?, ?)',
      urlRow.id, new Date().toISOString(), req.get('referer') || '', country);
    await db.run('UPDATE urls SET clicks_count = clicks_count + 1 WHERE id=?', urlRow.id);
    await Log('backend','debug','db',`click recorded for shortcode=${shortcode}`);
  } catch {
    await Log('backend','error','db',`click record failed for shortcode=${shortcode}`);
  }
  return res.redirect(302, urlRow.original_url);
});

// GET /shorturls (list all)
app.get('/shorturls', async (req: Request, res: Response) => {
  await Log('backend','info','route','list all short urls requested');
  const urls = await db.all<any[]>('SELECT * FROM urls');
  return res.json(urls.map((u: any) => ({
    id: u.id,
    shortcode: u.shortcode,
    shortLink: `http://localhost:${PORT}/${u.shortcode}`,
    url: u.original_url,
    clicks: u.clicks_count,
    createdAt: u.created_at,
    expiry: u.expiry_at
  })));
});

// POST /internal/log (frontend logging proxy)
app.post('/internal/log', async (req: Request, res: Response) => {
  const { stack, level, package: pkg, message } = req.body;
  if (stack !== 'frontend') return res.status(400).json({ error: 'invalid stack' });
  try {
    await Log('frontend', level, pkg, message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'log failed' });
  }
});

// Error handler
app.use(async (err: any, req: Request, res: Response, next: NextFunction) => {
  await Log('backend','fatal','handler',err.message || 'unknown error');
  res.status(500).json({ error: 'internal error' });
});
