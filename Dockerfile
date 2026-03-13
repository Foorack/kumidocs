FROM oven/bun:latest

# Install git so KumiDocs can push/pull/rebase using the native binary.
# This enables all standard auth methods: SSH keys, SSH agent, ~/.git-credentials,
# and any credential helper configured in the mounted repository's git config.
RUN apt-get update && apt-get install -y git --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
CMD ["bun", "run", "src/index.ts"]
