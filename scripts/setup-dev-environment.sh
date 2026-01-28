#!/bin/bash

set -euo pipefail

echo "🚀 Setting up TarkovTracker development environment..."

check_prerequisites() {
    echo "Checking prerequisites..."

    commands=("git" "node" "npm")
    for cmd in "${commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            echo "❌ $cmd is not installed"
            exit 1
        fi
    done

    node_version=$(node -v | cut -d'v' -f2)
    required_version="24.12.0"

    if ! printf '%s\n' "$required_version" "$node_version" | sort -V -C; then
        echo "⚠️  Node.js version $node_version found, but $required_version or higher is recommended"
    fi

    echo "✅ All prerequisites installed"
}

install_dependencies() {
    echo "Installing dependencies..."
    npm ci

    echo "Installing git hooks..."
    npm install -D husky @commitlint/cli @commitlint/config-conventional
    npx husky install
    chmod +x .husky/*
}

setup_environment() {
    echo "Setting up environment variables..."

    if [ ! -f .env.local ]; then
        cat > .env.local << 'EOF'
# Supabase Configuration
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# App Configuration
NUXT_PUBLIC_APP_URL=http://localhost:3000
NUXT_PUBLIC_TEAM_GATEWAY_URL=http://localhost:8787
NUXT_PUBLIC_TOKEN_GATEWAY_URL=http://localhost:8788

# Cloudflare Workers (for local development)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# Development
VITE_LOG_LEVEL=debug
NODE_ENV=development
EOF
        echo "✅ Created .env.local"
        echo "⚠️  Please update .env.local with your Supabase credentials"
    else
        echo "ℹ️  .env.local already exists"
    fi
}

setup_workers() {
    echo "Setting up Cloudflare Workers..."

    for worker in workers/*/; do
        if [ -f "$worker/package.json" ]; then
            echo "Installing dependencies for $(basename "$worker")..."
            (cd "$worker" && npm ci)
        fi
    done
}

main() {
    check_prerequisites
    install_dependencies
    setup_environment
    setup_workers

    echo ""
    echo "✅ Development environment setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Update .env.local with your Supabase credentials"
    echo "2. Run 'npm run dev' to start the development server"
    echo "3. Visit http://localhost:3000"
    echo ""
    echo "For workers development:"
    echo "  cd workers/api-gateway && npm run dev"
}

main
