FROM python:3.12-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim

WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .

RUN mkdir -p data && adduser --disabled-password --gecos "" appuser && chown -R appuser /app && chmod +x entrypoint.sh

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
