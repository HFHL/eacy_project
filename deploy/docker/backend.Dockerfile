ARG PYTHON_IMAGE=docker.m.daocloud.io/library/python:3.11.7-slim
FROM ${PYTHON_IMAGE} AS runtime

ARG APT_MIRROR=https://mirrors.aliyun.com
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
ARG POETRY_VERSION=1.8.5
ARG POETRY_PLUGIN_EXPORT_VERSION=1.8.0

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    POETRY_VIRTUALENVS_CREATE=false

WORKDIR /app/backend

RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i \
          -e "s|http://deb.debian.org/debian|${APT_MIRROR}/debian|g" \
          -e "s|http://deb.debian.org/debian-security|${APT_MIRROR}/debian-security|g" \
          /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip install "poetry==${POETRY_VERSION}" "poetry-plugin-export==${POETRY_PLUGIN_EXPORT_VERSION}"

COPY backend/pyproject.toml backend/poetry.lock ./
RUN poetry export --only main --without-hashes --format=requirements.txt --output=/tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt \
    && rm -f /tmp/requirements.txt

COPY backend/ ./

RUN useradd --create-home --shell /usr/sbin/nologin eacy \
    && chown -R eacy:eacy /app

USER eacy

ENV ENV=prod \
    DEBUG=false

EXPOSE 8000

CMD ["gunicorn", "app.server:app", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "--workers", "2", "--timeout", "180"]
