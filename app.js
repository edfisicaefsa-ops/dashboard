const API_URL = 'https://script.google.com/macros/s/AKfycbw5GwPSGhBMHd5Q6P1dcdb4XSYoZFUrvr3EIjZZlRLK_N8KNZKmeQNH6ceK_FYBEJwD/exec';
const SESSION_KEY = 'efsa_session_v1';

const state = {
  session: null,
  bootstrap: null,
  activeTab: null,
  cache: {
    users: [],
    classrooms: [],
    subjects: [],
    students: [],
    assignments: [],
    config: {},
    reports: null
  },
  profSelection: {
    idAula: '',
    idMateria: '',
    grades: []
  }
};

let deferredInstallPrompt = null;

/* =========================================================================
 * INICIALIZACIÓN Y PWA
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.getElementById('btn-install-pwa').classList.remove('hidden');
  });

  document.getElementById('btn-install-pwa').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('btn-install-pwa').classList.add('hidden');
  });

  document.getElementById('login-form').addEventListener('submit', onLoginSubmit);
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      state.session = JSON.parse(saved);
      enterApp();
    } catch (_) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
});

function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal(title, htmlContent) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = htmlContent;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

async function apiPost(action, payload = {}) {
  if (!API_URL || API_URL.includes('TU_URL_DE_APPS_SCRIPT_EXEC')) {
    throw new Error('Configurá primero la constante API_URL en app.js.');
  }
  const body = Object.assign({}, payload, {
    action: action,
    actorLp: state.session ? state.session.LP : '',
    actorToken: state.session ? state.session.token : ''
  });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Error en la operación.');
  }
  return json.data;
}

/* =========================================================================
 * AUTENTICACIÓN Y SHELL
 * ========================================================================= */

async function onLoginSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  try {
    const usuario = document.getElementById('login-usuario').value.trim();
    const password = document.getElementById('login-password').value;
    const data = await apiPost('login', { usuario, password });
    state.session = data.user;
    state.cache.config = data.config || {};
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
    await enterApp();
    showToast('Bienvenido, ' + data.user.Nombre + ' ' + data.user.Apellido, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function logout() {
  state.session = null;
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('login-form').reset();
}

async function enterApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  const u = state.session;
  document.getElementById('topbar-user').textContent = `${u.Apellido}, ${u.Nombre} (LP ${u.LP}) · ${u.Rol.toUpperCase()}`;

  const boot = await apiPost('getBootstrap');
  state.bootstrap = boot;
  state.cache.config = boot.config || {};
  state.cache.classrooms = boot.classrooms || [];
  state.cache.subjects = boot.subjects || [];
  state.cache.assignments = boot.assignments || [];

  const isClosed = String(state.cache.config.Plataforma_Cerrada || 'NO').toUpperCase() === 'SI';
  const lockBanner = document.getElementById('lock-banner');
  if (isClosed && u.Rol.toLowerCase() !== 'admin') {
    lockBanner.classList.remove('hidden');
  } else {
    lockBanner.classList.add('hidden');
  }

  const isAdmin = u.Rol.toLowerCase() === 'admin';
  document.getElementById('admin-nav').classList.toggle('hidden', !isAdmin);
  document.getElementById('prof-nav').classList.toggle('hidden', isAdmin);

  const defaultTab = isAdmin ? 'usuarios' : 'prof-notas';
  switchTab(defaultTab);
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const titles = {
    usuarios: '1. Usuarios y Credenciales',
    alumnos: '2. Alumnos y Cursada',
    asignaciones: '3. Asignaciones (Aula + Materia)',
    aulas: '4. Aulas',
    materias: '5. Materias',
    reportes: '6. Reportes Académicos',
    config: '7. Configuración y Blanqueo',
    'prof-notas': 'Carga de Calificaciones'
  };
  document.getElementById('topbar-title').textContent = titles[tabName] || 'EFSA';

  renderCurrentTab();
}

async function renderCurrentTab() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="card">Cargando...</div>';

  try {
    switch (state.activeTab) {
      case 'usuarios': return await renderUsersTab(main);
      case 'alumnos': return await renderStudentsTab(main);
      case 'asignaciones': return await renderAssignmentsTab(main);
      case 'aulas': return await renderClassroomsTab(main);
      case 'materias': return await renderSubjectsTab(main);
      case 'reportes': return await renderReportsTab(main);
      case 'config': return await renderConfigTab(main);
      case 'prof-notas': return await renderProfessorGradesTab(main);
    }
  } catch (err) {
    main.innerHTML = `<div class="card">Error: ${escapeHtml(err.message)}</div>`;
    showToast(err.message, 'error');
  }
}

/* =========================================================================
 * 1. USUARIOS
 * ========================================================================= */

