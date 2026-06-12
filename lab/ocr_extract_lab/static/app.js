$('loadBtn').onclick = loadFiles;
$('refreshBtn').onclick = loadFiles;
$('runBtn').onclick = startRun;

loadConfig().then(loadFiles).catch((error) => setStatus(`初始化失败：${error.message}`));
