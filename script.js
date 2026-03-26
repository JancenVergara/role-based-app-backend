'use strict';

/* ─────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────── */
const API = 'http://localhost:3000/api';

let currentUser = null;

// ── API HELPER ─────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ─────────────────────────────────────────────────────────
   ROUTING
───────────────────────────────────────────────────────── */
const protectedRoutes = ['profile', 'requests'];
const adminRoutes     = ['employees', 'accounts', 'departments'];
// Note: 'requests' is protected (login required) but accessible to both roles

function navigateTo(hash) { window.location.hash = hash; }

function handleRouting() {
  let hash = window.location.hash || '#/';
  if (!hash.startsWith('#/')) hash = '#/';
  const route = hash.replace('#/', '').split('/')[0] || 'home';

  if (protectedRoutes.includes(route) && !currentUser) {
    showToast('Please log in to access that page.', 'warning');
    return navigateTo('#/login');
  }
  if (adminRoutes.includes(route) && (!currentUser || currentUser.role !== 'admin')) {
    showToast('Admin access required.', 'danger');
    return navigateTo('#/');
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageId = route === 'home' ? 'home-page' : `${route}-page`;
  const target = document.getElementById(pageId);
  if (target) { target.classList.add('active'); onPageEnter(route); }
  else { document.getElementById('home-page').classList.add('active'); }
}

function onPageEnter(route) {
  switch (route) {
    case 'verify-email':  renderVerifyEmail();     break;
    case 'profile':       renderProfile();         break;
    case 'employees':     renderEmployeesTable();  break;
    case 'departments':   renderDepartmentsTable();break;
    case 'accounts':      renderAccountsList();    break;
    case 'requests':      renderRequestsTable();   break;
  }
}

/* ─────────────────────────────────────────────────────────
   AUTH STATE
───────────────────────────────────────────────────────── */
function setAuthState(isAuth, user = null) {
  currentUser = user;
  const body = document.body;
  if (isAuth && user) {
    body.classList.remove('not-authenticated');
    body.classList.add('authenticated');
    body.classList.toggle('is-admin', user.role === 'admin');
    const el = document.getElementById('nav-username');
    if (el) el.textContent = `${user.firstName} ${user.lastName}`;
  } else {
    body.classList.remove('authenticated', 'is-admin');
    body.classList.add('not-authenticated');
  }
}

/* ─────────────────────────────────────────────────────────
   REGISTER
───────────────────────────────────────────────────────── */
async function handleRegister(e) {
  e.preventDefault();
  const form = document.getElementById('register-form');
  const err  = document.getElementById('register-error');
  hideError(err);
  form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

  const firstName = document.getElementById('reg-fname').value.trim();
  const lastName  = document.getElementById('reg-lname').value.trim();
  const email     = document.getElementById('reg-email').value.trim().toLowerCase();
  const password  = document.getElementById('reg-password').value;

  let valid = true;
  if (!firstName) { document.getElementById('reg-fname').classList.add('is-invalid');    valid = false; }
  if (!lastName)  { document.getElementById('reg-lname').classList.add('is-invalid');    valid = false; }
  if (!email)     { document.getElementById('reg-email').classList.add('is-invalid');    valid = false; }
  if (password.length < 6) { document.getElementById('reg-password').classList.add('is-invalid'); valid = false; }
  if (!valid) return;

  try {
    await apiFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, email, password }),
    });
    localStorage.setItem('unverified_email', email);
    form.reset();
    navigateTo('#/verify-email');
  } catch (err2) {
    showError(err, err2.message);
  }
}

/* ─────────────────────────────────────────────────────────
   VERIFY EMAIL
───────────────────────────────────────────────────────── */
function renderVerifyEmail() {
  const email = localStorage.getItem('unverified_email') || '';
  const el = document.getElementById('verify-email-display');
  if (el) el.textContent = email || '(no email found)';
}

