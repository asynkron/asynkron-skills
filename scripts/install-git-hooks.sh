#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

git -C "${repo_root}" config core.hooksPath .githooks
chmod +x "${repo_root}/.githooks/pre-commit"

echo "Installed git hooks for ${repo_root}"
echo "core.hooksPath=$(git -C "${repo_root}" config --get core.hooksPath)"
