# Node 22 + git + a non-root "node" user, from the official devcontainer images.
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Postgres client (psql) for poking at the database, and the GitHub CLI (gh).
RUN mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install --yes --no-install-recommends postgresql-client gh \
    && rm -rf /var/lib/apt/lists/*

USER node

# Bun: package manager, API runtime, and test runner.
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL=/home/node/.bun
ENV PATH=/home/node/.bun/bin:${PATH}
