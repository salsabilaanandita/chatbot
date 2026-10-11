// ============================================================================
// Chatbot AI - GEMINI CHATBOT WITH SESSIONS & RESPONSIVE SIDEBAR
// ============================================================================

// DOM Elements
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');
const messagesContainer = document.getElementById('messages-container');
const suggestionsBox = document.getElementById('suggestions-box');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const stopPillBtn = document.getElementById('stop-pill-btn');
const stopPillContainer = document.getElementById('stop-pill-container');
const newChatBtn = document.getElementById('new-chat-btn');
const topNewChatBtn = document.getElementById('top-new-chat-btn');
const clearAllBtn = document.getElementById('clear-all-history-btn');
const historyList = document.getElementById('history-list');
const historyCount = document.getElementById('history-count');
const searchHistoryInput = document.getElementById('search-history-input');
const currentChatTitle = document.getElementById('current-chat-title');

// File Upload Elements
const fileInput = document.getElementById('file-input');
const attachBtn = document.getElementById('attach-btn');
const filePreviewBar = document.getElementById('file-preview-bar');
const filePreviewIcon = document.getElementById('file-preview-icon');
const filePreviewName = document.getElementById('file-preview-name');
const filePreviewSize = document.getElementById('file-preview-size');
const removeFileBtn = document.getElementById('remove-file-btn');

// Sidebar & Layout Elements
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');

// Theme Elements
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIconSun = document.getElementById('theme-icon-sun');
const themeIconMoon = document.getElementById('theme-icon-moon');

// Storage Keys
const SESSIONS_STORAGE_KEY = 'gemini_chat_sessions_v1';
const CURRENT_SESSION_KEY = 'gemini_current_session_id_v1';

// API URL (Auto detect if served from other ports like Live Server port 5500)
const API_URL =
  window.location.protocol === 'file:' ||
    (window.location.port && window.location.port !== '3000')
    ? 'http://localhost:3000/api/chat'
    : '/api/chat';

const GREETING =
  'Halo! Aku **Chatbot AI**, asisten AI yang siap membantu memahami materi pelajaran, konsep sulit, atau tugasmu langkah demi langkah. Mau bahas topik apa hari ini?';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// App State
let sessions = [];
let currentSessionId = null;
let currentAbortController = null;
let currentAttachedFile = null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ---- Theme Management ------------------------------------------------------
function initTheme() {
  const isDark =
    localStorage.getItem('theme') === 'dark' ||
    (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    document.documentElement.classList.add('dark');
    themeIconSun.classList.remove('hidden');
    themeIconMoon.classList.add('hidden');
  } else {
    document.documentElement.classList.remove('dark');
    themeIconSun.classList.add('hidden');
    themeIconMoon.classList.remove('hidden');
  }
}

themeToggleBtn.addEventListener('click', () => {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  themeIconSun.classList.toggle('hidden', !isDark);
  themeIconMoon.classList.toggle('hidden', isDark);
});

// ---- Sidebar Responsive Handlers -------------------------------------------
function openMobileSidebar() {
  sidebar.classList.remove('-translate-x-full');
  sidebarOverlay.classList.remove('hidden');
}

function closeMobileSidebar() {
  sidebar.classList.add('-translate-x-full');
  sidebarOverlay.classList.add('hidden');
}

toggleSidebarBtn.addEventListener('click', () => {
  if (window.innerWidth < 768) {
    // Mobile: Toggle drawer overlay
    if (sidebar.classList.contains('-translate-x-full')) {
      openMobileSidebar();
    } else {
      closeMobileSidebar();
    }
  } else {
    // Desktop: Toggle collapse width
    sidebar.classList.toggle('collapsed-desktop');
  }
});

closeSidebarBtn?.addEventListener('click', closeMobileSidebar);
sidebarOverlay?.addEventListener('click', closeMobileSidebar);

