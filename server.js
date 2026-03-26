// server.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');

const app        = express();
const PORT       = 3000;
const SECRET_KEY = 'your-very-secure-secret'; // Use env variable in production!

app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500',
           'http://127.0.0.1:3000', 'http://localhost:3000']
}));
app.use(express.json());

// ── IN-MEMORY DATABASE ─────────────────────────────────────
const db = {
  accounts:    [],
  employees:   [],
  departments: [
    { id: 'dept-1', name: 'Engineering',     description: 'Software engineering and product development.' },
    { id: 'dept-2', name: 'Human Resources', description: 'People operations, hiring, and culture.' },
  ],
  requests: [],
};

// Seed default admin
(async () => {
  db.accounts.push({
    firstName:  'Admin',
    lastName:   'User',
    email:      'admin@example.com',
    password:   await bcrypt.hash('Password123!', 10),
    role:       'admin',
    verified:   true,
    joinedDate: new Date().toISOString().split('T')[0],
  });
  console.log('Default admin seeded: admin@example.com / Password123!');
})();

// ── MIDDLEWARE ─────────────────────────────────────────────
function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── AUTH ───────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.accounts.find(a => a.email === email.toLowerCase()))
    return res.status(409).json({ error: 'An account with that email already exists.' });
  db.accounts.push({
    firstName, lastName,
    email: email.toLowerCase(),
    password: await bcrypt.hash(password, 10),
    role: 'user', verified: false,
    joinedDate: new Date().toISOString().split('T')[0],
  });
  res.status(201).json({ message: 'Registered successfully.' });
});

app.post('/api/verify-email', (req, res) => {
  const acc = db.accounts.find(a => a.email === req.body.email?.toLowerCase());
  if (!acc) return res.status(404).json({ error: 'Account not found.' });
  acc.verified = true;
  res.json({ message: 'Email verified.' });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const acc = db.accounts.find(a => a.email === email?.toLowerCase());
  if (!acc || !(await bcrypt.compare(password, acc.password)))
    return res.status(401).json({ error: 'Invalid email or password.' });
  if (!acc.verified)
    return res.status(403).json({ error: 'Email not verified. Please verify first.' });
  const token = jwt.sign({ email: acc.email, role: acc.role }, SECRET_KEY, { expiresIn: '8h' });
  const { password: _pw, ...safe } = acc;
  res.json({ token, user: safe });
});

app.get('/api/profile', authenticateToken, (req, res) => {
  const acc = db.accounts.find(a => a.email === req.user.email);
  if (!acc) return res.status(404).json({ error: 'Account not found.' });
  const { password: _pw, ...safe } = acc;
  res.json(safe);
});

// ── ACCOUNTS (admin) ───────────────────────────────────────
app.get('/api/accounts', authenticateToken, requireAdmin, (req, res) => {
  res.json(db.accounts.map(({ password: _pw, ...a }) => a));
});

app.post('/api/accounts', authenticateToken, requireAdmin, async (req, res) => {
  const { firstName, lastName, email, password, role = 'user', verified = false } = req.body;
  if (!firstName || !lastName || !email || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.accounts.find(a => a.email === email.toLowerCase()))
    return res.status(409).json({ error: 'Email already in use.' });
  const newAcc = { firstName, lastName, email: email.toLowerCase(),
    password: await bcrypt.hash(password, 10), role, verified,
    joinedDate: new Date().toISOString().split('T')[0] };
  db.accounts.push(newAcc);
  const { password: _pw, ...safe } = newAcc;
  res.status(201).json(safe);
});

app.put('/api/accounts/:email', authenticateToken, requireAdmin, async (req, res) => {
  const acc = db.accounts.find(a => a.email === req.params.email.toLowerCase());
  if (!acc) return res.status(404).json({ error: 'Account not found.' });
  const { firstName, lastName, email, password, role, verified } = req.body;
  if (!firstName || !lastName || !email)
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  const newEmail = email.toLowerCase();
  if (newEmail !== acc.email && db.accounts.find(a => a.email === newEmail))
    return res.status(409).json({ error: 'Another account with that email already exists.' });
  acc.firstName = firstName; acc.lastName = lastName; acc.email = newEmail;
  if (role !== undefined) acc.role = role;
  if (verified !== undefined) acc.verified = verified;
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    acc.password = await bcrypt.hash(password, 10);
  }
  const { password: _pw, ...safe } = acc;
  res.json(safe);
});

