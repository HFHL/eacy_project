# EACY Local Manual Commands

以下命令都在 Windows PowerShell 中执行。当前方案不启动 Docker，要求本地 MySQL 和 Redis 已经可用。

## 1. 进入项目根目录

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
```

## 2. 检查 Redis 是否可用

```powershell
$client = New-Object System.Net.Sockets.TcpClient
$iar = $client.BeginConnect('127.0.0.1', 6379, $null, $null)
$ok = $iar.AsyncWaitHandle.WaitOne(2000, $false)
if ($ok) { $client.EndConnect($iar); 'Redis TcpConnect=OK' } else { 'Redis TcpConnect=TIMEOUT' }
$client.Close()
```

## 3. 检查 MySQL 是否可用

```powershell
$client = New-Object System.Net.Sockets.TcpClient
$iar = $client.BeginConnect('127.0.0.1', 3306, $null, $null)
$ok = $iar.AsyncWaitHandle.WaitOne(2000, $false)
if ($ok) { $client.EndConnect($iar); 'MySQL TcpConnect=OK' } else { 'MySQL TcpConnect=TIMEOUT' }
$client.Close()
```

## 4. 清理前后端端口

后端默认端口：

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

前端默认端口：

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

## 5. 执行数据库迁移

如果你使用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run alembic upgrade head
```

如果你直接使用当前 Python 环境：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
alembic upgrade head
```

## 6. 启动后端 API

新开一个 PowerShell 窗口。

使用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run python main.py --env local --debug
```

不用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
python main.py --env local --debug
```

访问地址：

```text
http://localhost:8000
```

## 7. 启动 Celery Worker

新开一个 PowerShell 窗口。

使用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
poetry run celery -A app.workers.celery_app.celery_app worker -Q ocr,metadata,extraction --loglevel=info --pool=solo
```

不用 Poetry：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project\backend
celery -A app.workers.celery_app.celery_app worker -Q ocr,metadata,extraction --loglevel=info --pool=solo
```

## 8. 启动前端

新开一个 PowerShell 窗口。

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
npm run dev
```

访问地址：

```text
http://localhost:5173
```

## 9. 手动触发 OCR

后端和 Celery 都启动后，上传文档，再调用：

```text
POST http://localhost:8000/api/v1/documents/{document_id}/ocr
```

如果希望上传后自动入队，在 `.env` 中设置：

```env
DOCUMENT_OCR_AUTO_ENQUEUE=true
```

## 10. 一键脚本启动

如果后续仍想用脚本启动，但不启动 Docker：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
npm run start:all -- -SkipDocker
```

跳过数据库迁移：

```powershell
cd C:\Users\Administrator\Desktop\code\eacy_project
npm run start:all -- -SkipDocker -SkipMigrate
```
