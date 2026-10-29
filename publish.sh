#!/usr/bin/env bash
# Push this workshop to its sole destination and configure branch-based Pages.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
readonly repo='hero-ws/hero-ws.github.io'
readonly site_url='https://hero-ws.github.io/'
readonly account='mariomlz99'

command -v gh >/dev/null || { echo 'Install the GitHub CLI (gh) before running this script.' >&2; exit 1; }
[[ "$(git branch --show-current)" == main ]] || { echo 'Switch to main before publishing.' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit your changes before publishing.' >&2; exit 1; }
for remote_kind in fetch push; do
  if [[ "$remote_kind" == push ]]; then
    remote_url="$(git remote get-url --all --push origin)"
  else
    remote_url="$(git remote get-url --all origin)"
  fi
  case "$remote_url" in
    https://github.com/hero-ws/hero-ws.github.io.git|git@github.com:hero-ws/hero-ws.github.io.git) ;;
    *) echo "Refusing to publish: origin must point only to $repo." >&2; exit 1 ;;
  esac
done

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  echo 'Sign in to GitHub as mariomlz99 to push and enable Pages.'
  gh auth login --hostname github.com --git-protocol https --web
fi
[[ "$(gh api user --jq .login)" == "$account" ]] || {
  echo 'The active GitHub CLI account must be mariomlz99. Use gh auth switch, then retry.' >&2
  exit 1
}
[[ "$(gh api "repos/$repo" --jq .permissions.admin)" == true ]] || {
  echo 'Repository admin access is required to enable Pages.' >&2
  exit 1
}

# These credentials apply to this command; no global Git settings are changed.
readonly pushed_sha="$(git rev-parse HEAD)"
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin main

pages_tmp="$(mktemp -d)"
trap 'rm -rf -- "$pages_tmp"' EXIT
if pages_source="$(gh api "repos/$repo/pages" --jq '[.build_type, .source.branch, .source.path] | @tsv' 2>"$pages_tmp/error.txt")"; then
  if [[ "$pages_source" != $'legacy\tmain\t/' ]]; then
    gh api --method PUT "repos/$repo/pages" \
      -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' >/dev/null
  fi
elif grep -q 'HTTP 404' "$pages_tmp/error.txt"; then
  gh api --method POST "repos/$repo/pages" \
    -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' >/dev/null
else
  cat "$pages_tmp/error.txt" >&2
  echo 'The push completed, but Pages configuration could not be read. Retry this script once access is restored.' >&2
  exit 1
fi

echo "GitHub Pages is configured for main / (root). Waiting for deployment of ${pushed_sha:0:7}..."
# The overall Pages status can be stale, or refer only to the build stage.
# Wait for the complete Pages workflow associated with this exact commit.
for attempt in {1..24}; do
  if ! deployment="$(gh api "repos/$repo/actions/runs?head_sha=$pushed_sha&branch=main&per_page=100" \
    --jq '[.workflow_runs[] | select(.path == "dynamic/pages/pages-build-deployment")] | sort_by(.id) | last | if . == null then "" else [.status, (.conclusion // "pending"), .html_url] | @tsv end')"; then
    echo "The push completed, but deployment status could not be read. Check https://github.com/$repo/actions" >&2
    exit 1
  fi
  if [[ -n "$deployment" ]]; then
    IFS=$'\t' read -r run_status run_conclusion run_url <<< "$deployment"
    if [[ "$run_status" == completed ]]; then
      if [[ "$run_conclusion" == success ]]; then
        echo "Published: $site_url"
        echo "Deployment: $run_url"
        exit 0
      fi
      echo "Deployment of ${pushed_sha:0:7} finished with status: $run_conclusion. Check $run_url" >&2
      exit 1
    fi
  fi
  sleep 5
done
echo "The push and Pages configuration are complete. Deployment of ${pushed_sha:0:7} is still pending."
echo "Website once deployment finishes: $site_url"
echo "Build progress: https://github.com/$repo/actions"
