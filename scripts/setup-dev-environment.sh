#!/bin/bash

set -euo pipefail

echo "Setting up TarkovTracker development environment..."

check_prerequisites() {
    echo "Checking prerequisites..."

    commands=("git" "node" "corepack")
    for cmd in "${commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            echo "ERROR: $cmd is not installed"
            exit 1
        fi
    done

    node_version=$(node -v | cut -d'v' -f2)
    if [ -f .nvmrc ]; then
        required_version=$(tr -d 'v' < .nvmrc)
    else
        required_version="24.12.0"
    fi

    if ! printf '%s\n' "$required_version" "$node_version" | sort -V -C; then
        echo "WARNING: Node.js version $node_version found, but $required_version or higher is recommended"
    fi

    corepack enable

    required_pnpm="$(
        node -e "
            const packageJson = require('./package.json');
            const pm = packageJson.packageManager;
            if (typeof pm !== 'string') {
                console.error('ERROR: packageManager field is missing or not a string in package.json');
                process.exit(1);
            }
            const match = pm.match(/^pnpm@([^+]+)/);
            if (!match) {
                console.error('ERROR: packageManager field does not match pnpm@<version>');
                process.exit(1);
            }
            process.stdout.write(match[1]);
        "
    )"

    actual_pnpm="$(pnpm --version)"

    if [ "$actual_pnpm" != "$required_pnpm" ]; then
        echo "ERROR: Expected pnpm $required_pnpm, but found $actual_pnpm"
        echo "  Run: corepack prepare pnpm@$required_pnpm --activate"
        exit 1
    fi

    echo "All prerequisites installed"
}

install_dependencies() {
    echo "Installing dependencies..."
    pnpm install --frozen-lockfile

    echo "Setting up git hooks..."
    pnpm exec husky
    find .husky -maxdepth 1 -type f -name '[!_]*' -exec chmod +x {} \;
}

setup_environment() {
    echo "Setting up environment variables..."

    local env_file=".env"
    local legacy_env_file=".env.local"
    local env_example=".env.example"

    # Reject paths that exist but are not regular files (e.g. directories).
    for f in "$env_file" "$legacy_env_file" "$env_example"; do
        if [ -e "$f" ] && [ ! -f "$f" ]; then
            echo "ERROR: $f exists but is not a regular file"
            exit 1
        fi
    done

    # Never overwrite a contributor's existing configuration.
    if [ -f "$env_file" ]; then
        if [ -f "$legacy_env_file" ]; then
            echo "INFO: Both $env_file and $legacy_env_file exist; Nuxt will use $env_file for pnpm run dev"
        else
            echo "INFO: $env_file already exists; leaving it unchanged"
        fi
        return
    fi

    # Migrate files created by older versions of this setup script.
    if [ -f "$legacy_env_file" ]; then
        mv "$legacy_env_file" "$env_file"
        echo "Migrated legacy $legacy_env_file to $env_file"
        echo "WARNING: Review $env_file and add your Supabase credentials"
        return
    fi

    if [ ! -f "$env_example" ]; then
        echo "ERROR: $env_example was not found"
        exit 1
    fi

    cp "$env_example" "$env_file"
    echo "Created $env_file from $env_example"
    echo "WARNING: Review $env_file and add your Supabase credentials"
}

main() {
    check_prerequisites
    install_dependencies
    setup_environment

    echo ""
    echo "Development environment setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Update .env with your Supabase credentials if you need login or sync"
    echo "2. Run 'pnpm run dev' to start the development server"
    echo "3. Visit http://localhost:3000"
    echo ""
    echo "For workers development:"
    echo "  pnpm --filter api-gateway run dev"
    echo ""
    echo "For CI/CD (maintainers):"
    echo "  Configure these GitHub secrets:"
    echo "    CLOUDFLARE_API_TOKEN  - Cloudflare API token"
    echo "    CLOUDFLARE_ACCOUNT_ID - Cloudflare account ID"
    echo "    DISCORD_WEBHOOK       - Discord notifications (optional)"
    echo "    GITLEAKS_LICENSE      - Gitleaks license key (optional)"
}

main