// ---- Clean LaTeX / Formula Helper ------------------------------------------
function cleanFormulas(text) {
  if (!text) return '';

  const subscriptMap = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋'
  };
  const superscriptMap = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻'
  };

  // Bersihkan block math $$...$$ dan inline math $...$
  return text.replace(/\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g, (match, block, inline) => {
    let clean = (block || inline || '').trim();

    // Suhu & derajat misal ^\circ C atau ^\circ\text{C}
    clean = clean.replace(/\^\\circ(?:\\text\{C\}|C)?/g, '°C');
    clean = clean.replace(/\\circ/g, '°');

    // Subscript misal _{12} atau _2
    clean = clean.replace(/_\{([0-9\+\-]+)\}/g, (_, num) => {
      return num.split('').map((c) => subscriptMap[c] || c).join('');
    });
    clean = clean.replace(/_([0-9\+\-])/g, (_, num) => subscriptMap[num] || num);

    // Superscript misal ^{2} atau ^2
    clean = clean.replace(/\^\{([0-9\+\-]+)\}/g, (_, num) => {
      return num.split('').map((c) => superscriptMap[c] || c).join('');
    });
    clean = clean.replace(/\^([0-9\+\-])/g, (_, num) => superscriptMap[num] || num);

    // Hilangkan wrapper text seperti \text{...} atau \mathrm{...}
    clean = clean.replace(/\\(?:text|mathrm|mathbf)\{([^}]+)\}/g, '$1');

    // Simbol umum matematika
    clean = clean
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\to|\\rightarrow/g, '→')
      .replace(/\\le|\\leq/g, '≤')
      .replace(/\\ge|\\geq/g, '≥')
      .replace(/\\neq/g, '≠')
      .replace(/\\approx/g, '≈')
      .replace(/\\cdot/g, '·');

    // Buang kurung kurawal atau backslash yang tersisa
    clean = clean.replace(/[{}]/g, '').replace(/\\/g, '');

    return clean;
  });
}

// ---- Markdown Formatting & Sanitization ------------------------------------
function formatContent(rawText) {
  const cleaned = cleanFormulas(rawText);
  if (window.marked && window.DOMPurify) {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
    return DOMPurify.sanitize(marked.parse(cleaned));
  }
  const div = document.createElement('div');
  div.textContent = cleaned;
  return div.innerHTML;
}


// ---- Sessions & History Management -----------------------------------------
function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    sessions = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load sessions', e);
    sessions = [];
  }

  currentSessionId = localStorage.getItem(CURRENT_SESSION_KEY);

  // Jika belum ada sesi sama sekali, buat sesi baru
  if (!sessions.length) {
    createNewSession();
  } else {
    // Validasi session ID aktif
    const exists = sessions.find((s) => s.id === currentSessionId);
    if (!exists) {
      currentSessionId = sessions[0].id;
      localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
    }
    renderHistoryList();
    renderCurrentConversation();
  }
}

function saveSessions() {
  const sessionsToSave = sessions.map((s) => ({
    ...s,
    conversation: s.conversation.map((m) => {
      if (m.file) {
        const canSaveBase64 = m.file.size && m.file.size < 1.5 * 1024 * 1024;
        return {
          ...m,
          file: {
            name: m.file.name,
            size: m.file.size,
            mimeType: m.file.mimeType,
            dataUrl:
              m.file.mimeType?.startsWith('image/') && m.file.size < 300000
                ? m.file.dataUrl
                : null,
            data: canSaveBase64 ? m.file.data : null,
          },
        };
      }
      return m;
    }),
  }));

  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessionsToSave));
  } catch (err) {
    console.warn('LocalStorage limit reached, saving metadata only', err);
  }
  localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
  renderHistoryList(searchHistoryInput.value);
}

function getCurrentSession() {
  return sessions.find((s) => s.id === currentSessionId);
}

function createNewSession() {
  const newId = 'session_' + Date.now();
  const newSession = {
    id: newId,
    title: 'Percakapan Baru',
    timestamp: Date.now(),
    conversation: [],
  };

  sessions.unshift(newSession);
  currentSessionId = newId;
  saveSessions();
  renderCurrentConversation();

  // On mobile, close sidebar after starting a new chat
  if (window.innerWidth < 768) {
    closeMobileSidebar();
  }
  input.focus();
}

function switchSession(id) {
  if (currentSessionId === id) return;
  currentSessionId = id;
  localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
  renderHistoryList(searchHistoryInput.value);
  renderCurrentConversation();

  if (window.innerWidth < 768) {
    closeMobileSidebar();
  }
}

