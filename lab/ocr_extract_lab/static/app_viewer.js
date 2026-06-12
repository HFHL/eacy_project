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
