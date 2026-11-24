const API_URL = 'TU_URL_DE_APPS_SCRIPT_EXEC';
const SESSION_KEY = 'efsa_session_v1';

const state = {
  session: null,
  bootstrap: null,
  activeTab: null,
  activeReportSubtab: 'promocionales',
  selectedMissingGrade: 'P1_N1',
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
    subject: null,
    meta: null,
    grades: []
  }
};

let deferredInstallPrompt = null;

/* =========================================================================
 * INICIALIZACIÓN Y PWA (INSTALACIÓN EN ANDROID)
 * ========================================================================= */

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateInstallButtonsVisibility() {
  const loginBtn = document.getElementById('btn-install-pwa');
  const shellBtn = document.getElementById('btn-install-app-shell');
  const helpBtn = document.getElementById('btn-android-help');

  if (isStandaloneMode()) {
    if (loginBtn) loginBtn.classList.add('hidden');
    if (shellBtn) shellBtn.classList.add('hidden');
    if (helpBtn) helpBtn.classList.add('hidden');
    return;
  }

  if (deferredInstallPrompt) {
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (shellBtn) shellBtn.classList.remove('hidden');
  } else {
    if (loginBtn) loginBtn.classList.add('hidden');
    if (shellBtn) shellBtn.classList.add('hidden');
  }
}

async function triggerAndroidInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallButtonsVisibility();
    if (choice && choice.outcome === 'accepted') {
      showToast('Aplicación instalada en Android.', 'success');
    }
    return;
  }
  openAndroidInstallGuide();
}

function openAndroidInstallGuide() {
  openModal('Instalar en Android', `
    <div class="stack-md">
      <p class="item-meta">Para agregar la aplicación a la pantalla de inicio de tu teléfono Android desde <strong>Google Chrome</strong>:</p>
      <ol class="stack-sm" style="margin:0; padding-left:20px; font-size:14px;">
        <li>Abrí esta URL en <strong>Google Chrome</strong> (asegurate de estar en HTTPS).</li>
        <li>Tocá el menú de los tres puntos <strong>⋮</strong> arriba a la derecha.</li>
        <li>Elegí <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</li>
        <li>Confirmá tocando <strong>Instalar</strong>. Quedará con su ícono como una app independiente.</li>
      </ol>
      <button type="button" class="btn btn-primary" id="btn-close-android-guide">Entendido</button>
    </div>
  `);
  const closeBtn = document.getElementById('btn-close-android-guide');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  updateInstallButtonsVisibility();

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallButtonsVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButtonsVisibility();
    showToast('Aplicación instalada en el dispositivo.', 'success');
  });

  document.getElementById('btn-install-pwa').addEventListener('click', triggerAndroidInstall);
  document.getElementById('btn-install-app-shell').addEventListener('click', triggerAndroidInstall);
  document.getElementById('btn-android-help').addEventListener('click', openAndroidInstallGuide);

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
  updateInstallButtonsVisibility();
}

async function enterApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  updateInstallButtonsVisibility();

  const u = state.session;
  document.getElementById('topbar-user').textContent = `${u.Apellido}, ${u.Nombre} (LP ${u.LP}) · ${u.Rol.toUpperCase()}`;

  const boot = await apiPost('getBootstrap');
  state.bootstrap = boot;
  state.cache.config = boot.config || {};
  state.cache.classrooms = boot.classrooms || [];
  state.cache.subjects = boot.subjects || [];
  state.cache.assignments = boot.assignments || [];

  const isAdmin = u.Rol.toLowerCase() === 'admin';
  const isClosed = String(state.cache.config.Plataforma_Cerrada || 'NO').toUpperCase() === 'SI';
  const lockBanner = document.getElementById('lock-banner');
  if (isClosed && !isAdmin) {
    lockBanner.classList.remove('hidden');
  } else {
    lockBanner.classList.add('hidden');
  }

  document.getElementById('admin-nav').classList.add('hidden');
  document.getElementById('prof-nav').classList.add('hidden');

  switchTab(isAdmin ? 'home' : 'prof-notas');
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const titles = {
    home: 'Inicio · Panel de Administración',
    usuarios: '1. Usuarios y Credenciales',
    profesores: '2. Profesores y Aulas Asignadas',
    alumnos: '3. Alumnos y Cursada',
    asignaciones: '4. Asignaciones (Aula + Materia)',
    aulas: '5. Aulas',
    materias: '6. Materias',
    'prof-notas': 'Carga de Calificaciones',
    reportes: '7. Reportes Académicos',
    config: '8. Configuración, Exportación y Blanqueo'
  };
  document.getElementById('topbar-title').textContent = titles[tabName] || 'EFSA';

  renderCurrentTab();
}

function renderSectionHeader(sectionTitle) {
  if (!state.session || state.session.Rol.toLowerCase() !== 'admin') return '';
  return `
    <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
      <div class="card-title" style="margin:0; min-width:0;">${escapeHtml(sectionTitle)}</div>
      <button type="button" class="btn btn-secondary btn-sm" data-go-home="true" style="white-space:nowrap; flex-shrink:0;">← Volver al inicio</button>
    </div>
  `;
}

function bindBackToHomeButtons(container) {
  container.querySelectorAll('[data-go-home]').forEach(btn => {
    btn.addEventListener('click', () => switchTab('home'));
  });
}