// ---- Shadcn UI Confirmation Modal Helper -----------------------------------
function openConfirmDialog({ title, description, confirmText = 'Hapus', onConfirm }) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-title');
  const descEl = document.getElementById('confirm-description');
  const actionBtn = document.getElementById('confirm-action-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');
  const backdrop = document.getElementById('confirm-backdrop');

  if (!modal) {
    if (confirm(description || title)) {
      onConfirm?.();
    }
    return;
  }

  titleEl.textContent = title;
  descEl.textContent = description;
  actionBtn.textContent = confirmText;

  function closeModal() {
    modal.classList.add('hidden');
    document.removeEventListener('keydown', handleKeyDown);
    actionBtn.onclick = null;
    cancelBtn.onclick = null;
    backdrop.onclick = null;
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') closeModal();
  }

  actionBtn.onclick = () => {
    closeModal();
    if (typeof onConfirm === 'function') {
      onConfirm();
    }
  };

  cancelBtn.onclick = closeModal;
  backdrop.onclick = closeModal;
  document.addEventListener('keydown', handleKeyDown);

  modal.classList.remove('hidden');
  cancelBtn.focus();
}

function deleteSession(id, e) {
  if (e) e.stopPropagation();

  openConfirmDialog({
    title: 'Hapus Percakapan?',
    description: 'Tindakan ini tidak dapat dibatalkan. Percakapan ini akan dihapus secara permanen dari histori Anda.',
    confirmText: 'Hapus',
    onConfirm: () => {
      sessions = sessions.filter((s) => s.id !== id);

      if (!sessions.length) {
        createNewSession();
      } else {
        if (currentSessionId === id) {
          currentSessionId = sessions[0].id;
        }
        saveSessions();
        renderCurrentConversation();
      }
    },
  });
}

function clearAllHistory() {
  if (!sessions.length) return;

  openConfirmDialog({
    title: 'Hapus Semua Histori?',
    description: 'Apakah Anda yakin ingin menghapus SEMUA histori percakapan? Tindakan ini tidak dapat dibatalkan.',
    confirmText: 'Hapus Semua',
    onConfirm: () => {
      sessions = [];
      createNewSession();
    },
  });
}


// Render Histori Searching & List
function renderHistoryList(filterQuery = '') {
  historyList.innerHTML = '';
  const query = filterQuery.trim().toLowerCase();

  const filtered = sessions.filter((s) => {
    if (!query) return true;
    const matchTitle = s.title.toLowerCase().includes(query);
    const matchMessages = s.conversation.some((m) =>
      m.text.toLowerCase().includes(query)
    );
    return matchTitle || matchMessages;
  });

  historyCount.textContent = `${sessions.length} sesi`;

  if (!filtered.length) {
    historyList.innerHTML = `
      <div class="px-3 py-6 text-center text-xs text-muted-foreground select-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-1.5 opacity-50">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </svg>
        ${query ? 'Tidak ada hasil untuk "' + query + '"' : 'Belum ada histori'}
      </div>
    `;
    return;
  }

  filtered.forEach((session) => {
    const isActive = session.id === currentSessionId;
    const item = document.createElement('div');
    item.className = `group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${isActive
        ? 'bg-accent text-accent-foreground font-medium shadow-sm border border-border/60'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`;

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'
      }">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span class="truncate block text-left">${session.title}</span>
      </div>
      <button
        type="button"
        class="del-btn opacity-0 group-hover:opacity-100 p-1 hover:text-destructive rounded hover:bg-background/80 transition-all shrink-0"
        title="Hapus sesi ini"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      </button>
    `;

    item.addEventListener('click', () => switchSession(session.id));

    const delBtn = item.querySelector('.del-btn');
    delBtn.addEventListener('click', (e) => deleteSession(session.id, e));

    historyList.appendChild(item);
  });
}

// Histori search input handler
searchHistoryInput.addEventListener('input', (e) => {
  renderHistoryList(e.target.value);
});

// Render Pesan Percakapan Aktif
function renderCurrentConversation() {
  const session = getCurrentSession();
  if (!session) return;

  currentChatTitle.textContent = session.title;
  messagesContainer.innerHTML = '';

  if (!session.conversation.length) {
    suggestionsBox.classList.remove('hidden');
    // Greeting bot message jika masih kosong
    appendMessage('bot', GREETING, false, false);
  } else {
    suggestionsBox.classList.add('hidden');
    session.conversation.forEach((msg) => {
      appendMessage(
        msg.role === 'user' ? 'user' : 'bot',
        msg.text,
        false,
        false,
        msg.file
      );
    });
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}

// Render lampiran dalam balon chat user (kompak, rapi, dan proporsional)
function renderAttachmentHtml(file) {
  if (!file) return '';
  if (file.mimeType?.startsWith('image/') && file.dataUrl) {
    return `<div class="user-attachment-preview mb-1.5"><img src="${file.dataUrl}" alt="${escapeHtml(
      file.name
    )}" class="max-w-[220px] max-h-44 rounded-lg object-contain bg-black/10 border border-white/10" /></div>`;
  }
  if (file.mimeType?.startsWith('audio/')) {
    return `
      <div class="user-attachment-pill mb-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/15 flex flex-col gap-1 max-w-[240px]">
        <div class="flex items-center gap-1.5 text-xs font-medium truncate">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 opacity-80">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <span class="truncate" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        </div>
        ${
          file.dataUrl
            ? `<audio controls src="${file.dataUrl}" class="h-6 w-full max-w-[220px] mt-0.5"></audio>`
            : ''
        }
      </div>
    `;
  }
  return `
    <div class="user-attachment-pill mb-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/15 flex items-center gap-2 max-w-[250px] text-left">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 opacity-80">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
      <div class="min-w-0 flex-1">
        <div class="font-medium text-xs truncate leading-snug" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        ${
          file.size
            ? `<div class="text-[10px] opacity-75 leading-none mt-0.5">${formatBytes(file.size)}</div>`
            : ''
        }
      </div>
    </div>
  `;
}