app.delete('/api/accounts/:email', authenticateToken, requireAdmin, (req, res) => {
  const email = req.params.email.toLowerCase();
  if (email === req.user.email) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const idx = db.accounts.findIndex(a => a.email === email);
  if (idx === -1) return res.status(404).json({ error: 'Account not found.' });
  db.accounts.splice(idx, 1);
  db.employees = db.employees.filter(e => e.email !== email);
  res.json({ message: 'Account deleted.' });
});

app.post('/api/accounts/:email/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  const acc = db.accounts.find(a => a.email === req.params.email.toLowerCase());
  if (!acc) return res.status(404).json({ error: 'Account not found.' });
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  acc.password = await bcrypt.hash(password, 10);
  res.json({ message: 'Password reset.' });
});

// ── DEPARTMENTS ────────────────────────────────────────────
app.get('/api/departments', authenticateToken, (req, res) => res.json(db.departments));

app.post('/api/departments', authenticateToken, requireAdmin, (req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required.' });
  const d = { id: `dept-${Date.now()}`, name, description };
  db.departments.push(d);
  res.status(201).json(d);
});

app.put('/api/departments/:id', authenticateToken, requireAdmin, (req, res) => {
  const dept = db.departments.find(d => d.id === req.params.id);
  if (!dept) return res.status(404).json({ error: 'Department not found.' });
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required.' });
  dept.name = name; dept.description = description ?? dept.description;
  res.json(dept);
});

app.delete('/api/departments/:id', authenticateToken, requireAdmin, (req, res) => {
  const idx = db.departments.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Department not found.' });
  db.departments.splice(idx, 1);
  res.json({ message: 'Department deleted.' });
});

// ── EMPLOYEES ──────────────────────────────────────────────
app.get('/api/employees', authenticateToken, requireAdmin, (req, res) => res.json(db.employees));

app.post('/api/employees', authenticateToken, requireAdmin, (req, res) => {
  const { employeeId, email, position, deptId, hireDate = '' } = req.body;
  if (!employeeId || !email || !position || !deptId)
    return res.status(400).json({ error: 'Employee ID, email, position, and department are required.' });
  if (!db.accounts.find(a => a.email === email.toLowerCase()))
    return res.status(404).json({ error: 'No account found with that email address.' });
  const e = { employeeId, email: email.toLowerCase(), position, deptId, hireDate };
  db.employees.push(e);
  res.status(201).json(e);
});

app.put('/api/employees/:idx', authenticateToken, requireAdmin, (req, res) => {
  const idx = parseInt(req.params.idx);
  if (isNaN(idx) || !db.employees[idx]) return res.status(404).json({ error: 'Employee not found.' });
  const { employeeId, email, position, deptId, hireDate = '' } = req.body;
  if (!employeeId || !email || !position || !deptId)
    return res.status(400).json({ error: 'Employee ID, email, position, and department are required.' });
  if (!db.accounts.find(a => a.email === email.toLowerCase()))
    return res.status(404).json({ error: 'No account found with that email address.' });
  db.employees[idx] = { employeeId, email: email.toLowerCase(), position, deptId, hireDate };
  res.json(db.employees[idx]);
});

app.delete('/api/employees/:idx', authenticateToken, requireAdmin, (req, res) => {
  const idx = parseInt(req.params.idx);
  if (isNaN(idx) || !db.employees[idx]) return res.status(404).json({ error: 'Employee not found.' });
  db.employees.splice(idx, 1);
  res.json({ message: 'Employee deleted.' });
});

// ── REQUESTS ───────────────────────────────────────────────
app.get('/api/requests', authenticateToken, (req, res) => {
  const list = req.user.role === 'admin'
    ? db.requests
    : db.requests.filter(r => r.employeeEmail === req.user.email);
  res.json(list);
});

app.post('/api/requests', authenticateToken, (req, res) => {
  const { type, items } = req.body;
  if (!type || !items?.length)
    return res.status(400).json({ error: 'Request type and at least one item are required.' });
  const r = { id: `req-${Date.now()}`, type, items, status: 'Pending',
    date: new Date().toLocaleDateString(), employeeEmail: req.user.email };
  db.requests.push(r);
  res.status(201).json(r);
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nServer running at http://localhost:${PORT}`);
  console.log('Login: admin@example.com / Password123!\n');
});
