// Safari Window Manager — Group List Page
// Opened as a tab via LIST_GROUP. Fetches window/tab data from the background.

async function send(message) {
  return browser.runtime.sendMessage(message);
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const groupId = params.get('groupId');

  if (!groupId) {
    showError('No group ID in URL.');
    return;
  }

  let data;
  try {
    data = await send({ action: 'GET_LIST_DATA', groupId });
  } catch (e) {
    showError(String(e));
    return;
  }

  if (!data?.ok) {
    showError(data?.error ?? 'Unknown error');
    return;
  }

  render(data);
}

function render({ group, windows }) {
  document.title = `Window Manager — ${group.name}`;

  const dot = document.getElementById('group-color-dot');
  if (group.color) {
    dot.style.background = group.color;
    dot.hidden = false;
  }

  document.getElementById('group-name').textContent = group.name;

  const totalTabs = windows.reduce((sum, w) => sum + w.tabs.length, 0);
  document.getElementById('summary').textContent =
    `${windows.length} window${windows.length !== 1 ? 's' : ''} · ${totalTabs} tab${totalTabs !== 1 ? 's' : ''}`;

  const container = document.getElementById('windows-list');

  if (windows.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'no-windows';
    msg.textContent = 'No windows are assigned to this group in the current session.';
    container.appendChild(msg);
  } else {
    windows.forEach((win, i) => {
      container.appendChild(buildWindowSection(win, i + 1));
    });
  }

  document.getElementById('loading').hidden = true;
  document.getElementById('content').hidden = false;
}

function buildWindowSection(win, index) {
  const section = document.createElement('div');
  section.className = 'window-section';

  const titleRow = document.createElement('div');
  titleRow.className = 'window-title-row';

  const label = document.createElement('span');
  label.className = 'window-label';
  // Use the active tab's title as the window label, fall back to "Window N"
  const activeTab = win.tabs.find(t => t.active);
  label.textContent = activeTab?.title ? activeTab.title : `Window ${index}`;

  const count = document.createElement('span');
  count.className = 'tab-count';
  count.textContent = `${win.tabs.length} tab${win.tabs.length !== 1 ? 's' : ''}`;

  titleRow.appendChild(label);
  titleRow.appendChild(count);
  section.appendChild(titleRow);

  const tabList = document.createElement('ul');
  tabList.className = 'tab-list';

  for (const tab of win.tabs) {
    tabList.appendChild(buildTabRow(tab, win.id));
  }

  section.appendChild(tabList);
  return section;
}

function buildTabRow(tab, windowId) {
  const li = document.createElement('li');
  li.className = 'tab-row' + (tab.active ? ' active-tab' : '');

  // Favicon
  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = tab.favIconUrl;
    img.alt = '';
    img.addEventListener('error', () => img.replaceWith(makeFaviconPlaceholder()));
    li.appendChild(img);
  } else {
    li.appendChild(makeFaviconPlaceholder());
  }

  // Info
  const info = document.createElement('div');
  info.className = 'tab-info';

  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || tab.url || '(no title)';
  info.appendChild(title);

  if (tab.url) {
    const urlEl = document.createElement('div');
    urlEl.className = 'tab-url';
    try {
      urlEl.textContent = new URL(tab.url).hostname || tab.url;
    } catch {
      urlEl.textContent = tab.url;
    }
    info.appendChild(urlEl);
  }

  li.appendChild(info);

  if (tab.active) {
    const badge = document.createElement('span');
    badge.className = 'active-badge';
    badge.textContent = 'Active';
    li.appendChild(badge);
  }

  // Click to focus the window and activate the tab
  li.addEventListener('click', async () => {
    try {
      await browser.windows.update(windowId, { focused: true });
      await browser.tabs.update(tab.id, { active: true });
    } catch {
      // Window may have been closed since the list was generated; ignore.
    }
  });

  return li;
}

function makeFaviconPlaceholder() {
  const div = document.createElement('div');
  div.className = 'tab-favicon-placeholder';
  return div;
}

function showError(detail) {
  document.getElementById('loading').hidden = true;
  document.getElementById('error').hidden = false;
  document.getElementById('error-detail').textContent = detail;
}

init();