// ---- Append Bubble Message -------------------------------------------------
function appendMessage(
  sender,
  text,
  isPending = false,
  shouldScroll = true,
  file = null
) {
  const wrapper = document.createElement('div');
  wrapper.className = `chat ${sender === 'user' ? 'chat-end' : 'chat-start'} animate-fade-in`;

  if (sender === 'bot') {
    wrapper.innerHTML = `
      <div class="chat-image avatar">
        <div class="h-8 w-8 rounded-full bg-secondary border border-border flex items-center justify-center text-foreground shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8V4H8"></path>
            <rect width="16" height="12" x="4" y="8" rx="2"></rect>
            <path d="M2 14h2"></path>
            <path d="M20 14h2"></path>
            <path d="M15 13v2"></path>
            <path d="M9 13v2"></path>
          </svg>
        </div>
      </div>
      <div class="chat-bubble shadow-sm group">
        <div class="msg-card">
          ${isPending
        ? `<div class="flex items-center gap-1.5 py-1">
                   <span class="text-xs text-muted-foreground mr-1">Gemini sedang berpikir</span>
                   <span class="thinking-dot h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
                   <span class="thinking-dot h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
                   <span class="thinking-dot h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
                 </div>`
        : `<div class="prose-chat">${formatContent(text)}</div>`
      }
        </div>
        ${!isPending
        ? `<div class="flex items-center gap-2 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" class="copy-btn text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1" title="Salin jawaban">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                  </svg>
                  <span>Salin</span>
                </button>
              </div>`
        : ''
      }
      </div>
    `;

    const copyBtn = wrapper.querySelector('.copy-btn');
    if (copyBtn) {
      setupCopyButton(copyBtn, text);
    }
  } else {
    // User message
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user-bubble shadow-sm';

    let contentHtml = '';
    if (file) {
      contentHtml += renderAttachmentHtml(file);
    }
    if (text && text.trim()) {
      contentHtml += `<div class="user-text-content whitespace-pre-wrap break-words">${escapeHtml(
        text.trim()
      )}</div>`;
    }
    bubble.innerHTML = contentHtml;
    wrapper.appendChild(bubble);
  }

  messagesContainer.appendChild(wrapper);
  if (shouldScroll) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  return wrapper;
}

function setupCopyButton(btn, text) {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span class="text-emerald-500 font-medium">Tersalin!</span>
      `;
      setTimeout(() => {
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
          </svg>
          <span>Salin</span>
        `;
      }, 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  });
}

function updateStreamingMessage(wrapper, text) {
  const card = wrapper.querySelector('.msg-card');
  if (!card) return;
  card.innerHTML = `<div class="prose-chat">${formatContent(text)}</div>`;
  chatBox.scrollTop = chatBox.scrollHeight;
}

