# EACY 生产部署

当前生产部署目标：

- 前端：`frontend_new/dist` 静态文件由 Nginx 托管。
- 后端：`eacy-backend.service`，监听 `127.0.0.1:8000`。
- Celery：按队列拆为 `ocr`、`metadata`、`extraction` 三个 systemd 服务。
- Redis/数据库：作为独立依赖服务，应用通过 `.env` 连接。
- Celery broker/result 在 systemd 中覆盖为 Redis DB 11/12，避免和同机其他 Celery 项目共享 DB 1/2。

## 构建前端

```bash
cd /data/eacy/eacy_project
npm run build -w xidong-crf-prototype-new
```

构建产物：

```text
frontend_new/dist
```

## 安装 systemd 和 Nginx 配置

```bash
cd /data/eacy/eacy_project
sudo bash deploy/production/install-systemd-nginx.sh
```

安装内容：

```text
/etc/systemd/system/eacy-backend.service
/etc/systemd/system/eacy-celery-ocr.service
/etc/systemd/system/eacy-celery-metadata.service
/etc/systemd/system/eacy-celery-extraction.service
/etc/nginx/sites-available/eacy.conf
/etc/nginx/sites-enabled/eacy.conf
```

## 管理服务

```bash
systemctl status eacy-backend
systemctl status eacy-celery-ocr
systemctl status eacy-celery-metadata
systemctl status eacy-celery-extraction
systemctl status nginx
```

重启：

```bash
systemctl restart eacy-backend
systemctl restart eacy-celery-ocr eacy-celery-metadata eacy-celery-extraction
systemctl reload nginx
```

日志：

```bash
journalctl -u eacy-backend -f
journalctl -u eacy-celery-ocr -f
journalctl -u eacy-celery-metadata -f
journalctl -u eacy-celery-extraction -f
tail -f /var/log/nginx/eacy.access.log
tail -f /var/log/nginx/eacy.error.log
```

## 重要说明

当前 unit 配置是保守初始值：

- 后端 `uvicorn --workers 2`
- OCR worker `--concurrency=1`
- Metadata worker `--concurrency=1`
- Extraction worker `--concurrency=2`

如果数据库连接数或外部 LLM/OCR API 压力仍偏高，优先降低 Celery 并发，而不是增加后端 worker。
