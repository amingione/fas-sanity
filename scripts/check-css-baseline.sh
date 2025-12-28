#!/usr/bin/env bash
set -euo pipefail

base_sha="${1:-${BASE_SHA:-}}"
head_sha="${2:-${HEAD_SHA:-}}"

if [[ -z "${head_sha}" ]]; then
  head_sha="$(git rev-parse HEAD)"
fi

if [[ -z "${base_sha}" || "${base_sha}" == "0000000000000000000000000000000000000000" ]]; then
  base_sha="$(git rev-parse "${head_sha}^" 2>/dev/null || true)"
fi

if [[ -z "${base_sha}" ]]; then
  base_sha="${head_sha}"
fi

mapfile -t files < <(
  git diff --name-only --diff-filter=ACMRT "${base_sha}" "${head_sha}" -- \
    '*.tsx' '*.jsx' '*.ts' '*.js' '*.astro' '*.html'
)

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "css-baseline: no changed files to check."
  exit 0
fi

font_arbitrary_regex='text-\[(?:[0-9]+(?:\.[0-9]+)?)(?:px|rem|em)\]'
negative_margin_regex='(^|[^A-Za-z0-9_-])-m[trblxy]?-(?:[0-9]+|\[)'
spacing_arbitrary_regex='(^|[^A-Za-z0-9_-])(p[trblxy]?|m[trblxy]?|gap|space-x|space-y)-\[[^]]+\]'

violations=()

check_pattern() {
  local label="$1"
  local pattern="$2"
  local file
  for file in "${files[@]}"; do
    local matches
    matches="$(rg -n --color=never -e "${pattern}" "${file}" || true)"
    if [[ -n "${matches}" ]]; then
      violations+=("[$label] ${file}\n${matches}")
    fi
  done
}

check_pattern "arbitrary-font-size" "${font_arbitrary_regex}"
check_pattern "negative-margin" "${negative_margin_regex}"
check_pattern "arbitrary-spacing" "${spacing_arbitrary_regex}"

if [[ "${#violations[@]}" -gt 0 ]]; then
  echo "CSS baseline violations detected in changed files:"
  printf '%b\n\n' "${violations[@]}"
  echo "Allowed typography: text-body/text-meta/text-caption/h1/h2/h3 (see Tailwind config)."
  echo "Allowed spacing: use the baseline spacing scale; avoid arbitrary values and negative margins."
  exit 1
fi

echo "css-baseline: no violations found."
