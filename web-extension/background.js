// Safari Window Manager — Background Service Worker
// All business logic lives here. The popup is a thin view layer.

// ── In-memory state (lost on SW termination; rebuilt from storage) ────────────
let groups = [];
const membership = new Map(); // groupId -> Set<windowId>

// ── Storage helpers ───────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID();
}

async function loadFromStorage() {
  const result = await browser.storage.local.get('windowGroups');
  const stored = result.windowGroups;
  if (!stored || !stored.groups) {
    groups = [];
    return;
  }
  // Clear transient window IDs on startup; rebuild from user actions this session
  groups = stored.groups.map(g => ({ ...g, windowIds: [] }));
  for (const g of groups) {
    membership.set(g.id, new Set());
  }
}

let flushTimer = null;
function scheduleMembershipFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(persistMembership, 100);
}

async function persistMembership() {
  const updated = groups.map(g => ({
    ...g,
    windowIds: [...(membership.get(g.id) ?? [])]
  }));
  await browser.storage.local.set({
    windowGroups: { version: 1, groups: updated }
  });
}

async function persistGroups() {
  await persistMembership();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', () => {
  loadFromStorage();
});

// Also initialize when the SW wakes up from idle termination
loadFromStorage();

// ── Window close cleanup ──────────────────────────────────────────────────────

browser.windows.onRemoved.addListener((windowId) => {
  for (const members of membership.values()) {
    members.delete(windowId);
  }
  // No storage write needed — in-memory cleanup only.
  // Next popup open will reflect accurate counts.
});

// ── Message handler ───────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message, _sender) => {
  switch (message.action) {
    case 'GET_STATE':            return handleGetState();
    case 'TOGGLE_WINDOW_IN_GROUP': return handleToggle(message);
    case 'CREATE_GROUP':         return handleCreate(message);
    case 'RENAME_GROUP':         return handleRename(message);
    case 'SET_GROUP_COLOR':      return handleSetColor(message);
    case 'DELETE_GROUP':         return handleDelete(message);
    case 'MINIMIZE_GROUP':       return handleMinimize(message);
    case 'RESTORE_GROUP':        return handleRestore(message);
    case 'FOCUS_GROUP':          return handleFocus(message);
    case 'MINIMIZE_ALL':         return handleMinimizeAll();
    case 'LIST_GROUP':           return handleListGroup(message);
    case 'GET_LIST_DATA':        return handleGetListData(message);
    default:
      return Promise.resolve({ ok: false, error: 'Unknown action' });
  }
});

// ── State serialization ───────────────────────────────────────────────────────

function serializeMembership() {
  const out = {};
  for (const [groupId, members] of membership) {
    out[groupId] = [...members];
  }
  return out;
}

function stateResponse(currentWindowId) {
  return {
    ok: true,
    currentWindowId,
    groups,
    membership: serializeMembership()
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleGetState() {
  // If groups is empty but storage has data, the SW was terminated and restarted
  if (groups.length === 0) {
    await loadFromStorage();
  }
  const win = await browser.windows.getCurrent({ populate: false });
  return stateResponse(win.id);
}

async function handleToggle({ groupId }) {
  const win = await browser.windows.getCurrent({ populate: false });
  const windowId = win.id;
  let members = membership.get(groupId);
  if (!members) {
    members = new Set();
    membership.set(groupId, members);
  }
  if (members.has(windowId)) {
    members.delete(windowId);
  } else {
    members.add(windowId);
  }
  scheduleMembershipFlush();
  return stateResponse(windowId);
}

async function handleCreate({ name, color, addCurrentWindow }) {
  const group = {
    id: generateId(),
    name: name.trim(),
    color: color ?? null,
    createdAt: Date.now(),
    windowIds: []
  };
  groups.push(group);
  membership.set(group.id, new Set());

  let currentWindowId = null;
  if (addCurrentWindow) {
    const win = await browser.windows.getCurrent({ populate: false });
    currentWindowId = win.id;
    membership.get(group.id).add(currentWindowId);
  }
  await persistGroups();
  if (currentWindowId === null) {
    const win = await browser.windows.getCurrent({ populate: false });
    currentWindowId = win.id;
  }
  return stateResponse(currentWindowId);
}

async function handleRename({ groupId, name }) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return { ok: false, error: 'Group not found' };
  group.name = name.trim();
  await persistGroups();
  const win = await browser.windows.getCurrent({ populate: false });
  return stateResponse(win.id);
}

async function handleSetColor({ groupId, color }) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return { ok: false, error: 'Group not found' };
  group.color = color ?? null;
  await persistGroups();
  const win = await browser.windows.getCurrent({ populate: false });
  return stateResponse(win.id);
}

async function handleDelete({ groupId }) {
  groups = groups.filter(g => g.id !== groupId);
  membership.delete(groupId);
  await persistGroups();
  const win = await browser.windows.getCurrent({ populate: false });
  return stateResponse(win.id);
}

async function handleMinimize({ groupId }) {
  const members = membership.get(groupId) ?? new Set();
  const results = await Promise.allSettled(
    [...members].map(id => browser.windows.update(id, { state: 'minimized' }))
  );
  const errors = results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason?.message ?? String(r.reason));
  return { ok: true, errors };
}

async function handleRestore({ groupId }) {
  const members = membership.get(groupId) ?? new Set();
  await Promise.allSettled(
    [...members].map(id => browser.windows.update(id, { state: 'normal' }))
  );
  return { ok: true };
}

async function handleFocus({ groupId }) {
  const targetMembers = membership.get(groupId) ?? new Set();
  const allWindows = await browser.windows.getAll({ populate: false });
  const toMinimize = allWindows
    .filter(w => !targetMembers.has(w.id) && w.state !== 'minimized')
    .map(w => w.id);
  await Promise.allSettled(
    toMinimize.map(id => browser.windows.update(id, { state: 'minimized' }))
  );
  return { ok: true };
}

async function handleListGroup({ groupId }) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return { ok: false, error: 'Group not found' };
  const listUrl = browser.runtime.getURL('list.html') + '?groupId=' + encodeURIComponent(groupId);
  await browser.tabs.create({ url: listUrl });
  return { ok: true };
}

async function handleGetListData({ groupId }) {
  if (groups.length === 0) await loadFromStorage();
  const group = groups.find(g => g.id === groupId);
  if (!group) return { ok: false, error: 'Group not found' };

  const windowIds = [...(membership.get(groupId) ?? [])];
  const results = await Promise.allSettled(
    windowIds.map(id => browser.windows.get(id, { populate: true }))
  );

  const windows = results
    .filter(r => r.status === 'fulfilled')
    .map(r => ({
      id: r.value.id,
      focused: r.value.focused,
      tabs: (r.value.tabs ?? []).map(t => ({
        id: t.id,
        title: t.title ?? '',
        url: t.url ?? '',
        favIconUrl: t.favIconUrl ?? '',
        active: t.active
      }))
    }));

  return {
    ok: true,
    group: { id: group.id, name: group.name, color: group.color },
    windows
  };
}

async function handleMinimizeAll() {
  const allMembers = new Set();
  for (const members of membership.values()) {
    for (const id of members) allMembers.add(id);
  }
  await Promise.allSettled(
    [...allMembers].map(id => browser.windows.update(id, { state: 'minimized' }))
  );
  return { ok: true };
}
