// ---------------------------------------------------------------------------
// Enterprise Knowledge Base - frontend logic
//
// Framework-free (no React/Next.js). Handles:
//   1. PDF upload with a staged progress indicator (left panel)
//   2. Chat with the knowledge base, ChatGPT-style (right panel)
// ---------------------------------------------------------------------------

const UPLOAD_STAGES = [
  { key: 'upload', label: 'Uploading' },
  { key: 'parse', label: 'Parsing PDF' },
  { key: 'clean', label: 'Cleaning' },
  { key: 'chunk', label: 'Chunking' },
  { key: 'embed', label: 'Generating embeddings' },
  { key: 'store', label: 'Saving to ChromaDB' },
  { key: 'ready', label: 'Knowledge base ready' },
];

const CHAT_STAGES = [
  'Searching knowledge base...',
  'Running vector search...',
  'Running keyword search...',
  'Merging and re-ranking...',
  'Generating answer...',
];

// --- Upload panel -----------------------------------------------------

const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const fileDrop = document.getElementById('file-drop');
const fileDropLabel = document.getElementById('file-drop-label');
const uploadBtn = document.getElementById('upload-btn');
const uploadProgress = document.getElementById('upload-progress');
const uploadProgressBar = document.getElementById('upload-progress-bar');
const uploadSteps = document.getElementById('upload-steps');
const uploadMessage = document.getElementById('upload-message');
const indexedDocs = document.getElementById('indexed-docs');
const indexedDocsList = document.getElementById('indexed-docs-list');

let selectedFile = null;
let uploadStageTimer = null;

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) setSelectedFile(fileInput.files[0]);
});

['dragover', 'dragleave', 'drop'].forEach((eventName) => {
  fileDrop.addEventListener(eventName, (e) => e.preventDefault());
});
fileDrop.addEventListener('dragover', () => {
  fileDrop.classList.add('border-accent-500', 'text-slate-100', 'bg-accent-500/5');
});
fileDrop.addEventListener('dragleave', () => {
  fileDrop.classList.remove('border-accent-500', 'text-slate-100', 'bg-accent-500/5');
});
fileDrop.addEventListener('drop', (e) => {
  fileDrop.classList.remove('border-accent-500', 'text-slate-100', 'bg-accent-500/5');
  const file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

function setSelectedFile(file) {
  selectedFile = file;
  fileDropLabel.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  uploadBtn.disabled = false;
}

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return;

  uploadBtn.disabled = true;
  uploadMessage.classList.add('hidden');
  uploadProgress.classList.remove('hidden');
  uploadSteps.innerHTML = UPLOAD_STAGES
    .map((s) => `<li data-key="${s.key}" class="text-slate-400 transition">${s.label}</li>`)
    .join('');
  uploadProgressBar.style.width = '0%';

  runUploadStageAnimation();

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const response = await fetch('/knowledge/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'The server returned an error.');
    }

    completeUploadStages();
    showUploadMessage('success', `Indexed "${data.fileName}" (${data.chunkCount} chunks, ${data.pageCount} pages).`);
    addIndexedDocEntry(data);
  } catch (error) {
    stopUploadStageAnimation();
    showUploadMessage('error', error.message);
  } finally {
    uploadBtn.disabled = false;
  }
});

function runUploadStageAnimation() {
  let index = 0;
  const items = uploadSteps.querySelectorAll('li');
  const total = items.length;

  const advance = () => {
    if (index > 0) {
      items[index - 1].classList.remove('text-slate-100');
      items[index - 1].classList.add('text-emerald-400');
      const spinner = items[index - 1].querySelector('.spinner');
      if (spinner) spinner.remove();
    }
    if (index < total - 1) {
      items[index].classList.remove('text-slate-400');
      items[index].classList.add('text-slate-100');
      items[index].insertAdjacentHTML('afterbegin', '<span class="spinner"></span>');
      uploadProgressBar.style.width = `${Math.round(((index + 1) / total) * 100)}%`;
      index += 1;
    }
  };

  advance();
  uploadStageTimer = setInterval(advance, 500);
}

function completeUploadStages() {
  clearInterval(uploadStageTimer);
  uploadSteps.querySelectorAll('li').forEach((item) => {
    item.classList.remove('text-slate-400', 'text-slate-100');
    item.classList.add('text-emerald-400');
    const spinner = item.querySelector('.spinner');
    if (spinner) spinner.remove();
  });
  uploadProgressBar.style.width = '100%';
}