async function handleSimulateVerify() {
  const email = localStorage.getItem('unverified_email');
  if (!email) {
    showToast('No pending verification found.', 'danger');
    return navigateTo('#/register');
  }
  try {
    await apiFetch('/verify-email', { method: 'POST', body: JSON.stringify({ email }) });
    localStorage.removeItem('unverified_email');
    showToast('Email verified! You can now log in.', 'success');
    navigateTo('#/login');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

/* ─────────────────────────────────────────────────────────
   LOGIN
───────────────────────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  const err = document.getElementById('login-error');
  hideError(err);

  const email    = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;

  try {
    const data = await apiFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('auth_token', data.token);
    setAuthState(true, data.user);
    showToast(`Welcome back, ${data.user.firstName}!`, 'success');
    navigateTo('#/profile');
  } catch (err2) {
    showError(err, err2.message);
  }
}

/* ─────────────────────────────────────────────────────────
   LOGOUT
───────────────────────────────────────────────────────── */
function handleLogout(e) {
  e.preventDefault();
  localStorage.removeItem('auth_token');
  setAuthState(false);
  navigateTo('#/');
}

/* ─────────────────────────────────────────────────────────
   RESTORE SESSION
───────────────────────────────────────────────────────── */
async function restoreSession() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;
  try {
    const user = await apiFetch('/profile');
    setAuthState(true, user);
  } catch {
    localStorage.removeItem('auth_token');
  }
}

/* ─────────────────────────────────────────────────────────
   PROFILE
───────────────────────────────────────────────────────── */
function renderProfile() {
  if (!currentUser) return;
  const u = currentUser;
  document.getElementById('profile-name').textContent  = `${u.firstName} ${u.lastName}`;
  document.getElementById('profile-email').textContent = u.email;
  document.getElementById('profile-role').textContent  = capitalize(u.role);
  document.getElementById('profile-verified').innerHTML = u.verified
    ? 'Yes <span style="color:green;">✅</span>'
    : 'No ❌';
}

/* ─────────────────────────────────────────────────────────
   ACCOUNTS (admin)
───────────────────────────────────────────────────────── */
async function renderAccountsList() {
  const tbody = document.getElementById('accounts-tbody');
  const empty = document.getElementById('accounts-empty');
  tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">Loading…</td></tr>';

  try {
    const accounts = await apiFetch('/accounts');
    tbody.innerHTML = '';
    if (!accounts.length) { empty.classList.remove('d-none'); return; }
    empty.classList.add('d-none');

    accounts.forEach(acc => {
      const isSelf = currentUser && currentUser.email === acc.email;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(acc.firstName)} ${esc(acc.lastName)}</td>
        <td>${esc(acc.email)}</td>
        <td>${capitalize(acc.role)}</td>
        <td>${acc.verified ? 'Yes ✅' : 'No ❌'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editAccount('${esc(acc.email)}')">Edit</button>
          <button class="btn btn-sm btn-outline-secondary me-1" onclick="resetPassword('${esc(acc.email)}')">Reset PW</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteAccount('${esc(acc.email)}')" ${isSelf ? 'disabled' : ''}>Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${esc(err.message)}</td></tr>`;
  }
}

async function editAccount(email) {
  try {
    const accounts = await apiFetch('/accounts');
    const acc = accounts.find(a => a.email === email);
    if (!acc) return showToast('Account not found.', 'danger');
    showAccountForm();
    document.getElementById('account-form-title').textContent = 'Edit Account';
    document.getElementById('acc-edit-email').value  = acc.email;
    document.getElementById('acc-fname').value       = acc.firstName;
    document.getElementById('acc-lname').value       = acc.lastName;
    document.getElementById('acc-email').value       = acc.email;
    document.getElementById('acc-password').value    = '';
    document.getElementById('acc-role').value        = acc.role;
    document.getElementById('acc-verified').checked  = acc.verified;
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function resetPassword(email) {
  const newPw = window.prompt('Enter new password (min 6 characters):');
  if (newPw === null) return;
  if (newPw.length < 6) return showToast('Password must be at least 6 characters.', 'danger');
  try {
    await apiFetch(`/accounts/${encodeURIComponent(email)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: newPw }),
    });
    showToast('Password reset successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function deleteAccount(email) {
  if (!confirm(`Delete account for ${email}?`)) return;
  try {
    await apiFetch(`/accounts/${encodeURIComponent(email)}`, { method: 'DELETE' });
    showToast('Account deleted.', 'success');
    renderAccountsList();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleAccountForm(e) {
  e.preventDefault();
  const err       = document.getElementById('account-form-error');
  const editEmail = document.getElementById('acc-edit-email').value;
  const firstName = document.getElementById('acc-fname').value.trim();
  const lastName  = document.getElementById('acc-lname').value.trim();
  const email     = document.getElementById('acc-email').value.trim().toLowerCase();
  const password  = document.getElementById('acc-password').value;
  const role      = document.getElementById('acc-role').value;
  const verified  = document.getElementById('acc-verified').checked;
  hideError(err);

  if (!firstName || !lastName || !email)
    return showError(err, 'First name, last name, and email are required.');

  try {
    if (editEmail) {
      const updated = await apiFetch(`/accounts/${encodeURIComponent(editEmail)}`, {
        method: 'PUT',
        body: JSON.stringify({ firstName, lastName, email, password: password || undefined, role, verified }),
      });
      if (currentUser && currentUser.email === editEmail) {
        setAuthState(true, updated);
      }
      showToast('Account updated.', 'success');
    } else {
      if (!password || password.length < 6)
        return showError(err, 'Password must be at least 6 characters.');
      await apiFetch('/accounts', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, email, password, role, verified }),
      });
      showToast('Account created.', 'success');
    }
    hideAccountForm();
    renderAccountsList();
  } catch (err2) {
    showError(err, err2.message);
  }
}

function showAccountForm() {
  const panel = document.getElementById('account-form-panel');
  panel.classList.remove('d-none');
  document.getElementById('account-form').reset();
  document.getElementById('acc-edit-email').value = '';
  document.getElementById('account-form-title').textContent = 'New Account';
  hideError(document.getElementById('account-form-error'));
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function hideAccountForm() {
  document.getElementById('account-form-panel').classList.add('d-none');
}

/* ─────────────────────────────────────────────────────────
   DEPARTMENTS
───────────────────────────────────────────────────────── */
async function renderDepartmentsTable() {
  const tbody = document.getElementById('departments-tbody');
  const empty = document.getElementById('departments-empty');
  tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-center py-3">Loading…</td></tr>';

  try {
    const depts = await apiFetch('/departments');
    tbody.innerHTML = '';
    if (!depts.length) { empty.classList.remove('d-none'); return; }
    empty.classList.add('d-none');

    depts.forEach(dept => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(dept.name)}</td>
        <td>${esc(dept.description || '—')}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editDepartment('${esc(dept.id)}')">Edit</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteDepartment('${esc(dept.id)}')">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-danger text-center py-3">${esc(err.message)}</td></tr>`;
  }
}

async function editDepartment(id) {
  const name = window.prompt('New department name:');
  if (!name) return;
  const description = window.prompt('New description (optional):') || '';
  try {
    await apiFetch(`/departments/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description }),
    });
    showToast('Department updated.', 'success');
    renderDepartmentsTable();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function deleteDepartment(id) {
  if (!confirm('Delete this department?')) return;
  try {
    await apiFetch(`/departments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Department deleted.', 'success');
    renderDepartmentsTable();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Wire the Add Department button
async function handleAddDepartment() {
  const name = window.prompt('Department name:');
  if (!name) return;
  const description = window.prompt('Description (optional):') || '';
  try {
    await apiFetch('/departments', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    showToast('Department added.', 'success');
    renderDepartmentsTable();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

/* ─────────────────────────────────────────────────────────
   EMPLOYEES
───────────────────────────────────────────────────────── */
async function renderEmployeesTable() {
  const tbody = document.getElementById('employees-tbody');
  const empty = document.getElementById('employees-empty');
  tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">Loading…</td></tr>';
  await populateDeptDropdown('emp-dept');

  try {
    const [employees, departments] = await Promise.all([
      apiFetch('/employees'),
      apiFetch('/departments'),
    ]);
    tbody.innerHTML = '';
    if (!employees.length) { empty.classList.remove('d-none'); return; }
    empty.classList.add('d-none');

    employees.forEach((emp, idx) => {
      const dept = departments.find(d => d.id === emp.deptId);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(emp.employeeId)}</td>
        <td>${esc(emp.email)}</td>
        <td>${esc(emp.position)}</td>
        <td>${dept ? esc(dept.name) : '—'}</td>
        <td>${esc(emp.hireDate || '—')}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editEmployee(${idx})">Edit</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteEmployee(${idx})">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-3">${esc(err.message)}</td></tr>`;
  }
}

async function editEmployee(idx) {
  try {
    const employees = await apiFetch('/employees');
    const emp = employees[idx];
    if (!emp) return;
    showEmployeeForm();
    document.getElementById('employee-form-title').textContent = 'Edit Employee';
    document.getElementById('emp-edit-id').value   = String(idx);
    document.getElementById('emp-id').value        = emp.employeeId;
    document.getElementById('emp-email').value     = emp.email;
    document.getElementById('emp-position').value  = emp.position;
    document.getElementById('emp-dept').value      = emp.deptId;
    document.getElementById('emp-hire-date').value = emp.hireDate || '';
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function deleteEmployee(idx) {
  if (!confirm('Delete this employee record?')) return;
  try {
    await apiFetch(`/employees/${idx}`, { method: 'DELETE' });
    showToast('Employee deleted.', 'success');
    renderEmployeesTable();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function handleEmployeeForm(e) {
  e.preventDefault();
  const err        = document.getElementById('employee-form-error');
  const editIdxStr = document.getElementById('emp-edit-id').value;
  const employeeId = document.getElementById('emp-id').value.trim();
  const email      = document.getElementById('emp-email').value.trim().toLowerCase();
  const position   = document.getElementById('emp-position').value.trim();
  const deptId     = document.getElementById('emp-dept').value;
  const hireDate   = document.getElementById('emp-hire-date').value;
  hideError(err);

  if (!employeeId || !email || !position || !deptId)
    return showError(err, 'Employee ID, email, position, and department are required.');

  try {
    const body = JSON.stringify({ employeeId, email, position, deptId, hireDate });
    if (editIdxStr !== '') {
      await apiFetch(`/employees/${editIdxStr}`, { method: 'PUT', body });
      showToast('Employee updated.', 'success');
    } else {
      await apiFetch('/employees', { method: 'POST', body });
      showToast('Employee added.', 'success');
    }
    hideEmployeeForm();
    renderEmployeesTable();
  } catch (err2) {
    showError(err, err2.message);
  }
}

async function showEmployeeForm() {
  const panel = document.getElementById('employee-form-panel');
  panel.classList.remove('d-none');
  document.getElementById('employee-form').reset();
  document.getElementById('emp-edit-id').value = '';
  document.getElementById('employee-form-title').textContent = 'New Employee';
  hideError(document.getElementById('employee-form-error'));
  await populateDeptDropdown('emp-dept');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function hideEmployeeForm() {
  document.getElementById('employee-form-panel').classList.add('d-none');
}

async function populateDeptDropdown(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select —</option>';
  try {
    const depts = await apiFetch('/departments');
    depts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id; opt.textContent = d.name;
      if (d.id === current) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch { /* leave empty if fetch fails */ }
}

/* ─────────────────────────────────────────────────────────
   REQUESTS
───────────────────────────────────────────────────────── */
async function renderRequestsTable() {
  const tbody  = document.getElementById('requests-tbody');
  const thead  = document.querySelector('#requests-page thead tr');
  const empty  = document.getElementById('requests-empty');
  const isAdmin = currentUser && currentUser.role === 'admin';
  const titleEl = document.getElementById('requests-page-title');
  if (titleEl) titleEl.textContent = isAdmin ? 'All Requests' : 'My Requests';
  tbody.innerHTML = `<tr><td colspan="${isAdmin ? 6 : 4}" class="text-muted text-center py-3">Loading…</td></tr>`;
  if (!currentUser) return;

  // Update table headers based on role
  if (isAdmin) {
    thead.innerHTML = `
      <th>Type</th>
      <th>Items</th>
      <th>Submitted By</th>
      <th>Date</th>
      <th>Status</th>
      <th>Actions</th>`;
  } else {
    thead.innerHTML = `
      <th>Type</th>
      <th>Items</th>
      <th>Date</th>
      <th>Status</th>`;
  }

  try {
    const requests = await apiFetch('/requests');
    tbody.innerHTML = '';
    if (!requests.length) { empty.classList.remove('d-none'); return; }
    empty.classList.add('d-none');

    requests.forEach(req => {
      const badgeClass = {
        'Pending':  'bg-warning text-dark',
        'Approved': 'bg-success',
        'Rejected': 'bg-danger',
      }[req.status] || 'bg-secondary';
      const itemsSummary = req.items.map(it => `${esc(it.name)} ×${it.qty}`).join(', ');
      const tr = document.createElement('tr');

      if (isAdmin) {
        const isPending = req.status === 'Pending';
        tr.innerHTML = `
          <td>${esc(req.type)}</td>
          <td style="max-width:220px;white-space:normal;font-size:.85rem">${itemsSummary}</td>
          <td class="small">${esc(req.employeeEmail)}</td>
          <td>${esc(req.date)}</td>
          <td><span class="badge ${badgeClass}">${esc(req.status)}</span></td>
          <td>
            <button class="btn btn-sm btn-success me-1" onclick="updateRequestStatus('${esc(req.id)}', 'Approved')" ${isPending ? '' : 'disabled'}>✔ Approve</button>
            <button class="btn btn-sm btn-danger"       onclick="updateRequestStatus('${esc(req.id)}', 'Rejected')" ${isPending ? '' : 'disabled'}>✖ Reject</button>
          </td>`;
      } else {
        tr.innerHTML = `
          <td>${esc(req.type)}</td>
          <td style="max-width:260px;white-space:normal;font-size:.85rem">${itemsSummary}</td>
          <td>${esc(req.date)}</td>
          <td><span class="badge ${badgeClass}">${esc(req.status)}</span></td>`;
      }
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 6 : 4}" class="text-danger text-center py-3">${esc(err.message)}</td></tr>`;
  }
}

async function updateRequestStatus(id, status) {
  try {
    await apiFetch(`/requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    showToast(`Request ${status.toLowerCase()}.`, status === 'Approved' ? 'success' : 'danger');
    renderRequestsTable();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

let requestItemCount = 0;

function addRequestItem() {
  requestItemCount++;
  const container = document.getElementById('req-items-container');
  const div = document.createElement('div');
  div.className = 'req-item-row';
  div.dataset.itemId = requestItemCount;
  div.innerHTML = `
    <input type="text" class="form-control form-control-sm item-name" placeholder="Item name" />
    <input type="number" class="form-control form-control-sm req-qty item-qty" placeholder="Qty" min="1" value="1" />
    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeRequestItem(${requestItemCount})">×</button>`;
  container.appendChild(div);
}

function removeRequestItem(id) {
  const el = document.querySelector(`[data-item-id="${id}"]`);
  if (el) el.remove();
}

async function handleSubmitRequest() {
  const err  = document.getElementById('request-form-error');
  const type = document.getElementById('req-type').value;
  hideError(err);

  if (!type) return showError(err, 'Please select a request type.');
  const rows = document.querySelectorAll('#req-items-container .req-item-row');
  if (!rows.length) return showError(err, 'Please add at least one item.');

  const items = [];
  let valid = true;
  rows.forEach(row => {
    const name = row.querySelector('.item-name').value.trim();
    const qty  = parseInt(row.querySelector('.item-qty').value) || 1;
    if (!name) valid = false;
    else items.push({ name, qty });
  });
  if (!valid || !items.length) return showError(err, 'Please fill in all item names.');

  try {
    await apiFetch('/requests', {
      method: 'POST',
      body: JSON.stringify({ type, items }),
    });
    const modal = bootstrap.Modal.getInstance(document.getElementById('requestModal'));
    if (modal) modal.hide();
    document.getElementById('request-form').reset();
    document.getElementById('req-items-container').innerHTML = '';
    requestItemCount = 0;
    showToast('Request submitted!', 'success');
    renderRequestsTable();
  } catch (err2) {
    showError(err, err2.message);
  }
}

/* ─────────────────────────────────────────────────────────
   TOASTS
───────────────────────────────────────────────────────── */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const id = `toast-${Date.now()}`;
  const bgMap = { success: 'text-bg-success', danger: 'text-bg-danger', warning: 'text-bg-warning', info: 'text-bg-info' };
  const el = document.createElement('div');
  el.id = id;
  el.className = `toast align-items-center ${bgMap[type] || bgMap.info} border-0 show`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="document.getElementById('${id}').remove()"></button>
    </div>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ─────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────── */
function showError(el, msg) { if (!el) return; el.textContent = msg; el.classList.remove('d-none'); }
function hideError(el)      { if (!el) return; el.textContent = ''; el.classList.add('d-none'); }
function capitalize(str)    { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await restoreSession();

  window.addEventListener('hashchange', handleRouting);
  if (!window.location.hash || window.location.hash === '#') window.location.hash = '#/';
  handleRouting();

  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('simulate-verify-btn')?.addEventListener('click', handleSimulateVerify);

  document.getElementById('account-form')?.addEventListener('submit', handleAccountForm);
  document.getElementById('add-account-btn')?.addEventListener('click', showAccountForm);
  document.getElementById('cancel-account-btn')?.addEventListener('click', hideAccountForm);

  document.getElementById('employee-form')?.addEventListener('submit', handleEmployeeForm);
  document.getElementById('add-employee-btn')?.addEventListener('click', showEmployeeForm);
  document.getElementById('cancel-employee-btn')?.addEventListener('click', hideEmployeeForm);

  // Wire up Add Department button (replaces the alert stub)
  document.querySelector('#departments-page .btn-primary')
    ?.addEventListener('click', handleAddDepartment);

  document.getElementById('new-request-btn')?.addEventListener('click', () => {
    document.getElementById('req-items-container').innerHTML = '';
    requestItemCount = 0;
    hideError(document.getElementById('request-form-error'));
    addRequestItem();
    new bootstrap.Modal(document.getElementById('requestModal')).show();
  });
  document.getElementById('add-item-btn')?.addEventListener('click', addRequestItem);
  document.getElementById('submit-request-btn')?.addEventListener('click', handleSubmitRequest);

  document.addEventListener('input', e => e.target.classList.remove('is-invalid'));
});
