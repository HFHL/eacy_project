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
