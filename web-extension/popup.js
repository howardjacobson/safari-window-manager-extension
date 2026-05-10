// Safari Window Manager — Popup

const SWATCH_COLORS = [
  { value: '',        label: 'No color' },
  { value: '#FF5F57', label: 'Red'      },
  { value: '#FFA500', label: 'Orange'   },
  { value: '#FFCC00', label: 'Yellow'   },
  { value: '#28C840', label: 'Green'    },
  { value: '#1E90FF', label: 'Blue'     },
  { value: '#AF52DE', label: 'Purple'   },
  { value: '#FF2D55', label: 'Pink'     },
];

async function send(message) {
  return browser.runtime.sendMessage(message);
}

// ── State ─────────────────────────────────────────────────────────────────────

let currentWindowId = null;
let selectedNewGroupColor = '';
let sortOrder = localStorage.getItem('sortOrder') || 'recent';
let lastState = null;

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const state = await send({ action: 'GET_STATE' });
  render(state);
  bindStaticControls();
});

// ── Render ────────────────────────────────────────────────────────────────────

function render(state) {
  lastState = state;
  currentWindowId = state.currentWindowId;
  const { groups, membership } = state;

  const list = document.getElementById('groups-list');
  const emptyState = document.getElementById('empty-state');

  list.innerHTML = '';

  document.getElementById('sort-recent').classList.toggle('active', sortOrder === 'recent');
  document.getElementById('sort-az').classList.toggle('active', sortOrder === 'az');

  if (groups.length === 0) {
    emptyState.hidden = false;
    document.getElementById('minimize-all-btn').disabled = true;
    return;
  }

  emptyState.hidden = true;
  document.getElementById('minimize-all-btn').disabled = false;

  const sorted = sortGroups(groups);
  for (const group of sorted) {
    const memberIds = membership[group.id] ?? [];
    const isMember = memberIds.includes(currentWindowId);
    list.appendChild(buildGroupItem(group, isMember, memberIds.length));
  }
}

function sortGroups(groups) {
  return [...groups].sort((a, b) => {
    if (sortOrder === 'az') return a.name.localeCompare(b.name);
    return (b.modifiedAt ?? b.createdAt) - (a.modifiedAt ?? a.createdAt);
  });
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
  toggle.addEventListener('click', () => toggleMembership(group.id, isMember));
  header.appendChild(toggle);

  // Color indicator — always shown; click opens inline color picker
  const colorBtn = document.createElement('button');
  colorBtn.className = 'color-indicator-btn' + (group.color ? ' has-color' : '');
  colorBtn.style.background = group.color || 'transparent';
  colorBtn.title = 'Change color';
  colorBtn.setAttribute('aria-label', 'Change group color');
  colorBtn.addEventListener('click', () => toggleInlineColorPicker(group, li));
  header.appendChild(colorBtn);

  const nameBtn = document.createElement('button');
  nameBtn.className = 'group-name-btn';
  nameBtn.textContent = group.name;
  nameBtn.title = 'Click to add/remove window · Double-click to rename';
  let clickTimer = null;
  nameBtn.addEventListener('click', () => {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => toggleMembership(group.id, isMember), 250);
  });
  nameBtn.addEventListener('dblclick', () => {
    clearTimeout(clickTimer);
    startRename(group, li);
  });
  header.appendChild(nameBtn);

  const countSpan = document.createElement('span');
  countSpan.className = 'window-count';
  countSpan.textContent = windowCount === 1 ? '1 window' : `${windowCount} windows`;
  header.appendChild(countSpan);

  li.appendChild(header);

  // ── Inline color picker (hidden until color button clicked) ───────────────
  const picker = document.createElement('div');
  picker.className = 'inline-color-picker';
  picker.hidden = true;
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', 'Group color');

  for (const { value, label } of SWATCH_COLORS) {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch' + (group.color === value ? ' selected' : '');
    swatch.dataset.color = value;
    swatch.setAttribute('aria-label', label);
    swatch.title = label;
    if (value) {
      swatch.style.background = value;
    } else {
      swatch.style.background = 'var(--swatch-none)';
    }
    swatch.addEventListener('click', async () => {
      const state = await send({ action: 'SET_GROUP_COLOR', groupId: group.id, color: value || null });
      render(state);
    });
    picker.appendChild(swatch);
  }
  li.appendChild(picker);

  // ── Action buttons ────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'group-actions';

  const noWindows = windowCount === 0;

  const minBtn    = makeBtn('Minimize',        () => minimizeGroup(group.id), noWindows);
  const restoreBtn = makeBtn('Restore',        () => restoreGroup(group.id),  noWindows);
  const listBtn   = makeBtn('List',            () => listGroup(group.id),     noWindows);
  const focusBtn  = makeBtn('Focus This Group',() => focusGroup(group.id),    noWindows);
  const deleteBtn = makeBtn('Delete',          () => deleteGroup(group.id),   false);
  focusBtn.className  += ' btn-focus';
  deleteBtn.className += ' btn-delete';

  actions.append(minBtn, restoreBtn, listBtn, focusBtn, deleteBtn);
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

// ── Inline color picker toggle ────────────────────────────────────────────────

function toggleInlineColorPicker(group, li) {
  const picker = li.querySelector('.inline-color-picker');
  const isHidden = picker.hidden;
  // Close all open pickers first
  document.querySelectorAll('.inline-color-picker').forEach(p => { p.hidden = true; });
  picker.hidden = !isHidden;
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
    const state = await send(
      newName && newName !== group.name
        ? { action: 'RENAME_GROUP', groupId: group.id, name: newName }
        : { action: 'GET_STATE' }
    );
    render(state);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') {
      input.removeEventListener('blur', commit);
      send({ action: 'GET_STATE' }).then(render);
    }
  });
}

// ── Window group actions ──────────────────────────────────────────────────────

async function toggleMembership(groupId, wasMember) {
  const state = await send({ action: 'TOGGLE_WINDOW_IN_GROUP', groupId });
  if (!wasMember) {
    window.close();
  } else {
    render(state);
  }
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

async function listGroup(groupId) {
  await send({ action: 'LIST_GROUP', groupId });
}

async function deleteGroup(groupId) {
  const state = await send({ action: 'DELETE_GROUP', groupId });
  render(state);
}

// ── New group form ────────────────────────────────────────────────────────────

function bindStaticControls() {
  document.getElementById('create-group-btn').addEventListener('click', createGroup);
  document.getElementById('new-group-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createGroup();
  });

  document.querySelectorAll('#new-group-form .color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('#new-group-form .color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      selectedNewGroupColor = swatch.dataset.color;
    });
  });

  document.getElementById('minimize-all-btn').addEventListener('click', async () => {
    await send({ action: 'MINIMIZE_ALL' });
  });

  document.getElementById('sort-recent').addEventListener('click', () => {
    sortOrder = 'recent';
    localStorage.setItem('sortOrder', sortOrder);
    if (lastState) render(lastState);
  });

  document.getElementById('sort-az').addEventListener('click', () => {
    sortOrder = 'az';
    localStorage.setItem('sortOrder', sortOrder);
    if (lastState) render(lastState);
  });
}

function resetNewGroupForm() {
  document.getElementById('new-group-name').value = '';
  selectedNewGroupColor = '';
  document.querySelectorAll('#new-group-form .color-swatch').forEach(s => s.classList.remove('selected'));
  document.querySelector('#new-group-form .color-swatch[data-color=""]').classList.add('selected');
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
    color: selectedNewGroupColor || null,
    addCurrentWindow
  });
  resetNewGroupForm();
  render(state);
}