async function renderUsersTab(main) {
  const users = await apiPost('listUsers');
  state.cache.users = users;

  main.innerHTML = `
    <div class="stack-md">
      <div class="row-gap">
        <button type="button" class="btn btn-primary" id="btn-new-user">+ Nuevo Usuario</button>
      </div>
      <div id="users-list" class="stack-sm">
        ${users.map(u => `
          <div class="list-item">
            <div class="item-main">
              <div class="item-title">${escapeHtml(u.Apellido)}, ${escapeHtml(u.Nombre)} · LP ${escapeHtml(u.LP)}</div>
              <div class="item-meta">Usuario: <strong>${escapeHtml(u.Usuario)}</strong> · Rol: ${escapeHtml(u.Rol)}</div>
            </div>
            <div class="row-gap">
              <span class="badge ${u.Activo === 'SI' ? 'badge-ok' : 'badge-bad'}">${u.Activo === 'SI' ? 'Activo' : 'Inactivo'}</span>
              <button type="button" class="btn btn-secondary btn-sm" data-edit-user="${escapeAttr(u.LP)}">Editar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-new-user').addEventListener('click', () => openUserForm(null));
  main.querySelectorAll('[data-edit-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      const found = state.cache.users.find(x => x.LP === btn.dataset.editUser);
      openUserForm(found || null);
    });
  });
}