async function renderCurrentTab() {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="card">Cargando...</div>';

  try {
    switch (state.activeTab) {
      case 'home': return renderAdminHomeTab(main);
      case 'usuarios': return await renderUsersTab(main);
      case 'profesores': return await renderProfessorsAdminTab(main);
      case 'alumnos': return await renderStudentsTab(main);
      case 'asignaciones': return await renderAssignmentsTab(main);
      case 'aulas': return await renderClassroomsTab(main);
      case 'materias': return await renderSubjectsTab(main);
      case 'prof-notas': return await renderGradesTab(main);
      case 'reportes': return await renderReportsTab(main);
      case 'config': return await renderConfigTab(main);
    }
  } catch (err) {
    main.innerHTML = `${renderSectionHeader('Error')}<div class="card">Error: ${escapeHtml(err.message)}</div>`;
    bindBackToHomeButtons(main);
    showToast(err.message, 'error');
  }
}

function renderAdminHomeTab(main) {
  const inst = state.cache.config.Nombre_Instituto || 'Escuela de Suboficiales';
  const ciclo = state.cache.config.Ciclo_Lectivo || new Date().getFullYear();

  const sections = [
    { tab: 'usuarios', title: '1. Usuarios', desc: 'Altas, bajas y credenciales de admin y profesores' },
    { tab: 'profesores', title: '2. Profesores', desc: 'Aulas y materias asignadas a cada docente' },
    { tab: 'alumnos', title: '3. Alumnos', desc: 'Aspirantes, carga masiva y detalle de calificaciones' },
    { tab: 'asignaciones', title: '4. Asignaciones', desc: 'Vincular profesor, aula y materia' },
    { tab: 'aulas', title: '5. Aulas', desc: 'Gestión de divisiones y especialidades' },
    { tab: 'materias', title: '6. Materias', desc: 'Asignaturas, régimen, promoción y especialidades' },
    { tab: 'prof-notas', title: 'Carga de Calificaciones', desc: 'Cargar notas por aula y materia y exportar planillas' },
    { tab: 'reportes', title: '7. Reportes', desc: 'Promocionales a final, mérito, dragoneantes y faltantes' },
    { tab: 'config', title: '8. Configuración', desc: 'Parámetros, exportar año a PDF y blanqueo anual' }
  ];

  main.innerHTML = `
    <div class="stack-md">
      <div class="card">
        <div class="card-title" style="margin:0">${escapeHtml(inst)}</div>
        <div class="item-meta">Ciclo Lectivo ${escapeHtml(ciclo)} · Elegí una sección para comenzar</div>
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
        ${sections.map(s => `
          <button type="button" class="card stack-sm" data-home-nav="${escapeAttr(s.tab)}" style="text-align:left; cursor:pointer; border:1px solid var(--border, rgba(148,163,184,0.25));">
            <div class="item-title">${escapeHtml(s.title)}</div>
            <div class="item-meta">${escapeHtml(s.desc)}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  main.querySelectorAll('[data-home-nav]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.homeNav));
  });
}

function sortByApellidoNombre(a, b) {
  const apeA = String(a.Apellido || '').trim().toLowerCase();
  const apeB = String(b.Apellido || '').trim().toLowerCase();
  if (apeA !== apeB) return apeA.localeCompare(apeB, 'es');
  const nomA = String(a.Nombre || '').trim().toLowerCase();
  const nomB = String(b.Nombre || '').trim().toLowerCase();
  return nomA.localeCompare(nomB, 'es');
}

/* =========================================================================
 * 1. USUARIOS
 * ========================================================================= */

async function renderUsersTab(main) {
  const users = (await apiPost('listUsers')).sort(sortByApellidoNombre);
  state.cache.users = users;

  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('1. Usuarios y Credenciales')}
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

  bindBackToHomeButtons(main);
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
 * 2. PROFESORES (VISTA ADMIN: AULAS Y MATERIAS ASIGNADAS)
 * ========================================================================= */

