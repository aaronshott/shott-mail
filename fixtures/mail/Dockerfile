FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends postfix dovecot-imapd dovecot-lmtpd python3 openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . /fixture
CMD ["python3", "/fixture/start.py"]