function openUserForm(user) {
  const isEdit = Boolean(user);
  openModal(isEdit ? `Editar Usuario (${user.LP})` : 'Nuevo Usuario', `
    <form id="user-form" class="stack-md">
      <div class="field">
        <label>LP (Legajo / Identificador)</label>
        <input name="LP" required value="${escapeAttr(user ? user.LP : '')}" />
      </div>
      <div class="row-gap">
        <div class="field">
          <label>Nombre</label>
          <input name="Nombre" required value="${escapeAttr(user ? user.Nombre : '')}" />
        </div>
        <div class="field">
          <label>Apellido</label>
          <input name="Apellido" required value="${escapeAttr(user ? user.Apellido : '')}" />
        </div>
      </div>
      <div class="row-gap">
        <div class="field">
          <label>Usuario (login)</label>
          <input name="Usuario" required value="${escapeAttr(user ? user.Usuario : '')}" />
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input name="Password" type="text" required value="${escapeAttr(user ? user.Password : '')}" />
        </div>
      </div>
      <div class="row-gap">
        <div class="field">
          <label>Rol</label>
          <select name="Rol">
            <option value="profesor" ${user && user.Rol === 'profesor' ? 'selected' : ''}>profesor</option>
            <option value="admin" ${user && user.Rol === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </div>
        <div class="field">
          <label>Estado</label>
          <select name="Activo">
            <option value="SI" ${!user || user.Activo === 'SI' ? 'selected' : ''}>SI (Activo)</option>
            <option value="NO" ${user && user.Activo === 'NO' ? 'selected' : ''}>NO (Inactivo)</option>
          </select>
        </div>
      </div>
      <div class="row-gap">
        <button type="submit" class="btn btn-primary">Guardar</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-del-user">Eliminar</button>` : ''}
      </div>
    </form>
  `);

  document.getElementById('user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      originalLp: isEdit ? user.LP : '',
      user: Object.fromEntries(fd.entries())
    };
    try {
      await apiPost('saveUser', payload);
      closeModal();
      showToast('Usuario guardado.', 'success');
      renderCurrentTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  const delBtn = document.getElementById('btn-del-user');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      try {
        await apiPost('deleteUser', { LP: user.LP });
        closeModal();
        showToast('Usuario eliminado.', 'success');
        renderCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

/* =========================================================================
 * 2. ALUMNOS (INCLUYE CAMBIO DE AULA, CARGA MASIVA Y DETALLE DE FINALES)
 * ========================================================================= */

async function renderStudentsTab(main) {
  const [students, classrooms] = await Promise.all([
    apiPost('listStudents'),
    apiPost('listClassrooms')
  ]);
  state.cache.students = students;
  state.cache.classrooms = classrooms;

  const aulaMap = {};
  classrooms.forEach(c => { aulaMap[c.ID_Aula] = c.Nombre_Aula; });

  main.innerHTML = `
    <div class="stack-md">
      <div class="row-gap">
        <button type="button" class="btn btn-primary" id="btn-new-student">+ Nuevo Aspirante</button>
        <button type="button" class="btn btn-secondary" id="btn-bulk-student">Carga Masiva</button>
        <div class="field">
          <input id="filter-student-aula" type="text" placeholder="Filtrar por aula o LP/Apellido..." />
        </div>
      </div>

      <div id="students-list" class="stack-sm"></div>
    </div>
  `;

  const renderFiltered = () => {
    const q = document.getElementById('filter-student-aula').value.trim().toLowerCase();
    const list = students.filter(s => {
      if (!q) return true;
      const nomAula = (aulaMap[s.ID_Aula] || s.ID_Aula).toLowerCase();
      return (
        s.LP.toLowerCase().includes(q) ||
        s.Apellido.toLowerCase().includes(q) ||
        s.Nombre.toLowerCase().includes(q) ||
        nomAula.includes(q) ||
        s.Especialidad.toLowerCase().includes(q)
      );
    });

    const container = document.getElementById('students-list');
    container.innerHTML = list.map(s => {
      const isBaja = s.Estado.toLowerCase() === 'baja';
      return `
        <div class="list-item clickable" data-detail-student="${escapeAttr(s.LP)}">
          <div class="item-main">
            <div class="item-title">${escapeHtml(s.Apellido)}, ${escapeHtml(s.Nombre)} · LP ${escapeHtml(s.LP)}</div>
            <div class="item-meta">Aula: <strong>${escapeHtml(aulaMap[s.ID_Aula] || s.ID_Aula)}</strong> · Esp: ${escapeHtml(s.Especialidad)}</div>
          </div>
          <div class="row-gap">
            <span class="badge ${isBaja ? 'badge-bad' : 'badge-ok'}">${escapeHtml(s.Estado)}</span>
            <button type="button" class="btn btn-secondary btn-sm" data-edit-student="${escapeAttr(s.LP)}">Editar</button>
          </div>
        </div>
      `;
    }).join('') || '<div class="card">Sin resultados.</div>';

    container.querySelectorAll('[data-detail-student]').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('[data-edit-student]')) return;
        openStudentDetail(row.dataset.detailStudent);
      });
    });

    container.querySelectorAll('[data-edit-student]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const found = state.cache.students.find(x => x.LP === btn.dataset.editStudent);
        openStudentForm(found || null);
      });
    });
  };

  document.getElementById('filter-student-aula').addEventListener('input', renderFiltered);
  document.getElementById('btn-new-student').addEventListener('click', () => openStudentForm(null));
  document.getElementById('btn-bulk-student').addEventListener('click', openBulkStudentsModal);
  renderFiltered();
}

function openStudentForm(student) {
  const isEdit = Boolean(student);
  const classrooms = state.cache.classrooms;

  openModal(isEdit ? `Editar Aspirante (${student.LP})` : 'Nuevo Aspirante', `
    <form id="student-form" class="stack-md">
      <div class="field">
        <label>LP</label>
        <input name="LP" required value="${escapeAttr(student ? student.LP : '')}" />
      </div>
      <div class="row-gap">
        <div class="field">
          <label>Apellido</label>
          <input name="Apellido" required value="${escapeAttr(student ? student.Apellido : '')}" />
        </div>
        <div class="field">
          <label>Nombre</label>
          <input name="Nombre" required value="${escapeAttr(student ? student.Nombre : '')}" />
        </div>
      </div>
      <div class="field">
        <label>Aula (actualiza especialidad automáticamente si cambia)</label>
        <select name="ID_Aula" required>
          ${classrooms.map(c => `
            <option value="${escapeAttr(c.ID_Aula)}" ${student && student.ID_Aula === c.ID_Aula ? 'selected' : ''}>
              ${escapeHtml(c.Nombre_Aula)} (${escapeHtml(c.Especialidad)})
            </option>
          `).join('')}
        </select>
      </div>
      <div class="row-gap">
        <div class="field">
          <label>Género</label>
          <select name="Genero">
            <option value="M" ${student && student.Genero === 'M' ? 'selected' : ''}>M</option>
            <option value="F" ${student && student.Genero === 'F' ? 'selected' : ''}>F</option>
            <option value="X" ${student && student.Genero === 'X' ? 'selected' : ''}>X</option>
          </select>
        </div>
        <div class="field">
          <label>Estado</label>
          <select name="Estado">
            <option value="Alta" ${!student || student.Estado !== 'Baja' ? 'selected' : ''}>Alta</option>
            <option value="Baja" ${student && student.Estado === 'Baja' ? 'selected' : ''}>Baja</option>
          </select>
        </div>
      </div>
      <div class="row-gap">
        <button type="submit" class="btn btn-primary">Guardar</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-del-student">Eliminar</button>` : ''}
      </div>
    </form>
  `);

  document.getElementById('student-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await apiPost('saveStudent', {
        originalLp: isEdit ? student.LP : '',
        student: Object.fromEntries(fd.entries())
      });
      closeModal();
      showToast('Aspirante guardado.', 'success');
      renderCurrentTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  const delBtn = document.getElementById('btn-del-student');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      try {
        await apiPost('deleteStudent', { LP: student.LP });
        closeModal();
        showToast('Aspirante eliminado.', 'success');
        renderCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

async function openStudentDetail(lp) {
  openModal('Situación Académica del Aspirante', '<div class="card">Consultando materias y finales...</div>');
  try {
    const info = await apiPost('getStudentAcademicDetail', { LP: lp });
    const st = info.student;
    const statusBadge = info.allApproved
      ? `<span class="badge badge-ok">Todas las materias aprobadas / promocionadas</span>`
      : info.hasPendingFinals
        ? `<span class="badge badge-warn">Debe rendir ${info.pendingFinals.length} examen(es) final(es)</span>`
        : `<span class="badge badge-info">Cursada en progreso</span>`;

    const finalsHtml = info.hasPendingFinals
      ? `<div class="card" style="border-color: var(--warning)">
           <div class="card-title">Materias que debe rendir a final</div>
           <ul class="stack-sm" style="margin:0; padding-left:18px;">
             ${info.pendingFinals.map(f => `
               <li><strong>${escapeHtml(f.Nombre_Materia)}</strong> (${escapeHtml(f.Regimen)}) — ${escapeHtml(f.motivoFinal)}</li>
             `).join('')}
           </ul>
         </div>`
      : '';

    openModal(`${st.Apellido}, ${st.Nombre} · LP ${st.LP}`, `
      <div class="stack-md">
        <div class="card">
          <div><strong>Aula:</strong> ${escapeHtml(st.Nombre_Aula)} · <strong>Especialidad:</strong> ${escapeHtml(st.Especialidad)} · <strong>Estado:</strong> ${escapeHtml(st.Estado)}</div>
          <div style="margin-top:8px;">${statusBadge}</div>
        </div>
        ${finalsHtml}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Materia</th>
                <th>Rég.</th>
                <th>Prom.</th>
                <th>P1</th>
                <th>P2</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${info.subjects.map(sub => `
                <tr>
                  <td>${escapeHtml(sub.Nombre_Materia)}</td>
                  <td>${escapeHtml(sub.Regimen)}</td>
                  <td>${escapeHtml(sub.Promocional)}</td>
                  <td>${sub.Prom_P1 === '' ? '-' : sub.Prom_P1}</td>
                  <td>${sub.Prom_P2 === '' ? '-' : sub.Prom_P2}</td>
                  <td><span class="badge ${sub.requiereFinal ? 'badge-warn' : 'badge-ok'}">${escapeHtml(sub.estado)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (err) {
    openModal('Error', `<div class="card">${escapeHtml(err.message)}</div>`);
  }
}

function openBulkStudentsModal() {
  openModal('Carga Masiva de Aspirantes', `
    <form id="bulk-student-form" class="stack-md">
      <p class="item-meta">Pegá filas separadas por coma o tabulación en este orden:<br/><code>LP, Apellido, Nombre, Aula(ID o Nombre), Genero, Estado</code></p>
      <textarea id="bulk-students-text" rows="7" placeholder="3001, Perez, Juan, 101, M, Alta&#10;3002, Gomez, Ana, 101, F, Alta"></textarea>
      <button type="submit" class="btn btn-primary">Importar Aspirantes</button>
    </form>
  `);

  document.getElementById('bulk-student-form').addEventListener('submit', async e => {
    e.preventDefault();
    const lines = document.getElementById('bulk-students-text').value
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const students = lines.map(line => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      return {
        LP: (parts[0] || '').trim(),
        Apellido: (parts[1] || '').trim(),
        Nombre: (parts[2] || '').trim(),
        ID_Aula: (parts[3] || '').trim(),
        Genero: (parts[4] || '').trim(),
        Estado: (parts[5] || 'Alta').trim()
      };
    });

    try {
      const res = await apiPost('bulkSaveStudents', { students });
      closeModal();
      showToast(`Importados: ${res.created} nuevos, ${res.updated} actualizados.`, 'success');
      renderCurrentTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* =========================================================================
 * 3. ASIGNACIONES
 * ========================================================================= */

async function renderAssignmentsTab(main) {
  const [assignments, users, classrooms, subjects] = await Promise.all([
    apiPost('listAssignments'),
    apiPost('listUsers'),
    apiPost('listClassrooms'),
    apiPost('listSubjects')
  ]);
  state.cache.assignments = assignments;
  state.cache.users = users;
  state.cache.classrooms = classrooms;
  state.cache.subjects = subjects;

  const profs = users.filter(u => u.Rol.toLowerCase() === 'profesor');
  const profMap = {};
  users.forEach(u => { profMap[u.LP] = `${u.Apellido}, ${u.Nombre}`; });
  const aulaMap = {};
  classrooms.forEach(c => { aulaMap[c.ID_Aula] = c.Nombre_Aula; });
  const matMap = {};
  subjects.forEach(m => { matMap[m.ID_Materia] = m.Nombre_Materia; });

  main.innerHTML = `
    <div class="stack-md">
      <form id="assignment-form" class="card stack-md">
        <div class="card-title">Nueva Asignación (1 profesor por Aula + Materia)</div>
        <div class="row-gap">
          <div class="field">
            <label>Profesor</label>
            <select name="LP_Profesor" required>
              <option value="">Seleccionar...</option>
              ${profs.map(p => `<option value="${escapeAttr(p.LP)}">${escapeHtml(p.Apellido)}, ${escapeHtml(p.Nombre)} (${escapeHtml(p.LP)})</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Aula</label>
            <select name="ID_Aula" required>
              <option value="">Seleccionar...</option>
              ${classrooms.map(c => `<option value="${escapeAttr(c.ID_Aula)}">${escapeHtml(c.Nombre_Aula)} (${escapeHtml(c.Especialidad)})</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Materia</label>
            <select name="ID_Materia" required>
              <option value="">Seleccionar...</option>
              ${subjects.map(m => `<option value="${escapeAttr(m.ID_Materia)}">${escapeHtml(m.Nombre_Materia)} (${escapeHtml(m.Regimen)})</option>`).join('')}
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Asignar</button>
      </form>

      <div class="stack-sm">
        ${assignments.map(a => `
          <div class="list-item">
            <div class="item-main">
              <div class="item-title">${escapeHtml(aulaMap[a.ID_Aula] || a.ID_Aula)} · ${escapeHtml(matMap[a.ID_Materia] || a.ID_Materia)}</div>
              <div class="item-meta">Profesor: <strong>${escapeHtml(profMap[a.LP_Profesor] || a.LP_Profesor)}</strong> · ID ${escapeHtml(a.ID_Asignacion)}</div>
            </div>
            <button type="button" class="btn btn-danger-outline btn-sm" data-del-asg="${escapeAttr(a.ID_Asignacion)}">Quitar</button>
          </div>
        `).join('') || '<div class="card">Sin asignaciones cargadas.</div>'}
      </div>
    </div>
  `;

  document.getElementById('assignment-form').addEventListener('submit', async e => {
    e.preventDefault();
    const assignment = Object.fromEntries(new FormData(e.target).entries());
    try {
      await apiPost('saveAssignment', { assignment });
      showToast('Asignación guardada.', 'success');
      renderCurrentTab();
    } catch (err) {
      if (err.message.includes('Confirme reemplazo')) {
        if (confirm(err.message + '\n\n¿Desea reemplazar al profesor actual?')) {
          try {
            await apiPost('saveAssignment', { assignment, replaceExisting: true });
            showToast('Profesor reasignado.', 'success');
            renderCurrentTab();
          } catch (err2) {
            showToast(err2.message, 'error');
          }
        }
      } else {
        showToast(err.message, 'error');
      }
    }
  });

  main.querySelectorAll('[data-del-asg]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await apiPost('deleteAssignment', { ID_Asignacion: btn.dataset.delAsg });
        showToast('Asignación eliminada.', 'success');
        renderCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* =========================================================================
 * 4. AULAS
 * ========================================================================= */

async function renderClassroomsTab(main) {
  const classrooms = await apiPost('listClassrooms');
  state.cache.classrooms = classrooms;

  main.innerHTML = `
    <div class="stack-md">
      <button type="button" class="btn btn-primary" id="btn-new-aula">+ Nueva Aula</button>
      <div class="stack-sm">
        ${classrooms.map(c => `
          <div class="list-item">
            <div class="item-main">
              <div class="item-title">Aula ${escapeHtml(c.Nombre_Aula)} <span class="item-meta">(${escapeHtml(c.ID_Aula)})</span></div>
              <div class="item-meta">Especialidad: <strong>${escapeHtml(c.Especialidad)}</strong></div>
            </div>
            <div class="row-gap">
              <span class="badge ${c.Activa === 'SI' ? 'badge-ok' : 'badge-bad'}">${c.Activa === 'SI' ? 'Activa' : 'Inactiva'}</span>
              <button type="button" class="btn btn-secondary btn-sm" data-edit-aula="${escapeAttr(c.ID_Aula)}">Editar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-new-aula').addEventListener('click', () => openClassroomForm(null));
  main.querySelectorAll('[data-edit-aula]').forEach(btn => {
    btn.addEventListener('click', () => {
      const found = state.cache.classrooms.find(x => x.ID_Aula === btn.dataset.editAula);
      openClassroomForm(found || null);
    });
  });
}

function openClassroomForm(aula) {
  const isEdit = Boolean(aula);
  openModal(isEdit ? `Editar Aula (${aula.Nombre_Aula})` : 'Nueva Aula', `
    <form id="aula-form" class="stack-md">
      <div class="field">
        <label>ID_Aula (opcional, se autogenera si queda vacío)</label>
        <input name="ID_Aula" value="${escapeAttr(aula ? aula.ID_Aula : '')}" placeholder="Ej. AUL-01" />
      </div>
      <div class="field">
        <label>Nombre_Aula</label>
        <input name="Nombre_Aula" required value="${escapeAttr(aula ? aula.Nombre_Aula : '')}" placeholder="Ej. 101" />
      </div>
      <div class="row-gap">
        <div class="field">
          <label>Especialidad</label>
          <select name="Especialidad" required>
            <option value="Seguridad" ${aula && aula.Especialidad === 'Seguridad' ? 'selected' : ''}>Seguridad</option>
            <option value="Bomberos" ${aula && aula.Especialidad === 'Bomberos' ? 'selected' : ''}>Bomberos</option>
            <option value="Comunicaciones" ${aula && aula.Especialidad === 'Comunicaciones' ? 'selected' : ''}>Comunicaciones</option>
          </select>
        </div>
        <div class="field">
          <label>Activa</label>
          <select name="Activa">
            <option value="SI" ${!aula || aula.Activa === 'SI' ? 'selected' : ''}>SI</option>
            <option value="NO" ${aula && aula.Activa === 'NO' ? 'selected' : ''}>NO</option>
          </select>
        </div>
      </div>
      <div class="row-gap">
        <button type="submit" class="btn btn-primary">Guardar</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-del-aula">Eliminar</button>` : ''}
      </div>
    </form>
  `);

  document.getElementById('aula-form').addEventListener('submit', async e => {
    e.preventDefault();
    const classroom = Object.fromEntries(new FormData(e.target).entries());
    try {
      await apiPost('saveClassroom', { originalId: isEdit ? aula.ID_Aula : '', classroom });
      closeModal();
      showToast('Aula guardada.', 'success');
      renderCurrentTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  const delBtn = document.getElementById('btn-del-aula');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      try {
        await apiPost('deleteClassroom', { ID_Aula: aula.ID_Aula });
        closeModal();
        showToast('Aula eliminada.', 'success');
        renderCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

/* =========================================================================
 * 5. MATERIAS
 * ========================================================================= */

async function renderSubjectsTab(main) {
  const subjects = await apiPost('listSubjects');
  state.cache.subjects = subjects;

  main.innerHTML = `
    <div class="stack-md">
      <button type="button" class="btn btn-primary" id="btn-new-mat">+ Nueva Materia</button>
      <div class="stack-sm">
        ${subjects.map(m => {
          const esps = ['Seguridad', 'Bomberos', 'Comunicaciones'].filter(k => m[k] === 'SI').join(', ');
          return `
            <div class="list-item">
              <div class="item-main">
                <div class="item-title">${escapeHtml(m.Nombre_Materia)} <span class="item-meta">(${escapeHtml(m.ID_Materia)})</span></div>
                <div class="item-meta">${escapeHtml(m.Regimen)} · Promocional: <strong>${escapeHtml(m.Promocional)}</strong> · Esp: ${escapeHtml(esps)}</div>
              </div>
              <div class="row-gap">
                <span class="badge ${m.Activa === 'SI' ? 'badge-ok' : 'badge-bad'}">${m.Activa === 'SI' ? 'Activa' : 'Inactiva'}</span>
                <button type="button" class="btn btn-secondary btn-sm" data-edit-mat="${escapeAttr(m.ID_Materia)}">Editar</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-new-mat').addEventListener('click', () => openSubjectForm(null));
  main.querySelectorAll('[data-edit-mat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const found = state.cache.subjects.find(x => x.ID_Materia === btn.dataset.editMat);
      openSubjectForm(found || null);
    });
  });
}

function openSubjectForm(mat) {
  const isEdit = Boolean(mat);
  openModal(isEdit ? `Editar Materia (${mat.Nombre_Materia})` : 'Nueva Materia', `
    <form id="mat-form" class="stack-md">
      <div class="field">
        <label>ID_Materia (opcional)</label>
        <input name="ID_Materia" value="${escapeAttr(mat ? mat.ID_Materia : '')}" placeholder="Ej. MAT-01" />
      </div>
      <div class="field">
        <label>Nombre_Materia</label>
        <input name="Nombre_Materia" required value="${escapeAttr(mat ? mat.Nombre_Materia : '')}" />
      </div>
      <div class="row-gap">
        <div class="field">
          <label>Régimen</label>
          <select name="Regimen">
            <option value="Anual" ${!mat || mat.Regimen === 'Anual' ? 'selected' : ''}>Anual</option>
            <option value="Cuatrimestral" ${mat && mat.Regimen === 'Cuatrimestral' ? 'selected' : ''}>Cuatrimestral</option>
          </select>
        </div>
        <div class="field">
          <label>Promocional</label>
          <select name="Promocional">
            <option value="SI" ${!mat || mat.Promocional === 'SI' ? 'selected' : ''}>SI</option>
            <option value="NO" ${mat && mat.Promocional === 'NO' ? 'selected' : ''}>NO (Final obligatorio)</option>
          </select>
        </div>
      </div>
      <div class="row-gap">
        <div class="field">
          <label>Seguridad</label>
          <select name="Seguridad">
            <option value="SI" ${mat && mat.Seguridad === 'SI' ? 'selected' : ''}>SI</option>
            <option value="NO" ${!mat || mat.Seguridad !== 'SI' ? 'selected' : ''}>NO</option>
          </select>
        </div>
        <div class="field">
          <label>Bomberos</label>
          <select name="Bomberos">
            <option value="SI" ${mat && mat.Bomberos === 'SI' ? 'selected' : ''}>SI</option>
            <option value="NO" ${!mat || mat.Bomberos !== 'SI' ? 'selected' : ''}>NO</option>
          </select>
        </div>
        <div class="field">
          <label>Comunicaciones</label>
          <select name="Comunicaciones">
            <option value="SI" ${mat && mat.Comunicaciones === 'SI' ? 'selected' : ''}>SI</option>
            <option value="NO" ${!mat || mat.Comunicaciones !== 'SI' ? 'selected' : ''}>NO</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>Activa</label>
        <select name="Activa">
          <option value="SI" ${!mat || mat.Activa === 'SI' ? 'selected' : ''}>SI</option>
          <option value="NO" ${mat && mat.Activa === 'NO' ? 'selected' : ''}>NO</option>
        </select>
      </div>
      <div class="row-gap">
        <button type="submit" class="btn btn-primary">Guardar</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" id="btn-del-mat">Eliminar</button>` : ''}
      </div>
    </form>
  `);

  document.getElementById('mat-form').addEventListener('submit', async e => {
    e.preventDefault();
    const subject = Object.fromEntries(new FormData(e.target).entries());
    try {
      await apiPost('saveSubject', { originalId: isEdit ? mat.ID_Materia : '', subject });
      closeModal();
      showToast('Materia guardada.', 'success');
      renderCurrentTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  const delBtn = document.getElementById('btn-del-mat');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      try {
        await apiPost('deleteSubject', { ID_Materia: mat.ID_Materia });
        closeModal();
        showToast('Materia eliminada.', 'success');
        renderCurrentTab();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

/* =========================================================================
 * 6. REPORTES (PROMOCIONALES A FINAL CON AULA Y MATERIA)
 * ========================================================================= */

async function renderReportsTab(main) {
  const classrooms = await apiPost('listClassrooms');
  state.cache.classrooms = classrooms;

  main.innerHTML = `
    <div class="stack-md">
      <div class="card stack-md">
        <div class="card-title">Filtros de Reporte</div>
        <div class="row-gap">
          <div class="field">
            <label>Aula</label>
            <select id="rep-aula">
              <option value="">Todas las aulas</option>
              ${classrooms.map(c => `<option value="${escapeAttr(c.ID_Aula)}">${escapeHtml(c.Nombre_Aula)} (${escapeHtml(c.Especialidad)})</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Especialidad</label>
            <select id="rep-esp">
              <option value="">Todas</option>
              <option value="Seguridad">Seguridad</option>
              <option value="Bomberos">Bomberos</option>
              <option value="Comunicaciones">Comunicaciones</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn btn-primary" id="btn-run-report">Generar Reporte</button>
      </div>

      <div id="report-output" class="stack-md"></div>
    </div>
  `;

  const runReport = async () => {
    const out = document.getElementById('report-output');
    out.innerHTML = '<div class="card">Calculando reporte...</div>';
    const data = await apiPost('getReports', {
      ID_Aula: document.getElementById('rep-aula').value,
      Especialidad: document.getElementById('rep-esp').value
    });
    state.cache.reports = data;

    const pf = data.promocionalesAFinal || [];
    const ra = data.resumenAulas || [];

    out.innerHTML = `
      <div class="card">
        <div class="card-title">Aspirantes que van a Final en Materias Promocionales (${pf.length})</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>LP</th>
                <th>Aspirante</th>
                <th>Aula</th>
                <th>Materia Promocional</th>
                <th>P1 / P2</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              ${pf.map(r => `
                <tr>
                  <td>${escapeHtml(r.LP)}</td>
                  <td>${escapeHtml(r.Apellido)}, ${escapeHtml(r.Nombre)}</td>
                  <td><strong>${escapeHtml(r.Nombre_Aula)}</strong></td>
                  <td><strong>${escapeHtml(r.Nombre_Materia)}</strong></td>
                  <td>${r.Prom_P1 === '' ? '-' : r.Prom_P1} / ${r.Prom_P2 === '' ? '-' : r.Prom_P2}</td>
                  <td>${escapeHtml(r.Motivo)}</td>
                </tr>
              `).join('') || '<tr><td colspan="6">No hay aspirantes en materias promocionales a final con estos filtros.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Resumen por Aula</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Aula</th>
                <th>Especialidad</th>
                <th>Activos</th>
                <th>Promoc. a Final</th>
                <th>Prom. Gral.</th>
              </tr>
            </thead>
            <tbody>
              ${ra.map(a => `
                <tr>
                  <td>${escapeHtml(a.Nombre_Aula)}</td>
                  <td>${escapeHtml(a.Especialidad)}</td>
                  <td>${a.alumnosActivos}</td>
                  <td>${a.promocionalesAFinalCount}</td>
                  <td>${a.promedioGeneral === '' ? '-' : a.promedioGeneral}</td>
                </tr>
              `).join('') || '<tr><td colspan="5">Sin datos.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  document.getElementById('btn-run-report').addEventListener('click', () => {
    runReport().catch(err => showToast(err.message, 'error'));
  });

  await runReport();
}

/* =========================================================================
 * 7. CONFIGURACIÓN Y BLANQUEO ANUAL
 * ========================================================================= */

async function renderConfigTab(main) {
  const cfg = await apiPost('getConfig');
  state.cache.config = cfg;

  main.innerHTML = `
    <div class="stack-md">
      <form id="config-form" class="card stack-md">
        <div class="card-title">Parámetros Globales</div>
        <div class="field">
          <label>Plataforma_Cerrada (bloquea carga de profesores)</label>
          <select name="Plataforma_Cerrada">
            <option value="NO" ${cfg.Plataforma_Cerrada === 'NO' ? 'selected' : ''}>NO (Abierta)</option>
            <option value="SI" ${cfg.Plataforma_Cerrada === 'SI' ? 'selected' : ''}>SI (Cerrada)</option>
          </select>
        </div>
        <div class="row-gap">
          <div class="field">
            <label>Ciclo_Lectivo</label>
            <input name="Ciclo_Lectivo" value="${escapeAttr(cfg.Ciclo_Lectivo || '2026')}" />
          </div>
          <div class="field">
            <label>Nota_Minima_Aprobacion</label>
            <input name="Nota_Minima_Aprobacion" value="${escapeAttr(cfg.Nota_Minima_Aprobacion || '6')}" />
          </div>
          <div class="field">
            <label>Parcial_Minimo_Promocion</label>
            <input name="Parcial_Minimo_Promocion" value="${escapeAttr(cfg.Parcial_Minimo_Promocion || '4')}" />
          </div>
        </div>
        <div class="field">
          <label>Nombre_Instituto</label>
          <input name="Nombre_Instituto" value="${escapeAttr(cfg.Nombre_Instituto || 'Escuela de Suboficiales')}" />
        </div>
        <button type="submit" class="btn btn-primary">Guardar Configuración</button>
      </form>

      <div class="card stack-md" style="border-color: var(--danger)">
        <div class="card-title" style="color: #fca5a5">Blanqueo Anual de Ciclo</div>
        <p class="item-meta">Borra todos los registros de <strong>Alumnos</strong> y <strong>Calificaciones</strong>, conservando Usuarios, Aulas, Materias, Asignaciones y Configuración.</p>
        <div class="field">
          <label>Escribí <strong>BLANQUEAR</strong> para confirmar</label>
          <input id="blanqueo-confirm" type="text" placeholder="BLANQUEAR" />
        </div>
        <button type="button" class="btn btn-danger" id="btn-blanqueo">Ejecutar Blanqueo Anual</button>
      </div>
    </div>
  `;

  document.getElementById('config-form').addEventListener('submit', async e => {
    e.preventDefault();
    const config = Object.fromEntries(new FormData(e.target).entries());
    try {
      const updated = await apiPost('saveConfig', { config });
      state.cache.config = updated;
      showToast('Configuración actualizada.', 'success');
      renderCurrentTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('btn-blanqueo').addEventListener('click', async () => {
    const txt = document.getElementById('blanqueo-confirm').value.trim();
    try {
      await apiPost('blanqueoAnual', { confirmText: txt });
      document.getElementById('blanqueo-confirm').value = '';
      showToast('Blanqueo anual ejecutado con éxito.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* =========================================================================
 * VISTA PROFESOR · CARGA DE CALIFICACIONES
 * ========================================================================= */

async function renderProfessorGradesTab(main) {
  const assignments = state.cache.assignments || [];
  const classrooms = state.cache.classrooms || [];
  const subjects = state.cache.subjects || [];

  const aulaMap = {};
  classrooms.forEach(c => { aulaMap[c.ID_Aula] = c.Nombre_Aula; });
  const matMap = {};
  subjects.forEach(m => { matMap[m.ID_Materia] = m.Nombre_Materia; });

  const isLocked = String(state.cache.config.Plataforma_Cerrada || 'NO').toUpperCase() === 'SI'
    && state.session.Rol.toLowerCase() !== 'admin';

  main.innerHTML = `
    <div class="stack-md">
      <div class="card stack-md">
        <div class="card-title">Seleccionar Curso Asignado</div>
        <div class="field">
          <label>Aula + Materia</label>
          <select id="prof-assignment-select">
            <option value="">Elegir...</option>
            ${assignments.map(a => `
              <option value="${escapeAttr(a.ID_Aula)}::${escapeAttr(a.ID_Materia)}">
                Aula ${escapeHtml(aulaMap[a.ID_Aula] || a.ID_Aula)} — ${escapeHtml(matMap[a.ID_Materia] || a.ID_Materia)}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
      <div id="prof-grades-sheet"></div>
    </div>
  `;

  const sel = document.getElementById('prof-assignment-select');
  sel.addEventListener('change', async () => {
    const val = sel.value;
    const container = document.getElementById('prof-grades-sheet');
    if (!val) {
      container.innerHTML = '';
      return;
    }
    const [idAula, idMateria] = val.split('::');
    container.innerHTML = '<div class="card">Cargando planilla de alumnos...</div>';

    try {
      const rows = await apiPost('getGradesForAssignment', { ID_Aula: idAula, ID_Materia: idMateria });
      state.profSelection = { idAula, idMateria, grades: rows };

      container.innerHTML = `
        <div class="card stack-md">
          <div class="row-gap" style="justify-content:space-between">
            <div class="card-title" style="margin:0">Planilla (${rows.length} alumnos activos)</div>
            <button type="button" class="btn btn-success btn-sm" id="btn-save-all-grades" ${isLocked ? 'disabled' : ''}>
              Guardar Todo
            </button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>LP</th>
                  <th>Alumno</th>
                  <th>P1 N1</th>
                  <th>P1 N2</th>
                  <th>P1 Rec</th>
                  <th>Prom P1</th>
                  <th>P2 N1</th>
                  <th>P2 N2</th>
                  <th>P2 Rec</th>
                  <th>Prom P2</th>
                  <th>Prom Gral</th>
                  <th>Condición</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r, idx) => `
                  <tr data-row-idx="${idx}">
                    <td>${escapeHtml(r.LP_Alumno)}</td>
                    <td>${escapeHtml(r.Apellido)}, ${escapeHtml(r.Nombre)}</td>
                    <td><input class="grade-input" data-f="P1_N1" value="${escapeAttr(r.P1_N1)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td><input class="grade-input" data-f="P1_N2" value="${escapeAttr(r.P1_N2)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td><input class="grade-input" data-f="P1_Rec" value="${escapeAttr(r.P1_Rec)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td class="cell-p1">${r.Prom_P1 === '' ? '-' : r.Prom_P1}</td>
                    <td><input class="grade-input" data-f="P2_N1" value="${escapeAttr(r.P2_N1)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td><input class="grade-input" data-f="P2_N2" value="${escapeAttr(r.P2_N2)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td><input class="grade-input" data-f="P2_Rec" value="${escapeAttr(r.P2_Rec)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td class="cell-p2">${r.Prom_P2 === '' ? '-' : r.Prom_P2}</td>
                    <td class="cell-pf">${r.Prom_Final === '' ? '-' : r.Prom_Final}</td>
                    <td class="cell-cond"><span class="badge badge-info">${escapeHtml(r.Condicion)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById('btn-save-all-grades').addEventListener('click', async () => {
        const items = [];
        container.querySelectorAll('tbody tr').forEach((tr, i) => {
          const item = { LP_Alumno: rows[i].LP_Alumno };
          tr.querySelectorAll('input.grade-input').forEach(inp => {
            item[inp.dataset.f] = inp.value.trim();
          });
          items.push(item);
        });

        try {
          const res = await apiPost('saveGradesBatch', { ID_Materia: idMateria, items });
          showToast(`Calificaciones guardadas (${res.count} registros).`, 'success');
          sel.dispatchEvent(new Event('change'));
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    } catch (err) {
      container.innerHTML = `<div class="card">Error: ${escapeHtml(err.message)}</div>`;
    }
  });
}

/* =========================================================================
 * UTILIDADES DE ESCAPE
 * ========================================================================= */

function escapeHtml(str) {
  return String(str === undefined || str === null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}