function finalizeBotMessage(wrapper, text) {
  updateStreamingMessage(wrapper, text);

  const container = wrapper.querySelector('.group');
  if (container && !container.querySelector('.copy-btn')) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className =
      'flex items-center gap-2 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity';
    actionsDiv.innerHTML = `
      <button type="button" class="copy-btn text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1" title="Salin jawaban">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
        </svg>
        <span>Salin</span>
      </button>
    `;

    const copyBtn = actionsDiv.querySelector('.copy-btn');
    setupCopyButton(copyBtn, text);
    container.appendChild(actionsDiv);
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}

function updatePendingMessage(wrapper, text, isError = false) {
  const card = wrapper.querySelector('.msg-card');
  if (!card) return;

  if (isError) {
    card.classList.add('bg-destructive/10', 'text-destructive', 'border-destructive/30');
    card.innerHTML = `<p class="text-xs font-medium">${text}</p>`;
    chatBox.scrollTop = chatBox.scrollHeight;
  } else {
    finalizeBotMessage(wrapper, text);
  }
}

function autoResizeInput() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}

function resetInputHeight() {
  input.style.height = 'auto';
}

function setGenerating(generating) {
  isGenerating = generating;
  input.disabled = generating;

  if (generating) {
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    stopPillContainer?.classList.remove('hidden');
  } else {
    sendBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    stopPillContainer?.classList.add('hidden');
    input.focus();
    resetInputHeight();
  }
}

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

// ---- File Attachment Preview Handlers ------------------------------------
attachBtn?.addEventListener('click', () => {
  fileInput.click();
});

fileInput?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 20 * 1024 * 1024) {
    alert('Ukuran file maksimal adalah 20 MB.');
    fileInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = event.target.result;
    const base64Data = dataUrl.split(',')[1];
    
    let mimeType = file.type || '';
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (lowerName.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (lowerName.endsWith('.webp')) {
      mimeType = 'image/webp';
    } else if (lowerName.endsWith('.mp3')) {
      mimeType = 'audio/mp3';
    } else if (lowerName.endsWith('.wav')) {
      mimeType = 'audio/wav';
    } else if (lowerName.endsWith('.m4a')) {
      mimeType = 'audio/m4a';
    } else if (lowerName.endsWith('.ogg')) {
      mimeType = 'audio/ogg';
    } else if (!mimeType) {
      mimeType = 'application/octet-stream';
    }

    currentAttachedFile = {
      name: file.name,
      size: file.size,
      mimeType,
      data: base64Data,
      dataUrl,
    };

    renderFilePreview(currentAttachedFile);
  };
  reader.readAsDataURL(file);
});

function renderFilePreview(file) {
  if (!file) return;
  filePreviewName.textContent = file.name;
  filePreviewSize.textContent = formatBytes(file.size);

  if (file.mimeType.startsWith('image/')) {
    filePreviewIcon.innerHTML = `<img src="${file.dataUrl}" class="h-full w-full object-cover rounded-md" alt="Preview" />`;
  } else if (file.mimeType.startsWith('audio/')) {
    filePreviewIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary">
        <path d="M9 18V5l12-2v13"></path>
        <circle cx="6" cy="18" r="3"></circle>
        <circle cx="18" cy="16" r="3"></circle>
      </svg>
    `;
  } else {
    filePreviewIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
    `;
  }

  filePreviewBar.classList.remove('hidden');
}

function clearAttachedFile() {
  currentAttachedFile = null;
  if (fileInput) fileInput.value = '';
  filePreviewBar.classList.add('hidden');
  filePreviewIcon.innerHTML = '';
}

removeFileBtn?.addEventListener('click', clearAttachedFile);