function stopUploadStageAnimation() {
  clearInterval(uploadStageTimer);
}

function showUploadMessage(type, text) {
  uploadMessage.textContent = text;
  uploadMessage.className = 'rounded-xl px-4 py-3 text-sm font-medium ' +
    (type === 'success'
      ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-400'
      : 'bg-red-500/10 border border-red-500/40 text-red-400');
}

function addIndexedDocEntry(data) {
  indexedDocs.classList.remove('hidden');
  const entry = document.createElement('li');
  entry.className = 'bg-base-800 border border-base-700 rounded-lg px-3 py-2 flex items-center justify-between';
  entry.innerHTML = `
    <span class="text-slate-200 truncate">${escapeHtml(data.fileName)}</span>
    <span class="text-xs text-slate-500">${data.chunkCount} chunks</span>`;
  indexedDocsList.prepend(entry);
}

// --- Chat panel ---------------------------------------------------------

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatLog = document.getElementById('chat-log');

let chatStageTimer = null;

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;

  clearEmptyState();
  addChatMessage('user', question);
  chatInput.value = '';
  chatSendBtn.disabled = true;

  const typingId = addTypingIndicator();

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await response.json();

    removeTypingIndicator(typingId);

    if (!response.ok) {
      const message = Array.isArray(data.message) ? data.message.join(' ') : data.message;
      addChatMessage('assistant', message || 'Something went wrong.', [], true);
      return;
    }

    addChatMessage('assistant', data.answer, data.sources || [], false, data.confidence);
  } catch (error) {
    removeTypingIndicator(typingId);
    addChatMessage('assistant', 'Could not reach the server. Please try again.', [], true);
  } finally {
    chatSendBtn.disabled = false;
  }
});

function clearEmptyState() {
  const emptyState = chatLog.querySelector('.text-center');
  if (emptyState) emptyState.remove();
}

function addChatMessage(role, text, sources = [], isError = false, confidence = null) {
  const wrapper = document.createElement('div');
  wrapper.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';

  const bubbleColor = role === 'user'
    ? 'bg-accent-500 text-white'
    : isError
      ? 'bg-red-500/10 border border-red-500/40 text-red-300'
      : 'bg-base-800 border border-base-700 text-slate-200';

  const sourcesHtml = sources.length > 0
    ? `<div class="flex flex-wrap gap-1.5 mt-2">${sources
        .map((s) => `<span class="text-xs bg-base-700/60 border border-base-700 rounded-full px-2.5 py-0.5 text-slate-400">${escapeHtml(s)}</span>`)
        .join('')}</div>`
    : '';

  const confidenceHtml = confidence ? confidenceBadgeHtml(confidence) : '';

  wrapper.innerHTML = `
    <div class="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${bubbleColor}">
      ${confidenceHtml}
      <div>${escapeHtml(text).replace(/\n/g, '<br/>')}</div>
      ${sourcesHtml}
    </div>`;

  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function confidenceBadgeHtml(confidence) {
  const styles = {
    high: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400',
    medium: 'bg-amber-500/10 border-amber-500/40 text-amber-400',
    low: 'bg-red-500/10 border-red-500/40 text-red-400',
  };
  const labels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
  const style = styles[confidence] || styles.low;
  const label = labels[confidence] || 'Low confidence';

  return `<div class="inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 mb-2 ${style}">${label}</div>`;
}

function addTypingIndicator() {
  const id = `typing-${Date.now()}`;
  const wrapper = document.createElement('div');
  wrapper.id = id;
  wrapper.className = 'flex justify-start';
  wrapper.innerHTML = `
    <div class="bg-base-800 border border-base-700 rounded-2xl px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
      <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
      <span id="${id}-label" class="ml-1">${CHAT_STAGES[0]}</span>
    </div>`;
  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;

  let stageIndex = 0;
  chatStageTimer = setInterval(() => {
    stageIndex = (stageIndex + 1) % CHAT_STAGES.length;
    const label = document.getElementById(`${id}-label`);
    if (label) label.textContent = CHAT_STAGES[stageIndex];
  }, 900);

  return id;
}

function removeTypingIndicator(id) {
  clearInterval(chatStageTimer);
  const el = document.getElementById(id);
  if (el) el.remove();
}

// Enter to send, Shift+Enter for a new line
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