async function renderProfessorsAdminTab(main) {
  const [users, assignments, classrooms, subjects] = await Promise.all([
    apiPost('listUsers'),
    apiPost('listAssignments'),
    apiPost('listClassrooms'),
    apiPost('listSubjects')
  ]);

  const aulaMap = {};
  classrooms.forEach(c => { aulaMap[c.ID_Aula] = c; });
  const matMap = {};
  subjects.forEach(m => { matMap[m.ID_Materia] = m; });

  const profs = users
    .filter(u => String(u.Rol || '').toLowerCase() === 'profesor')
    .sort(sortByApellidoNombre);

  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('2. Profesores y Aulas Asignadas')}
      ${profs.map(p => {
        const myAsg = assignments.filter(a => a.LP_Profesor === p.LP);
        const aulasUnicas = [...new Set(myAsg.map(a => a.ID_Aula))].map(idAula => {
          const c = aulaMap[idAula];
          const materiasDelAula = myAsg
            .filter(a => a.ID_Aula === idAula)
            .map(a => (matMap[a.ID_Materia] ? matMap[a.ID_Materia].Nombre_Materia : a.ID_Materia));
          return {
            idAula,
            nombreAula: c ? c.Nombre_Aula : idAula,
            especialidad: c ? c.Especialidad : '',
            materias: materiasDelAula
          };
        });

        return `
          <div class="card stack-sm">
            <div class="row-gap" style="justify-content:space-between">
              <div>
                <div class="item-title">${escapeHtml(p.Apellido)}, ${escapeHtml(p.Nombre)} · LP ${escapeHtml(p.LP)}</div>
                <div class="item-meta">Usuario: ${escapeHtml(p.Usuario)} · ${aulasUnicas.length} aula(s) asignada(s)</div>
              </div>
              <span class="badge ${p.Activo === 'SI' ? 'badge-ok' : 'badge-bad'}">${p.Activo === 'SI' ? 'Activo' : 'Inactivo'}</span>
            </div>
            ${aulasUnicas.length > 0 ? `
              <div class="stack-sm" style="margin-top:8px;">
                ${aulasUnicas.map(au => `
                  <div class="list-item" style="background: var(--bg);">
                    <div class="item-main">
                      <div class="item-title">Aula ${escapeHtml(au.nombreAula)} ${au.especialidad ? `(${escapeHtml(au.especialidad)})` : ''}</div>
                      <div class="item-meta">Materias: ${escapeHtml(au.materias.join(', '))}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : '<div class="item-meta">Sin aulas asignadas actualmente.</div>'}
          </div>
        `;
      }).join('') || '<div class="card">No hay profesores registrados.</div>'}
    </div>
  `;

  bindBackToHomeButtons(main);
}

/* =========================================================================
 * 3. ALUMNOS (ORDEN ALFABÉTICO + TODAS LAS NOTAS EN EL DETALLE)
 * ========================================================================= */

async function renderStudentsTab(main) {
  const [studentsRaw, classrooms] = await Promise.all([
    apiPost('listStudents'),
    apiPost('listClassrooms')
  ]);
  const students = studentsRaw.slice().sort(sortByApellidoNombre);
  state.cache.students = students;
  state.cache.classrooms = classrooms;

  const aulaMap = {};
  classrooms.forEach(c => { aulaMap[c.ID_Aula] = c.Nombre_Aula; });

  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('3. Alumnos y Cursada')}
      <div class="row-gap">
        <button type="button" class="btn btn-primary" id="btn-new-student">+ Nuevo Aspirante</button>
        <button type="button" class="btn btn-secondary" id="btn-bulk-student">Carga Masiva</button>
        <div class="field">
          <input id="filter-student-aula" type="text" placeholder="Filtrar por aula, LP o apellido..." />
        </div>
      </div>

      <div id="students-list" class="stack-sm"></div>
    </div>
  `;

  bindBackToHomeButtons(main);

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
    }).sort(sortByApellidoNombre);

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
  openModal('Detalle de Calificaciones del Aspirante', '<div class="card">Consultando todas las notas...</div>');
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

    const fmt = v => (v === '' || v === null || v === undefined ? '-' : v);

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
                <th>P1 N1</th>
                <th>P1 N2</th>
                <th>P1 Rec</th>
                <th>Prom P1</th>
                <th>P2 N1</th>
                <th>P2 N2</th>
                <th>P2 Rec</th>
                <th>Prom P2</th>
                <th>Prom Gral</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${info.subjects.map(sub => `
                <tr>
                  <td><strong>${escapeHtml(sub.Nombre_Materia)}</strong></td>
                  <td>${fmt(sub.P1_N1)}</td>
                  <td>${fmt(sub.P1_N2)}</td>
                  <td>${fmt(sub.P1_Rec)}</td>
                  <td><strong>${fmt(sub.Prom_P1)}</strong></td>
                  <td>${fmt(sub.P2_N1)}</td>
                  <td>${fmt(sub.P2_N2)}</td>
                  <td>${fmt(sub.P2_Rec)}</td>
                  <td><strong>${fmt(sub.Prom_P2)}</strong></td>
                  <td><strong>${fmt(sub.Prom_Final)}</strong></td>
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
 * 4. ASIGNACIONES
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

  const profs = users.filter(u => u.Rol.toLowerCase() === 'profesor').sort(sortByApellidoNombre);
  const profMap = {};
  users.forEach(u => { profMap[u.LP] = `${u.Apellido}, ${u.Nombre}`; });
  const aulaMap = {};
  classrooms.forEach(c => { aulaMap[c.ID_Aula] = c.Nombre_Aula; });
  const matMap = {};
  subjects.forEach(m => { matMap[m.ID_Materia] = m.Nombre_Materia; });

  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('4. Asignaciones (Aula + Materia)')}
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

  bindBackToHomeButtons(main);

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
 * 5. AULAS (ID AUTOGENERADO, SIN CAMPO MANUAL)
 * ========================================================================= */

async function renderClassroomsTab(main) {
  const classrooms = await apiPost('listClassrooms');
  state.cache.classrooms = classrooms;

  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('5. Aulas')}
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

  bindBackToHomeButtons(main);
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
 * 6. MATERIAS (ID AUTOGENERADO, SIN CAMPO MANUAL)
 * ========================================================================= */

async function renderSubjectsTab(main) {
  const subjects = await apiPost('listSubjects');
  state.cache.subjects = subjects;

  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('6. Materias')}
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

  bindBackToHomeButtons(main);
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
 * CARGA DE CALIFICACIONES (ADMIN Y PROFESOR · PROMEDIOS EN VIVO + EXPORTACIÓN)
 * ========================================================================= */

function round3Client(num) {
  return Math.round(Number(num) * 1000) / 1000;
}

function parseGradeClient(val) {
  if (val === '' || val === null || val === undefined) return null;
  const s = String(val).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (isNaN(n) || n < 1 || n > 10) return null;
  return round3Client(n);
}

function computeLiveRow(raw, subject, cfg) {
  const minProm = Number(cfg.Nota_Minima_Aprobacion || 6);
  const minParcial = Number(cfg.Parcial_Minimo_Promocion || 4);
  const esPromocional = String(subject ? subject.Promocional : 'SI').toUpperCase() === 'SI';

  const p1n1 = parseGradeClient(raw.P1_N1);
  const p1n2 = parseGradeClient(raw.P1_N2);
  const p1rec = parseGradeClient(raw.P1_Rec);

  const p2n1 = parseGradeClient(raw.P2_N1);
  const p2n2 = parseGradeClient(raw.P2_N2);
  const p2rec = parseGradeClient(raw.P2_Rec);

  let promP1 = '';
  const p1Vals = [p1n1, p1n2].filter(v => v !== null);
  if (p1rec !== null && p1Vals.length > 0) {
    const minIdx = p1n1 !== null && p1n2 !== null ? (p1n1 <= p1n2 ? 0 : 1) : 0;
    const base = p1Vals.slice();
    if (p1rec > base[minIdx]) base[minIdx] = p1rec;
    promP1 = round3Client(base.reduce((a, b) => a + b, 0) / base.length);
  } else if (p1rec !== null) {
    promP1 = round3Client(p1rec);
  } else if (p1Vals.length > 0) {
    promP1 = round3Client(p1Vals.reduce((a, b) => a + b, 0) / p1Vals.length);
  }

  let promP2 = '';
  const p2Vals = [p2n1, p2n2].filter(v => v !== null);
  if (p2rec !== null && p2Vals.length > 0) {
    const minIdx = p2n1 !== null && p2n2 !== null ? (p2n1 <= p2n2 ? 0 : 1) : 0;
    const base = p2Vals.slice();
    if (p2rec > base[minIdx]) base[minIdx] = p2rec;
    promP2 = round3Client(base.reduce((a, b) => a + b, 0) / base.length);
  } else if (p2rec !== null) {
    promP2 = round3Client(p2rec);
  } else if (p2Vals.length > 0) {
    promP2 = round3Client(p2Vals.reduce((a, b) => a + b, 0) / p2Vals.length);
  }

  let promFinal = '';
  if (promP1 !== '' && promP2 !== '') {
    promFinal = round3Client((Number(promP1) + Number(promP2)) / 2);
  } else if (promP1 !== '') {
    promFinal = round3Client(promP1);
  } else if (promP2 !== '') {
    promFinal = round3Client(promP2);
  }

  let condicion = 'Cursando';
  if (!esPromocional) {
    condicion = 'Final Obligatorio';
  } else if (promP1 !== '' && promP2 !== '') {
    if (Number(promP1) < minParcial || Number(promP2) < minParcial || Number(promFinal) < minProm) {
      condicion = 'Va a Final';
    } else {
      condicion = 'Promocionado';
    }
  }

  return { promP1, promP2, promFinal, condicion };
}

function collectCurrentGradesTableData(container, fallbackRows, subjectObj, cfg) {
  const headers = ['LP', 'Apellido y Nombre', 'P1 N1', 'P1 N2', 'P1 Rec', 'Prom P1', 'P2 N1', 'P2 N2', 'P2 Rec', 'Prom P2', 'Prom Gral', 'Condición'];
  const exportRows = [];

  container.querySelectorAll('tbody tr').forEach((tr, idx) => {
    const baseRow = fallbackRows[idx] || {};
    const raw = {};
    tr.querySelectorAll('input.grade-input').forEach(inp => {
      raw[inp.dataset.f] = inp.value.trim();
    });
    const live = computeLiveRow(raw, subjectObj, cfg);
    const fmt = v => (v === '' || v === null || v === undefined ? '-' : v);

    exportRows.push([
      baseRow.LP_Alumno || '',
      `${baseRow.Apellido || ''}, ${baseRow.Nombre || ''}`,
      fmt(raw.P1_N1),
      fmt(raw.P1_N2),
      fmt(raw.P1_Rec),
      fmt(live.promP1),
      fmt(raw.P2_N1),
      fmt(raw.P2_N2),
      fmt(raw.P2_Rec),
      fmt(live.promP2),
      fmt(live.promFinal),
      live.condicion
    ]);
  });

  return { headers, exportRows };
}

async function renderGradesTab(main) {
  const isAdmin = state.session.Rol.toLowerCase() === 'admin';
  const isLocked = String(state.cache.config.Plataforma_Cerrada || 'NO').toUpperCase() === 'SI' && !isAdmin;

  let optionsHtml = '';
  if (isAdmin) {
    const [classrooms, subjects] = await Promise.all([
      apiPost('listClassrooms'),
      apiPost('listSubjects')
    ]);
    state.cache.classrooms = classrooms;
    state.cache.subjects = subjects;

    const pairs = [];
    classrooms.forEach(c => {
      if (String(c.Activa || 'SI').toUpperCase() !== 'SI') return;
      subjects.forEach(m => {
        if (String(m.Activa || 'SI').toUpperCase() !== 'SI') return;
        pairs.push({
          idAula: c.ID_Aula,
          idMateria: m.ID_Materia,
          label: `Aula ${c.Nombre_Aula} (${c.Especialidad}) — ${m.Nombre_Materia}`
        });
      });
    });

    optionsHtml = pairs.map(p => `
      <option value="${escapeAttr(p.idAula)}::${escapeAttr(p.idMateria)}">${escapeHtml(p.label)}</option>
    `).join('');
  } else {
    const assignments = state.cache.assignments || [];
    const classrooms = state.cache.classrooms || [];
    const subjects = state.cache.subjects || [];
    const aulaMap = {};
    classrooms.forEach(c => { aulaMap[c.ID_Aula] = c.Nombre_Aula; });
    const matMap = {};
    subjects.forEach(m => { matMap[m.ID_Materia] = m.Nombre_Materia; });

    optionsHtml = assignments.map(a => `
      <option value="${escapeAttr(a.ID_Aula)}::${escapeAttr(a.ID_Materia)}">
        Aula ${escapeHtml(aulaMap[a.ID_Aula] || a.ID_Aula)} — ${escapeHtml(matMap[a.ID_Materia] || a.ID_Materia)}
      </option>
    `).join('');
  }

  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('Carga de Calificaciones')}
      <div class="card stack-md">
        <div class="card-title">${isAdmin ? 'Seleccionar Aula y Materia (Acceso Admin)' : 'Seleccionar Curso Asignado'}</div>
        <div class="field">
          <label>Aula + Materia</label>
          <select id="prof-assignment-select">
            <option value="">Elegir...</option>
            ${optionsHtml}
          </select>
        </div>
      </div>
      <div id="prof-grades-sheet"></div>
    </div>
  `;

  bindBackToHomeButtons(main);

  const sel = document.getElementById('prof-assignment-select');
  sel.addEventListener('change', async () => {
    const val = sel.value;
    const container = document.getElementById('prof-grades-sheet');
    if (!val) {
      container.innerHTML = '';
      return;
    }
    const [idAula, idMateria] = val.split('::');
    const subjectObj = (state.cache.subjects || []).find(m => m.ID_Materia === idMateria) || { Promocional: 'SI' };
    container.innerHTML = '<div class="card">Cargando planilla de alumnos...</div>';

    try {
      const resp = await apiPost('getGradesForAssignment', { ID_Aula: idAula, ID_Materia: idMateria });
      const rows = (resp.rows || [])
        .sort((a, b) => sortByApellidoNombre({ Apellido: a.Apellido, Nombre: a.Nombre }, { Apellido: b.Apellido, Nombre: b.Nombre }));
      const meta = resp.meta || {};
      state.profSelection = { idAula, idMateria, subject: subjectObj, meta, grades: rows };

      container.innerHTML = `
        <div class="card stack-md">
          <div class="row-gap" style="justify-content:space-between">
            <div>
              <div class="card-title" style="margin:0">Planilla (${rows.length} alumnos)</div>
              <div class="item-meta">Escuela: <strong>${escapeHtml(meta.instituto || '')}</strong> · Aula: <strong>${escapeHtml(meta.Nombre_Aula || idAula)}</strong> · Materia: <strong>${escapeHtml(meta.Nombre_Materia || idMateria)}</strong> · Profesor: <strong>${escapeHtml(meta.Profesor || '')}</strong></div>
            </div>
            <div class="row-gap">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-export-course-excel">Exportar Excel</button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-export-course-pdf">Exportar PDF</button>
              <button type="button" class="btn btn-success btn-sm" id="btn-save-all-grades" ${isLocked ? 'disabled' : ''}>
                Guardar Todo
              </button>
            </div>
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
                    <td class="cell-p1"><strong>${r.Prom_P1 === '' ? '-' : r.Prom_P1}</strong></td>
                    <td><input class="grade-input" data-f="P2_N1" value="${escapeAttr(r.P2_N1)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td><input class="grade-input" data-f="P2_N2" value="${escapeAttr(r.P2_N2)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td><input class="grade-input" data-f="P2_Rec" value="${escapeAttr(r.P2_Rec)}" ${isLocked ? 'disabled' : ''} /></td>
                    <td class="cell-p2"><strong>${r.Prom_P2 === '' ? '-' : r.Prom_P2}</strong></td>
                    <td class="cell-pf"><strong>${r.Prom_Final === '' ? '-' : r.Prom_Final}</strong></td>
                    <td class="cell-cond"><span class="badge badge-info">${escapeHtml(r.Condicion)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const recalcRow = tr => {
        const raw = {};
        tr.querySelectorAll('input.grade-input').forEach(inp => {
          raw[inp.dataset.f] = inp.value;
        });
        const live = computeLiveRow(raw, subjectObj, state.cache.config || {});
        tr.querySelector('.cell-p1').innerHTML = `<strong>${live.promP1 === '' ? '-' : live.promP1}</strong>`;
        tr.querySelector('.cell-p2').innerHTML = `<strong>${live.promP2 === '' ? '-' : live.promP2}</strong>`;
        tr.querySelector('.cell-pf').innerHTML = `<strong>${live.promFinal === '' ? '-' : live.promFinal}</strong>`;
        tr.querySelector('.cell-cond').innerHTML = `<span class="badge badge-info">${escapeHtml(live.condicion)}</span>`;
      };

      container.querySelectorAll('tbody tr').forEach(tr => {
        recalcRow(tr);
        tr.querySelectorAll('input.grade-input').forEach(inp => {
          inp.addEventListener('input', () => recalcRow(tr));
        });
      });

      const headerLines = [
        `Escuela: ${meta.instituto || state.cache.config.Nombre_Instituto || 'Escuela de Suboficiales'} · Ciclo Lectivo ${meta.cicloLectivo || ''}`,
        `Aula: ${meta.Nombre_Aula || idAula}${meta.Especialidad ? ` (${meta.Especialidad})` : ''} · Materia: ${meta.Nombre_Materia || idMateria} · Profesor: ${meta.Profesor || ''}`
      ];
      const safeFile = `Calificaciones_${(meta.Nombre_Aula || idAula)}_${(meta.Nombre_Materia || idMateria)}`.replace(/[^a-zA-Z0-9_-]+/g, '_');

      document.getElementById('btn-export-course-excel').addEventListener('click', () => {
        const { headers, exportRows } = collectCurrentGradesTableData(container, rows, subjectObj, state.cache.config || {});
        exportTableToExcel(safeFile, headerLines, headers, exportRows);
      });

      document.getElementById('btn-export-course-pdf').addEventListener('click', () => {
        const { headers, exportRows } = collectCurrentGradesTableData(container, rows, subjectObj, state.cache.config || {});
        exportTableToPdf(`Calificaciones · ${meta.Nombre_Materia || idMateria}`, headerLines, headers, exportRows);
      });

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
 * 7. REPORTES (SUBPESTAÑAS + EXPORTACIÓN EXCEL Y PDF CON NOMBRE DE ESCUELA)
 * ========================================================================= */

async function renderReportsTab(main) {
  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('7. Reportes Académicos')}
      <div class="subtabs" id="report-subtabs">
        <button type="button" class="subtab-btn ${state.activeReportSubtab === 'promocionales' ? 'active' : ''}" data-rsub="promocionales">Promocionales a Final</button>
        <button type="button" class="subtab-btn ${state.activeReportSubtab === 'merito' ? 'active' : ''}" data-rsub="merito">Orden de Mérito</button>
        <button type="button" class="subtab-btn ${state.activeReportSubtab === 'dragoneantes' ? 'active' : ''}" data-rsub="dragoneantes">Dragoneantes</button>
        <button type="button" class="subtab-btn ${state.activeReportSubtab === 'faltantes' ? 'active' : ''}" data-rsub="faltantes">Notas Faltantes</button>
      </div>
      <div id="report-output" class="stack-md"><div class="card">Calculando reporte...</div></div>
    </div>
  `;

  bindBackToHomeButtons(main);

  const data = await apiPost('getReports', {});
  state.cache.reports = data;

  const paintSubtab = () => {
    document.querySelectorAll('#report-subtabs .subtab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.rsub === state.activeReportSubtab);
    });
    const out = document.getElementById('report-output');
    let headers = [];
    let rows = [];
    let fileBaseName = `Reporte_${state.activeReportSubtab}`;
    let reportTitle = '';

    if (state.activeReportSubtab === 'promocionales') {
      const list = data.promocionalesAFinal || [];
      reportTitle = 'Promocionales a Final';
      headers = ['LP', 'Apellido', 'Nombre', 'Aula', 'Especialidad', 'Materia', 'Prom P1', 'Prom P2', 'Motivo'];
      rows = list.map(r => [r.LP, r.Apellido, r.Nombre, r.Nombre_Aula, r.Especialidad, r.Nombre_Materia, r.Prom_P1 || '-', r.Prom_P2 || '-', r.Motivo]);
      out.innerHTML = renderExportCard(reportTitle, headers, rows) + renderSimpleTable(headers, rows, 'No hay aspirantes en materias promocionales a final.');
    }

    if (state.activeReportSubtab === 'merito') {
      const list = data.ordenMerito || [];
      reportTitle = 'Orden de Mérito';
      headers = ['Puesto', 'LP', 'Apellido', 'Nombre', 'Aula', 'Especialidad', 'Promedio General', 'Materias'];
      rows = list.map(r => [r.Puesto, r.LP, r.Apellido, r.Nombre, r.Nombre_Aula, r.Especialidad, r.Promedio_General, r.Materias_Evaluadas]);
      out.innerHTML = renderExportCard(reportTitle, headers, rows) + renderSimpleTable(headers, rows, 'Sin datos de promedio general para ordenar.');
    }

    if (state.activeReportSubtab === 'dragoneantes') {
      const list = data.dragoneantes || [];
      reportTitle = 'Dragoneantes (1er Período)';
      headers = ['Puesto', 'LP', 'Apellido', 'Nombre', 'Aula', 'Especialidad', 'Promedio 1er Período', 'Materias P1'];
      rows = list.map(r => [r.Puesto, r.LP, r.Apellido, r.Nombre, r.Nombre_Aula, r.Especialidad, r.Promedio_P1, r.Materias_P1]);
      out.innerHTML = renderExportCard(reportTitle, headers, rows) + renderSimpleTable(headers, rows, 'Sin datos del 1er período para ordenar.');
    }

    if (state.activeReportSubtab === 'faltantes') {
      const mapLabels = {
        P1_N1: '1ª Nota del 1er Período',
        P1_N2: '2ª Nota del 1er Período',
        P2_N1: '1ª Nota del 2do Período',
        P2_N2: '2ª Nota del 2do Período'
      };
      const selectedField = state.selectedMissingGrade || 'P1_N1';
      const list = (data.faltantesPorNota && data.faltantesPorNota[selectedField]) || [];
      fileBaseName = `Faltantes_${selectedField}`;
      reportTitle = `Notas Faltantes - ${mapLabels[selectedField]}`;
      headers = ['LP', 'Apellido', 'Nombre', 'Aula', 'Especialidad', 'Materia', 'Nota Faltante'];
      rows = list.map(r => [r.LP, r.Apellido, r.Nombre, r.Nombre_Aula, r.Especialidad, r.Nombre_Materia, mapLabels[selectedField]]);

      out.innerHTML = `
        <div class="card stack-md">
          <div class="field">
            <label>Elegir nota a controlar</label>
            <select id="select-missing-grade">
              <option value="P1_N1" ${selectedField === 'P1_N1' ? 'selected' : ''}>1ª Nota del 1er Período</option>
              <option value="P1_N2" ${selectedField === 'P1_N2' ? 'selected' : ''}>2ª Nota del 1er Período</option>
              <option value="P2_N1" ${selectedField === 'P2_N1' ? 'selected' : ''}>1ª Nota del 2do Período</option>
              <option value="P2_N2" ${selectedField === 'P2_N2' ? 'selected' : ''}>2ª Nota del 2do Período</option>
            </select>
          </div>
          <div class="row-gap">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-exp-excel">Exportar Excel</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-exp-pdf">Exportar PDF</button>
          </div>
        </div>
        ${renderSimpleTable(headers, rows, 'A ningún aspirante le falta esta nota.')}
      `;

      document.getElementById('select-missing-grade').addEventListener('change', e => {
        state.selectedMissingGrade = e.target.value;
        paintSubtab();
      });
      bindExportButtons(fileBaseName, reportTitle, headers, rows);
      return;
    }

    bindExportButtons(fileBaseName, reportTitle, headers, rows);
  };

  document.querySelectorAll('#report-subtabs .subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeReportSubtab = btn.dataset.rsub;
      paintSubtab();
    });
  });

  paintSubtab();
}