// ---- Send Message Handler (Streaming Real-time & Multimodal) ----------------
async function sendMessage(userMessage, attachedFileParam = null) {
  const fileToSend = attachedFileParam || currentAttachedFile;
  clearAttachedFile();

  let text = (userMessage || '').trim();
  if (!text && !fileToSend) return;

  // Default teks jika pengguna hanya mengirim file tanpa teks
  if (!text && fileToSend) {
    if (fileToSend.mimeType.startsWith('image/')) {
      text = 'Tolong analisis dan jelaskan gambar yang saya unggah ini.';
    } else if (fileToSend.mimeType.startsWith('audio/')) {
      text = 'Tolong buatkan transkrip dan jelaskan isi rekaman audio yang saya unggah ini.';
    } else {
      text = 'Tolong pelajari dan jelaskan isi dokumen/file yang saya unggah ini.';
    }
  }

  const session = getCurrentSession();
  if (!session) return;

  // Auto-generate title dari prompt pertama atau nama file
  if (!session.conversation.length || session.title === 'Percakapan Baru') {
    const titleSource = text || fileToSend?.name || 'Percakapan Baru';
    const cleanTitle = titleSource.replace(/\n/g, ' ').slice(0, 32);
    session.title = cleanTitle + (titleSource.length > 32 ? '...' : '');
    currentChatTitle.textContent = session.title;
  }

  suggestionsBox.classList.add('hidden');

  // Bersihkan greeting awal bot jika percakapan dimulai
  if (!session.conversation.length && messagesContainer.children.length <= 1) {
    messagesContainer.innerHTML = '';
  }

  appendMessage('user', text, false, true, fileToSend);
  session.conversation.push({ role: 'user', text, file: fileToSend });
  input.value = '';
  resetInputHeight();
  saveSessions();

  const pendingEl = appendMessage('bot', '', true);
  setGenerating(true);

  let accumulatedText = '';
  currentAbortController = new AbortController();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation: session.conversation, stream: true }),
      signal: currentAbortController.signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.error || `Server error: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // Respons streaming SSE untuk respon yang sangat cepat & real-time
    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // simpan bagian baris yang belum utuh

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.text) {
              accumulatedText += parsed.text;
              updateStreamingMessage(pendingEl, accumulatedText);
            }
          } catch (jsonErr) {
            if (jsonErr.message && !jsonErr.message.includes('JSON')) {
              throw jsonErr;
            }
          }
        }
      }

      if (accumulatedText && accumulatedText.trim()) {
        finalizeBotMessage(pendingEl, accumulatedText);
        session.conversation.push({ role: 'model', text: accumulatedText });
        saveSessions();
      } else {
        updatePendingMessage(pendingEl, 'Maaf, tidak ada respon yang diterima dari server.', true);
        session.conversation.pop();
        saveSessions();
      }
    } else {
      // Fallback JSON non-stream jika server mengirim JSON biasa
      const data = await response.json();
      if (data && data.result) {
        finalizeBotMessage(pendingEl, data.result);
        session.conversation.push({ role: 'model', text: data.result });
        saveSessions();
      } else {
        updatePendingMessage(pendingEl, 'Maaf, tidak ada respon yang diterima dari server.', true);
        session.conversation.pop();
        saveSessions();
      }
    }
  } catch (error) {
    if (error.name === 'AbortError' || currentAbortController?.signal?.aborted) {
      // Pengguna menghentikan proses (Stop)
      if (accumulatedText && accumulatedText.trim()) {
        finalizeBotMessage(pendingEl, accumulatedText + ' *(jawaban dihentikan)*');
        session.conversation.push({ role: 'model', text: accumulatedText });
        saveSessions();
      } else {
        updatePendingMessage(pendingEl, 'Menjawab dihentikan.', false);
      }
    } else {
      console.error('Error fetching response:', error);
      updatePendingMessage(pendingEl, error.message || 'Gagal terhubung dengan server.', true);
      session.conversation.pop();
      saveSessions();
    }
  } finally {
    currentAbortController = null;
    setGenerating(false);
  }
}

// Event Listeners
form.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(input.value.trim());
});

// Auto-resizing textarea & keyboard handlers
input.addEventListener('input', autoResizeInput);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

newChatBtn.addEventListener('click', createNewSession);
topNewChatBtn.addEventListener('click', createNewSession);
clearAllBtn.addEventListener('click', clearAllHistory);
stopBtn?.addEventListener('click', stopGeneration);
stopPillBtn?.addEventListener('click', stopGeneration);

// Setup suggestion chips
document.querySelectorAll('.suggestion-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const prompt = chip.dataset.prompt;
    if (prompt) sendMessage(prompt);
  });
});

// Shortcut Ctrl/Cmd + K to focus search history
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (window.innerWidth < 768) openMobileSidebar();
    searchHistoryInput.focus();
  }
});

// Initialize on Load
initTheme();
loadSessions();
