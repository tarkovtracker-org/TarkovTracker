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
    corepack prepare pnpm@10.34.5 --activate

    pnpm_version=$(pnpm -v)
    required_pnpm="10.34.5"
    if ! printf '%s\n' "$required_pnpm" "$pnpm_version" | sort -V -C; then
        echo "WARNING: pnpm version $pnpm_version found, but $required_pnpm or higher is recommended"
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

    if [ ! -f .env.local ]; then
        cat > .env.local << 'EOF'
# Supabase Configuration
NUXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NUXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# App Configuration
NUXT_PUBLIC_APP_URL=http://localhost:3000

# Cloudflare Workers (for local development)
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_API_TOKEN=your_api_token_here

# Development
NUXT_PUBLIC_LOG_LEVEL=debug
NODE_ENV=development
EOF
        echo "Created .env.local"
        echo "WARNING: Please update .env.local with your Supabase credentials"
    else
        echo "INFO: .env.local already exists"
    fi
}

main() {
    check_prerequisites
    install_dependencies
    setup_environment

    echo ""
    echo "Development environment setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Update .env.local with your Supabase credentials"
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
