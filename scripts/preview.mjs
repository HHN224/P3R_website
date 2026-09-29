import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const dist = path.join(root, 'dist');
app.get('/journal', (_req, res) => res.sendFile(path.join(dist, 'journal/index.html')));
app.use(express.static(dist, { extensions: ['html'] }));
app.use((_req, res) => res.status(404).sendFile(path.join(dist, '404.html')));
const port = Number(process.env.PORT || 4173);
app.listen(port, '127.0.0.1', () => console.log(`静态预览 → http://localhost:${port}`));
