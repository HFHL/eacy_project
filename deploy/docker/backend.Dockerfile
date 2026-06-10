ARG PYTHON_IMAGE=docker.m.daocloud.io/library/python:3.11.7-slim
FROM ${PYTHON_IMAGE} AS runtime

ARG APT_MIRROR=https://mirrors.aliyun.com
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
ARG POETRY_VERSION=1.8.5
ARG POETRY_PLUGIN_EXPORT_VERSION=1.8.0
ARG INSTALL_CLAUDE_CODE=false
ARG CLAUDE_CODE_CLI_SOURCE=anthropic
ARG CC_HAHA_ARCHIVE_URL=https://codeload.github.com/NanmiCoder/cc-haha/tar.gz/refs/heads/main
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PIP_DEFAULT_TIMEOUT=180
ARG PIP_RETRIES=10

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_DEFAULT_TIMEOUT=${PIP_DEFAULT_TIMEOUT} \
    PIP_RETRIES=${PIP_RETRIES} \
    POETRY_VIRTUALENVS_CREATE=false \
    BUN_INSTALL=/opt/bun \
    PATH="/opt/bun/bin:${PATH}"

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
    && pip install --retries "${PIP_RETRIES}" --default-timeout "${PIP_DEFAULT_TIMEOUT}" \
        "poetry==${POETRY_VERSION}" \
        "poetry-plugin-export==${POETRY_PLUGIN_EXPORT_VERSION}"

RUN if [ "${INSTALL_CLAUDE_CODE}" = "true" ]; then \
        apt-get update \
        && if [ "${CLAUDE_CODE_CLI_SOURCE}" = "cc-haha" ]; then \
            apt-get install -y --no-install-recommends bash ca-certificates curl git ripgrep unzip \
            && rm -rf /var/lib/apt/lists/* \
            && arch="$(dpkg --print-architecture)" \
            && case "${arch}" in \
                arm64) bun_target="bun-linux-aarch64" ;; \
                amd64) bun_target="bun-linux-x64" ;; \
                *) echo "Unsupported Bun architecture: ${arch}" >&2; exit 1 ;; \
            esac \
            && curl --http1.1 --retry 5 --retry-all-errors --connect-timeout 30 -fsSL \
                "https://github.com/oven-sh/bun/releases/latest/download/${bun_target}.zip" \
                -o /tmp/bun.zip \
            && unzip -q /tmp/bun.zip -d /tmp/bun \
            && mkdir -p /opt/bun/bin \
            && mv "/tmp/bun/${bun_target}/bun" /opt/bun/bin/bun \
            && chmod +x /opt/bun/bin/bun \
            && mkdir -p /opt/cc-haha \
            && curl -fsSL "${CC_HAHA_ARCHIVE_URL}" -o /tmp/cc-haha.tar.gz \
            && tar -xzf /tmp/cc-haha.tar.gz --strip-components=1 -C /opt/cc-haha \
            && cd /opt/cc-haha \
            && npm_config_registry="${NPM_REGISTRY}" bun install \
            && printf '%s\n' '#!/usr/bin/env bash' 'export BUN_INSTALL=/opt/bun' 'export PATH="/opt/bun/bin:$PATH"' 'exec /opt/cc-haha/bin/claude-haha "$@"' > /usr/local/bin/claude-haha \
            && chmod +x /usr/local/bin/claude-haha; \
        else \
            apt-get install -y --no-install-recommends nodejs npm \
            && npm config set registry "${NPM_REGISTRY}" \
            && npm install -g @anthropic-ai/claude-code; \
        fi \
        && rm -rf /var/lib/apt/lists/* /root/.npm /root/.bun/install/cache /tmp/bun /tmp/bun.zip /tmp/cc-haha.tar.gz; \
    fi

COPY backend/pyproject.toml backend/poetry.lock ./
RUN poetry export --only main --without-hashes --format=requirements.txt --output=/tmp/requirements.txt \
    && pip install --retries "${PIP_RETRIES}" --default-timeout "${PIP_DEFAULT_TIMEOUT}" -r /tmp/requirements.txt \
    && rm -f /tmp/requirements.txt

COPY backend/ ./

# Backend code resolves these schemas at runtime via parents[3] -> /app/.
COPY meta_data.json ehr_schema.json /app/

RUN useradd --create-home --shell /usr/sbin/nologin eacy \
    && chown -R eacy:eacy /app

USER eacy

ENV ENV=prod \
    DEBUG=false

EXPOSE 8000

CMD ["gunicorn", "app.server:app", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "--workers", "2", "--timeout", "180"]