function renderExportCard(title, headers, rows) {
  return `
    <div class="card">
      <div class="row-gap" style="justify-content:space-between">
        <div class="card-title" style="margin:0">${escapeHtml(title)} (${rows.length})</div>
        <div class="row-gap">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-exp-excel">Exportar Excel</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-exp-pdf">Exportar PDF</button>
        </div>
      </div>
    </div>
  `;
}

function renderSimpleTable(headers, rows, emptyMsg) {
  return `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>
            `).join('') || `<tr><td colspan="${headers.length}">${escapeHtml(emptyMsg)}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getSchoolHeaderLines() {
  const inst = state.cache.config.Nombre_Instituto || 'Escuela de Suboficiales';
  const ciclo = state.cache.config.Ciclo_Lectivo || '';
  return [ciclo ? `${inst} · Ciclo Lectivo ${ciclo}` : inst];
}

function exportTableToExcel(fileBaseName, headerLines, headers, rows) {
  const metaRowsHtml = (headerLines || [])
    .map(line => `<tr><td colspan="${Math.max(1, headers.length)}"><strong>${escapeHtml(line)}</strong></td></tr>`)
    .join('');

  const tableHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8" /></head>
    <body>
      <table border="1">
        <thead>
          ${metaRowsHtml}
          <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </body>
    </html>
  `;
  const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBaseName}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTableToPdf(reportTitle, headerLines, headers, rows) {
  const win = window.open('', '_blank');
  if (!win) {
    showToast('Permití las ventanas emergentes para exportar a PDF.', 'error');
    return;
  }
  const metaHtml = (headerLines || [])
    .map(line => `<div class="meta-line">${escapeHtml(line)}</div>`)
    .join('');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(reportTitle)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
        .doc-header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
        .meta-line { font-size: 12px; color: #334155; margin-bottom: 3px; }
        h2 { margin: 4px 0 0 0; font-size: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
        th { background: #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="doc-header">
        ${metaHtml}
        <h2>${escapeHtml(reportTitle)}</h2>
      </div>
      <table>
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <script>window.onload = function() { window.print(); };<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

function bindExportButtons(fileBaseName, reportTitle, headers, rows) {
  const headerLines = getSchoolHeaderLines();
  const excelBtn = document.getElementById('btn-exp-excel');
  if (excelBtn) {
    excelBtn.addEventListener('click', () => exportTableToExcel(fileBaseName, headerLines, headers, rows));
  }

  const pdfBtn = document.getElementById('btn-exp-pdf');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => exportTableToPdf(reportTitle, headerLines, headers, rows));
  }
}

/* =========================================================================
 * 8. CONFIGURACIÓN, EXPORTAR AÑO Y BLANQUEO ANUAL
 * ========================================================================= */

async function renderConfigTab(main) {
  const cfg = await apiPost('getConfig');
  state.cache.config = cfg;

  main.innerHTML = `
    <div class="stack-md">
      ${renderSectionHeader('8. Configuración, Exportación y Blanqueo')}
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

      <div class="card stack-md" style="border-color: var(--primary-hover)">
        <div class="card-title">Exportar Año (Acta Completa en PDF)</div>
        <p class="item-meta">Genera un PDF con una hoja por cada <strong>Aula + Materia</strong>, incluyendo encabezado con escuela, aula, materia y profesor, y todos los alumnos con sus calificaciones (completando con <strong>Baja</strong> las notas faltantes de alumnos dados de baja).</p>
        <div class="field">
          <label>Escribí <strong>EXPORTAR</strong> para confirmar</label>
          <input id="export-year-confirm" type="text" placeholder="EXPORTAR" />
        </div>
        <button type="button" class="btn btn-primary" id="btn-export-year">Exportar Año a PDF</button>
        <div id="export-year-progress" class="stack-sm hidden" style="margin-top:6px;">
          <div style="display:flex; justify-content:space-between; font-size:13px;">
            <span id="export-year-status">Preparando exportación...</span>
            <strong id="export-year-pct">0%</strong>
          </div>
          <div style="width:100%; height:10px; background:rgba(148,163,184,0.25); border-radius:999px; overflow:hidden;">
            <div id="export-year-bar" style="width:0%; height:100%; background:var(--primary, #2563eb); transition:width 0.25s ease;"></div>
          </div>
        </div>
      </div>

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

  bindBackToHomeButtons(main);

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

  document.getElementById('btn-export-year').addEventListener('click', async () => {
    const confirmText = document.getElementById('export-year-confirm').value.trim();
    const btn = document.getElementById('btn-export-year');
    const progWrap = document.getElementById('export-year-progress');
    const progBar = document.getElementById('export-year-bar');
    const progPct = document.getElementById('export-year-pct');
    const progStatus = document.getElementById('export-year-status');

    const setProgress = (pct, msg) => {
      const safePct = Math.max(0, Math.min(100, Math.round(pct)));
      progBar.style.width = safePct + '%';
      progPct.textContent = safePct + '%';
      if (msg) progStatus.textContent = msg;
    };

    btn.disabled = true;
    progWrap.classList.remove('hidden');
    setProgress(10, 'Validando confirmación y conectando...');

    const startTime = Date.now();
    let currentPct = 10;
    const ticker = setInterval(() => {
      if (currentPct < 45) {
        currentPct += 3;
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        setProgress(currentPct, `Consultando planilla en servidor... (${elapsedSec}s)`);
      }
    }, 500);

    try {
      const yearData = await apiPost('getYearExportData', { confirmText });
      clearInterval(ticker);
      setProgress(55, 'Datos recibidos. Generando actas por aula y materia...');
      await openYearExportPdf(yearData, (p, m) => setProgress(p, m));
      const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
      setProgress(100, `Listo en ${totalSec}s. Se abrió la vista de impresión/PDF.`);
      document.getElementById('export-year-confirm').value = '';
      showToast(`Exportación anual lista (${totalSec}s).`, 'success');
    } catch (err) {
      clearInterval(ticker);
      setProgress(0, 'Error en la exportación.');
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
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

async function openYearExportPdf(yearData, onProgress = null) {
  const actas = yearData.actas || [];
  if (actas.length === 0) {
    throw new Error('No hay actas de aulas y materias para exportar.');
  }

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Permití las ventanas emergentes para exportar el PDF anual.');
  }

  const fmtCell = val => (val === '' || val === null || val === undefined ? '-' : val);
  const pages = [];

  for (let idx = 0; idx < actas.length; idx++) {
    const acta = actas[idx];
    const pageBreakStyle = idx < actas.length - 1 ? 'page-break-after: always;' : '';
    pages.push(`
      <div class="acta-page" style="${pageBreakStyle}">
        <div class="acta-header">
          <div class="instituto">${escapeHtml(acta.instituto)} · Ciclo Lectivo ${escapeHtml(acta.cicloLectivo)}</div>
          <div class="meta-grid">
            <div><strong>Aula:</strong> ${escapeHtml(acta.Nombre_Aula)} (${escapeHtml(acta.Especialidad)})</div>
            <div><strong>Materia:</strong> ${escapeHtml(acta.Nombre_Materia)}</div>
            <div><strong>Profesor:</strong> ${escapeHtml(acta.Profesor)}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>LP</th>
              <th>Apellido y Nombre</th>
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
            ${acta.alumnos.map(al => `
              <tr>
                <td>${escapeHtml(al.LP)}</td>
                <td>${escapeHtml(al.Apellido_Nombre)}</td>
                <td>${escapeHtml(fmtCell(al.P1_N1))}</td>
                <td>${escapeHtml(fmtCell(al.P1_N2))}</td>
                <td>${escapeHtml(fmtCell(al.P1_Rec))}</td>
                <td><strong>${escapeHtml(fmtCell(al.Prom_P1))}</strong></td>
                <td>${escapeHtml(fmtCell(al.P2_N1))}</td>
                <td>${escapeHtml(fmtCell(al.P2_N2))}</td>
                <td>${escapeHtml(fmtCell(al.P2_Rec))}</td>
                <td><strong>${escapeHtml(fmtCell(al.Prom_P2))}</strong></td>
                <td><strong>${escapeHtml(fmtCell(al.Prom_Final))}</strong></td>
                <td>${escapeHtml(fmtCell(al.Condicion))}</td>
              </tr>
            `).join('') || '<tr><td colspan="12">Sin alumnos registrados en esta aula.</td></tr>'}
          </tbody>
        </table>
      </div>
    `);

    if (onProgress && (idx % 3 === 0 || idx === actas.length - 1)) {
      const pct = 55 + Math.round(((idx + 1) / actas.length) * 35);
      onProgress(pct, `Armando acta ${idx + 1} de ${actas.length}...`);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (onProgress) onProgress(95, 'Abriendo ventana de impresión/PDF...');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Acta Anual · ${escapeHtml(yearData.instituto)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 14px; color: #0f172a; }
        .acta-header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
        .instituto { font-size: 15px; font-weight: bold; margin-bottom: 6px; }
        .meta-grid { display: flex; flex-wrap: wrap; gap: 18px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: left; }
        th { background: #e2e8f0; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      ${pages.join('')}
      <script>window.onload = function() { window.print(); };<\/script>
    </body>
    </html>
  `);
  win.document.close();
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