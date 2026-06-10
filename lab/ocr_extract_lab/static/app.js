const state = {
  directory: '',
  files: [],
  run: null,
  pollTimer: null,
  activeFieldIndex: null,
  activePageNo: 1,
};

const $ = (id) => document.getElementById(id);

function setStatus(text) {
  $('statusText').textContent = text;
}

function formatBytes(size) {
  if (!Number.isFinite(size)) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail || data.error_message || response.statusText;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
}

async function loadConfig() {
  const data = await api('/api/config');
  state.directory = data.file_dir || '';
  $('dirInput').value = state.directory;
  $('fieldLimitInput').value = data.field_limit || 160;
  $('documentLimitInput').value = 0;
}

async function loadFiles() {
  const dir = $('dirInput').value.trim();
  setStatus('正在读取目录...');
  const data = await api(`/api/files?directory=${encodeURIComponent(dir)}`);
  state.directory = data.directory;
  state.files = data.files || [];
  $('runBtn').disabled = !state.files.length;
  $('selectedTitle').textContent = '整批 OCR 病例抽取';
  renderFiles();
  const cachedCount = state.files.filter((file) => file.ocr_cached).length;
  const metadataCount = state.files.filter((file) => file.metadata_cached).length;
  setStatus(`已读取 ${state.files.length} 个文件，OCR 缓存 ${cachedCount} 个，文档识别 ${metadataCount} 个`);
}

function renderFiles() {
  const root = $('fileList');
  if (!state.files.length) {
    root.className = 'file-list empty-state';
    root.textContent = '目录中没有支持的文件';
    return;
  }
  root.className = 'file-list';
  root.innerHTML = '';
  const docStatus = new Map((state.run?.documents || []).map((doc) => [doc.relative_path, doc]));
  state.files.forEach((file) => {
    const doc = docStatus.get(file.relative_path);
    const status = doc?.status ? ` · ${doc.status}${doc.field_count != null ? ` · ${doc.field_count} 字段` : ''}` : '';
    const type = doc?.doc_subtype || file.doc_subtype || doc?.doc_type || file.doc_type || '未识别';
    const forms = doc?.planned_forms?.length ? ` · ${doc.planned_forms.map((item) => item.target_form_key).join('、')}` : '';
    const skip = doc?.skip_reason ? ` · ${doc.skip_reason}` : '';
    const node = document.createElement('div');
    node.className = 'file-item';
    node.innerHTML = `
      <div class="file-name">${escapeHtml(file.name)}</div>
      <div class="muted">${escapeHtml(file.relative_path)} · ${formatBytes(file.size)} · ${file.ocr_cached ? '已 OCR' : '无 OCR 缓存'} · ${file.metadata_cached || doc?.metadata_status === 'completed' ? '已识别' : '未识别'} · ${escapeHtml(type)}${escapeHtml(status)}${escapeHtml(forms)}${escapeHtml(skip)}</div>
    `;
    root.appendChild(node);
  });
}

async function startRun() {
  if (!state.files.length) return;
  clearPoll();
  $('runBtn').disabled = true;
  setStatus('已创建抽取任务，正在读取 OCR 缓存...');
  $('viewer').className = 'viewer empty-state';
  $('viewer').textContent = '正在抽取...';
  try {
    const payload = {
      directory: state.directory,
      field_query: $('fieldQueryInput').value.trim() || null,
      field_limit: Number($('fieldLimitInput').value || 0) || 0,
      document_limit: Number($('documentLimitInput').value || 0) || 0,
    };
    const run = await api('/api/runs', { method: 'POST', body: JSON.stringify(payload) });
    state.run = run;
    renderRun();
    pollRun(run.run_id);
  } catch (error) {
    $('viewer').className = 'viewer empty-state';
    $('viewer').textContent = `失败：${error.message}`;
    setStatus('执行失败');
    $('runBtn').disabled = false;
  }
}

