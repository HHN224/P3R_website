import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { importedPost, minutes } from './content.mjs';

export function createStore(dataDir, contentDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'blog.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS posts (slug TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const decode = row => row ? { ...JSON.parse(row.payload), revision: row.revision } : undefined;
  const get = slug => decode(db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug));
  const list = (all = false) => db.prepare('SELECT * FROM posts').all().map(decode).filter(p => all || p.status === 'published').sort((a,b) => b.date.localeCompare(a.date) || b.day-a.day);
  function insert(p) { db.prepare('INSERT INTO posts (slug,payload) VALUES (?,?)').run(p.slug, JSON.stringify({...p, minutes:minutes(p.markdown)})); return get(p.slug); }
  if (contentDir && !db.prepare("SELECT value FROM metadata WHERE key = 'seed-v1'").get()) {
    db.exec('BEGIN');
    try {
      for (const file of readdirSync(contentDir).filter(f => f.endsWith('.md'))) {
        const p = importedPost(file, readFileSync(path.join(contentDir, file),'utf8'));
        if (!get(p.slug)) insert(p);
      }
      db.prepare('INSERT INTO metadata VALUES (?,?)').run('seed-v1','done');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return { db, list, get, insert, update(slug,p,revision) {
    return db.prepare('UPDATE posts SET payload=?, revision=revision+1 WHERE slug=? AND revision=?').run(JSON.stringify({...p,minutes:minutes(p.markdown)}),slug,revision).changes > 0;
  }};
}
