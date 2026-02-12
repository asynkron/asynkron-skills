#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "${repo_root}"

required_files=(
  "AGENTS.md"
  ".github/copilot-instructions.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "${file}" ]]; then
    echo "Missing required file: ${file}" >&2
    exit 1
  fi
done

if [[ ! -d "skills" ]]; then
  echo "Missing required directory: skills" >&2
  exit 1
fi

if [[ ! -d ".cursor/rules" ]]; then
  echo "Missing required directory: .cursor/rules" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

extract_skill_names() {
  sed -E 's#skills/([[:alnum:]-]+)/SKILL\.md#\1#' | sort -u
}

find skills -mindepth 1 -maxdepth 1 -type d -exec basename "{}" \; | sort -u > "${tmp_dir}/actual"
grep -oE 'skills/[[:alnum:]-]+/SKILL\.md' AGENTS.md | extract_skill_names > "${tmp_dir}/agents"
find .cursor/rules -maxdepth 1 -type f -name '*.md' -exec basename "{}" .md \; | sort -u > "${tmp_dir}/cursor"
grep -oE 'skills/[[:alnum:]-]+/SKILL\.md' .github/copilot-instructions.md | extract_skill_names > "${tmp_dir}/copilot"

failed=0

compare_sets() {
  local label_a="$1"
  local file_a="$2"
  local label_b="$3"
  local file_b="$4"
  local diff_file="${tmp_dir}/diff"

  if ! diff -u "${file_a}" "${file_b}" > "${diff_file}"; then
    echo "Mismatch between ${label_a} and ${label_b}:"
    cat "${diff_file}"
    echo
    failed=1
  fi
}

compare_sets "skills/" "${tmp_dir}/actual" "AGENTS.md" "${tmp_dir}/agents"
compare_sets "skills/" "${tmp_dir}/actual" ".cursor/rules/" "${tmp_dir}/cursor"
compare_sets "skills/" "${tmp_dir}/actual" ".github/copilot-instructions.md" "${tmp_dir}/copilot"

if [[ "${failed}" -eq 1 ]]; then
  echo "Skill index consistency check failed." >&2
  exit 1
fi

echo "Skill index consistency check passed."
