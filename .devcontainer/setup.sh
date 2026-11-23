#!/usr/bin/env bash
# Instala Solana CLI (Agave 3.0.x, platform-tools v1.51) + Anchor CLI 0.32.1 + dependencias JS.
set -euo pipefail

sudo apt-get update -y && sudo apt-get install -y pkg-config libudev-dev build-essential

sh -c "$(curl -sSfL https://release.anza.xyz/v3.0.10/install)"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.32.1 && avm use 0.32.1

command -v yarn >/dev/null || npm install -g yarn
yarn install
(cd web && npm install --legacy-peer-deps)

solana config set --url devnet
[ -f ~/.config/solana/id.json ] || solana-keygen new --no-bip39-passphrase -s -o ~/.config/solana/id.json
echo "Listo. Wallet: $(solana address)"
