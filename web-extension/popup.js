// Safari Window Manager — Popup
// Thin view layer: fetch state from background, render, send messages back.

async function send(message) {
  return browser.runtime.sendMessage(message);
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentWindowId = null;
let selectedColor = '';

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const state = await send({ action: 'GET_STATE' });
  render(state);
  bindStaticControls();
});

// ── Render ────────────────────────────────────────────────────────────────────

function render(state) {
  currentWindowId = state.currentWindowId;
  const { groups, membership } = state;

  const list = document.getElementById('groups-list');
  const emptyState = document.getElementById('empty-state');

  list.innerHTML = '';

  if (groups.length === 0) {
    emptyState.hidden = false;
    document.getElementById('minimize-all-btn').disabled = true;
    return;
  }

  emptyState.hidden = true;
  document.getElementById('minimize-all-btn').disabled = false;

  for (const group of groups) {
    const memberIds = membership[group.id] ?? [];
    const isMember = memberIds.includes(currentWindowId);
    const windowCount = memberIds.length;
    list.appendChild(buildGroupItem(group, isMember, windowCount));
  }
}

function buildGroupItem(group, isMember, windowCount) {
  const li = document.createElement('li');
  li.className = 'group-item';
  li.dataset.groupId = group.id;

  // ── Header row ────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'group-header';

  const toggle = document.createElement('button');
  toggle.className = 'member-toggle' + (isMember ? ' is-member' : '');
  toggle.title = isMember ? 'Remove this window from group' : 'Add this window to group';
  toggle.setAttribute('aria-pressed', String(isMember));
  toggle.addEventListener('click', () => toggleMembership(group.id));

  header.appendChild(toggle);

  if (group.color) {
    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.style.background = group.color;
    header.appendChild(dot);
  }

  const nameBtn = document.createElement('button');
  nameBtn.className = 'group-name-btn';
  nameBtn.textContent = group.name;
  nameBtn.title = 'Double-click to rename';
  nameBtn.addEventListener('dblclick', () => startRename(group, li));
  header.appendChild(nameBtn);

  const countSpan = document.createElement('span');
  countSpan.className = 'window-count';
  countSpan.textContent = windowCount === 1 ? '1 window' : `${windowCount} windows`;
  header.appendChild(countSpan);

  li.appendChild(header);

  // ── Action buttons ────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'group-actions';

  const noWindows = windowCount === 0;

  const minBtn = makeBtn('Minimize', () => minimizeGroup(group.id), noWindows);
  const restoreBtn = makeBtn('Restore', () => restoreGroup(group.id), noWindows);
  const focusBtn = makeBtn('Focus This Group', () => focusGroup(group.id), noWindows);
  focusBtn.className += ' btn-focus';

  const deleteBtn = makeBtn('Delete', () => deleteGroup(group.id), false);
  deleteBtn.className += ' btn-delete';

  actions.append(minBtn, restoreBtn, focusBtn, deleteBtn);
  li.appendChild(actions);

  return li;
}

function makeBtn(label, onClick, disabled) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

// ── Rename ────────────────────────────────────────────────────────────────────

function startRename(group, li) {
  const nameBtn = li.querySelector('.group-name-btn');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = group.name;
  input.maxLength = 50;

  nameBtn.replaceWith(input);
  input.focus();
  input.select();

  async function commit() {
    const newName = input.value.trim();
    if (newName && newName !== group.name) {
      const state = await send({ action: 'RENAME_GROUP', groupId: group.id, name: newName });
      render(state);
    } else {
      const state = await send({ action: 'GET_STATE' });
      render(state);
    }
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.removeEventListener('blur', commit); input.blur(); send({ action: 'GET_STATE' }).then(render); }
  });
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function toggleMembership(groupId) {
  const state = await send({ action: 'TOGGLE_WINDOW_IN_GROUP', groupId });
  render(state);
}

async function minimizeGroup(groupId) {
  await send({ action: 'MINIMIZE_GROUP', groupId });
}

async function restoreGroup(groupId) {
  await send({ action: 'RESTORE_GROUP', groupId });
}

async function focusGroup(groupId) {
  await send({ action: 'FOCUS_GROUP', groupId });
}

async function deleteGroup(groupId) {
  const state = await send({ action: 'DELETE_GROUP', groupId });
  render(state);
}

// ── New group form ────────────────────────────────────────────────────────────

function bindStaticControls() {
  document.getElementById('new-group-btn').addEventListener('click', showNewGroupForm);
  document.getElementById('cancel-new-group-btn').addEventListener('click', hideNewGroupForm);
  document.getElementById('create-group-btn').addEventListener('click', createGroup);
  document.getElementById('new-group-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createGroup();
  });

  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      selectedColor = swatch.dataset.color;
    });
  });

  document.getElementById('minimize-all-btn').addEventListener('click', async () => {
    await send({ action: 'MINIMIZE_ALL' });
  });
}

function showNewGroupForm() {
  document.getElementById('new-group-form').hidden = false;
  document.getElementById('new-group-name').focus();
}

function hideNewGroupForm() {
  document.getElementById('new-group-form').hidden = true;
  document.getElementById('new-group-name').value = '';
  selectedColor = '';
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  document.querySelector('.color-swatch[data-color=""]').classList.add('selected');
}

async function createGroup() {
  const name = document.getElementById('new-group-name').value.trim();
  if (!name) {
    document.getElementById('new-group-name').focus();
    return;
  }
  const addCurrentWindow = document.getElementById('add-current-window').checked;
  const state = await send({
    action: 'CREATE_GROUP',
    name,
    color: selectedColor || null,
    addCurrentWindow
  });
  hideNewGroupForm();
  render(state);
}
