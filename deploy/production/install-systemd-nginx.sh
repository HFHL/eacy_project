#!/usr/bin/env bash
set -euo pipefail

ROOT="/data/eacy/eacy_project"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 执行：sudo bash deploy/production/install-systemd-nginx.sh" >&2
  exit 1
fi

install -m 0644 "${ROOT}/deploy/production/systemd/eacy-backend.service" /etc/systemd/system/eacy-backend.service
install -m 0644 "${ROOT}/deploy/production/systemd/eacy-celery-ocr.service" /etc/systemd/system/eacy-celery-ocr.service
install -m 0644 "${ROOT}/deploy/production/systemd/eacy-celery-metadata.service" /etc/systemd/system/eacy-celery-metadata.service
install -m 0644 "${ROOT}/deploy/production/systemd/eacy-celery-extraction.service" /etc/systemd/system/eacy-celery-extraction.service

install -m 0644 "${ROOT}/deploy/production/nginx/eacy.conf" /etc/nginx/sites-available/eacy.conf
ln -sfn /etc/nginx/sites-available/eacy.conf /etc/nginx/sites-enabled/eacy.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl daemon-reload
systemctl enable eacy-backend eacy-celery-ocr eacy-celery-metadata eacy-celery-extraction
systemctl restart eacy-backend eacy-celery-ocr eacy-celery-metadata eacy-celery-extraction
systemctl reload nginx || systemctl restart nginx

systemctl --no-pager --lines=20 status eacy-backend eacy-celery-ocr eacy-celery-metadata eacy-celery-extraction nginx