function pollRun(runId) {
  state.pollTimer = window.setTimeout(async () => {
    try {
      const run = await api(`/api/runs/${runId}`);
      state.run = run;
      renderRun();
      if (run.status === 'running') {
        pollRun(runId);
        return;
      }
      $('runBtn').disabled = false;
      setStatus(run.status === 'completed' ? '抽取完成' : '执行失败');
    } catch (error) {
      setStatus(`轮询失败：${error.message}`);
      $('runBtn').disabled = false;
    }
  }, 2000);
}

function clearPoll() {
  if (state.pollTimer) {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

function renderRun() {
  const run = state.run;
  if (!run) return;
  $('fieldCount').textContent = String(run.fields?.length || 0);
  renderFiles();
  $('ocrText').textContent = run.ocr_text || run.ocr_text_preview || '等待 OCR 缓存读取';
  const progress = run.total_documents ? ` · ${run.completed_documents || 0}/${run.total_documents} 文件` : '';
  $('runMeta').textContent = `${run.run_id} · ${run.status} · ${run.stage || ''}${progress}`;
  renderEvaluation(run.evaluation);
  if (run.status === 'running') {
    setStatus(`运行中：${run.stage || 'queued'}`);
    if (!run.fields?.length) {
      $('fieldsList').className = 'fields-list empty-state';
      $('fieldsList').textContent = `运行中：${run.stage || 'queued'}`;
      $('viewer').className = 'viewer empty-state';
      $('viewer').textContent = `运行中：${run.stage || 'queued'}`;
      return;
    }
  }
  if (run.status === 'failed') {
    $('fieldsList').className = 'fields-list empty-state';
    $('fieldsList').textContent = run.error?.message || '抽取失败';
    $('viewer').className = 'viewer empty-state';
    $('viewer').textContent = run.error?.message || '抽取失败';
    return;
  }
  if (!run.fields?.length) {
    state.activeFieldIndex = null;
  } else if (state.activeFieldIndex == null || state.activeFieldIndex >= run.fields.length) {
    state.activeFieldIndex = 0;
  }
  state.activePageNo = firstFieldPage(run.fields?.[state.activeFieldIndex]) || run.pages?.[0]?.page_no || 1;
  renderPageSelect();
  renderFields();
  renderPage();
}

function renderPageSelect() {
  const select = $('pageSelect');
  const pages = state.run?.pages || [];
  select.innerHTML = '';
  pages.forEach((page) => {
    const option = document.createElement('option');
    option.value = page.page_no;
    option.textContent = `第 ${page.page_no} 页`;
    option.selected = Number(page.page_no) === Number(state.activePageNo);
    select.appendChild(option);
  });
  select.onchange = () => {
    state.activePageNo = Number(select.value || 1);
    renderPage();
  };
}

function renderFields() {
  const list = $('fieldsList');
  const fields = state.run?.fields || [];
  if (!fields.length) {
    list.className = 'fields-list empty-state';
    list.textContent = '没有抽取到字段';
    return;
  }
  list.className = 'fields-list';
  list.innerHTML = '';
  fields.forEach((field, index) => {
    const card = document.createElement('div');
    card.className = `field-card ${index === state.activeFieldIndex ? 'active' : ''}`;
    card.innerHTML = `
      <div class="field-title">${escapeHtml(field.field_title || field.field_key || field.field_path)}</div>
      <div class="field-value">${escapeHtml(displayValue(field))}</div>
      <div class="muted">${escapeHtml(field.field_path)} · confidence ${field.confidence ?? '—'} · ${escapeHtml(field.source_name || '')}</div>
      <div class="quote">${escapeHtml(firstQuote(field) || '无证据文本')}</div>
    `;
    card.onclick = () => {
      state.activeFieldIndex = index;
      state.activePageNo = firstFieldPage(field) || state.activePageNo;
      renderFields();
      renderPageSelect();
      renderPage();
    };
    list.appendChild(card);
  });
}

function renderEvaluation(evaluation) {
  const meta = $('runMeta');
  if (!evaluation) return;
  const fill = evaluation.fill_rate == null ? '—' : `${Math.round(evaluation.fill_rate * 100)}%`;
  const valid = evaluation.format_valid ? '格式 OK' : `格式错误 ${evaluation.format_error_count}`;
  meta.textContent = `${meta.textContent} · 填充率 ${fill} · ${valid}`;
}

function renderPage() {
  const page = (state.run?.pages || []).find((item) => Number(item.page_no) === Number(state.activePageNo));
  const viewer = $('viewer');
  if (!page?.image_url) {
    viewer.className = 'viewer empty-state';
    viewer.textContent = '没有可渲染的 OCR 页图；可查看原文件预览';
    return;
  }
  viewer.className = 'viewer';
  const activeField = state.activeFieldIndex == null ? null : state.run.fields[state.activeFieldIndex];
  const boxes = boxesForPage(state.run.fields || [], state.activePageNo, activeField);
  viewer.innerHTML = `
    <div class="page-stage" id="pageStage">
      <img id="pageImage" src="${page.image_url}" alt="page ${page.page_no}" />
      <div id="boxLayer"></div>
    </div>
  `;
  const image = $('pageImage');
  image.onload = () => drawBoxes(boxes, image);
  if (image.complete) drawBoxes(boxes, image);
}

function drawBoxes(boxes, image) {
  const layer = $('boxLayer');
  if (!layer) return;
  layer.innerHTML = '';
  boxes.forEach((box) => {
    const div = document.createElement('div');
    div.className = `bbox ${box.active ? '' : 'inactive'}`;
    div.style.left = `${box.left}%`;
    div.style.top = `${box.top}%`;
    div.style.width = `${box.width}%`;
    div.style.height = `${box.height}%`;
    layer.appendChild(div);
  });
}

function boxesForPage(fields, pageNo, activeField) {
  const output = [];
  fields.forEach((field) => {
    const isActive = field === activeField;
    (field.locations || []).forEach((loc) => {
      if (Number(loc.page_no) !== Number(pageNo)) return;
      const box = locationToPercentBox(loc);
      if (box) output.push({ ...box, active: isActive });
    });
  });
  return output.sort((a, b) => Number(a.active) - Number(b.active));
}

function locationToPercentBox(loc) {
  const polygon = loc.polygon || loc.textin_position || loc.position;
  if (!Array.isArray(polygon) || polygon.length < 8) return null;
  const xs = [];
  const ys = [];
  for (let i = 0; i < polygon.length; i += 2) {
    xs.push(Number(polygon[i]));
    ys.push(Number(polygon[i + 1]));
  }
  const width = Number(loc.page_width || 1000);
  const height = Number(loc.page_height || 1000);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    left: clamp((minX / width) * 100),
    top: clamp((minY / height) * 100),
    width: clamp(((maxX - minX) / width) * 100),
    height: clamp(((maxY - minY) / height) * 100),
  };
}

function firstFieldPage(field) {
  const loc = field?.locations?.find((item) => item?.page_no);
  return loc ? Number(loc.page_no) : null;
}

function firstQuote(field) {
  return field?.evidences?.find((item) => item?.quote_text)?.quote_text || field?.quote_text;
}

function displayValue(field) {
  for (const key of ['value_text', 'value_number', 'value_date', 'value_datetime', 'value_json']) {
    if (field?.[key] !== undefined && field[key] !== null && field[key] !== '') {
      return typeof field[key] === 'string' ? field[key] : JSON.stringify(field[key]);
    }
  }
  return '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

$('loadBtn').onclick = loadFiles;
$('refreshBtn').onclick = loadFiles;
$('runBtn').onclick = startRun;

loadConfig().then(loadFiles).catch((error) => setStatus(`初始化失败：${error.message}`));
