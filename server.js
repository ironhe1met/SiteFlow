const express = require('express');
const multer  = require('multer');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const db  = new Database('./database.db');
const PORT = process.env.PORT || 3000;

// ── DB init ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    type        TEXT,
    sender_email TEXT,
    title       TEXT,
    description TEXT,
    body_text   TEXT,
    page_url    TEXT,
    photo_links TEXT,
    status      TEXT DEFAULT 'new',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS task_files (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id  TEXT,
    category TEXT,
    filename TEXT,
    original TEXT
  );
`);

// ── Storage ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = `./uploads/${req.taskId}`;
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Middleware ───────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false
}));

// ── Mail ─────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendMails(task, taskUrl) {
  const subject = `[${task.type}] ${task.title}`;
  const html = `
    <h2>${task.title}</h2>
    <p><b>Тип:</b> ${task.type}</p>
    <p><b>Від:</b> ${task.sender_email}</p>
    <p><b>Опис:</b> ${task.description}</p>
    ${task.body_text ? `<p><b>Текст:</b><br>${task.body_text}</p>` : ''}
    ${task.page_url  ? `<p><b>Сторінка:</b> <a href="${task.page_url}">${task.page_url}</a></p>` : ''}
    <hr>
    <p><a href="${taskUrl}">Переглянути задачу →</a></p>
  `;
  const targets = [
    process.env.ADMIN_EMAIL,
    task.sender_email
  ].filter(Boolean);

  for (const to of targets) {
    await mailer.sendMail({ from: process.env.SMTP_USER, to, subject, html });
  }
}

// ── Routes: form submit ──────────────────────────────────
app.post('/api/tasks', (req, res, next) => {
  req.taskId = uuidv4();
  next();
}, upload.fields([
  { name: 'photos',     maxCount: 10 },
  { name: 'body_files', maxCount: 5  },
  { name: 'extra_files',maxCount: 10 }
]), async (req, res) => {
  try {
    const { type, sender_email, title, description, body_text, page_url, photo_links } = req.body;
    const id = req.taskId;

    db.prepare(`
      INSERT INTO tasks (id,type,sender_email,title,description,body_text,page_url,photo_links)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, type, sender_email, title, description, body_text || '', page_url || '', photo_links || '');

    const saveFiles = (files, category) => {
      if (!files) return;
      for (const f of files) {
        db.prepare(`INSERT INTO task_files (task_id,category,filename,original) VALUES (?,?,?,?)`)
          .run(id, category, f.filename, f.originalname);
      }
    };
    saveFiles(req.files?.photos,      'photo');
    saveFiles(req.files?.body_files,  'body');
    saveFiles(req.files?.extra_files, 'extra');

    const taskUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/task/${id}`;
    const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
    await sendMails(task, taskUrl).catch(console.error);

    res.json({ ok: true, id, url: taskUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Routes: public task page ─────────────────────────────
app.get('/task/:id', (req, res) => {
  const task  = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  const files = db.prepare('SELECT * FROM task_files WHERE task_id=?').all(task.id);
  res.sendFile(path.join(__dirname, 'public', 'task.html'));
});

app.get('/api/task/:id', (req, res) => {
  const task  = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).json({ ok: false });
  const files = db.prepare('SELECT * FROM task_files WHERE task_id=?').all(task.id);
  res.json({ ok: true, task, files });
});

// ── Routes: public task list ─────────────────────────────
app.get('/api/tasks', (req, res) => {
  const tasks = db.prepare('SELECT id,type,title,status,created_at FROM tasks ORDER BY created_at DESC').all();
  res.json({ ok: true, tasks });
});

// ── Admin auth ───────────────────────────────────────────
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASS) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'Невірний пароль' });
});

function requireAdmin(req, res, next) {
  if (req.session?.admin) return next();
  res.status(401).json({ ok: false, error: 'Не авторизовано' });
}

// ── Admin API ────────────────────────────────────────────
app.get('/api/admin/tasks', requireAdmin, (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
  res.json({ ok: true, tasks });
});

app.patch('/api/admin/tasks/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['new', 'in_progress', 'review', 'done'];
  if (!allowed.includes(status)) return res.status(400).json({ ok: false });
  db.prepare("UPDATE tasks SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/tasks/:id', requireAdmin, (req, res) => {
  const files = db.prepare('SELECT * FROM task_files WHERE task_id=?').all(req.params.id);
  for (const f of files) {
    const fp = path.join(__dirname, 'uploads', req.params.id, f.filename);
    fs.rmSync(fp, { force: true });
  }
  db.prepare('DELETE FROM task_files WHERE task_id=?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
