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
