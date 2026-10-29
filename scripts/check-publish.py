"""Exercise the publishing script with fake Git/GitHub commands; no network calls."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
assert shutil.which('jq'), 'Install jq to run the publishing regression checks.'

MOCK = r'''#!/usr/bin/env python3
import json, os, subprocess, sys
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

args = sys.argv[1:]
tool = Path(sys.argv[0]).name
case = os.environ['HERO_MOCK_CASE']
with open(os.environ['HERO_MOCK_LOG'], 'a') as log:
    log.write(json.dumps([tool, *args]) + '\n')
sha = 'a' * 40
repo = 'repos/hero-ws/hero-ws.github.io'

def output(data):
    result = subprocess.run(['jq', '-r', args[args.index('--jq') + 1]], input=json.dumps(data), text=True)
    sys.exit(result.returncode)

if tool == 'sleep':
    sys.exit(0)
if tool == 'git':
    if args == ['branch', '--show-current']:
        print('main')
    elif args == ['status', '--porcelain']:
        if case == 'dirty': print(' M index.html')
    elif args[:2] == ['remote', 'get-url']:
        wrong = case == 'wrong-remote' or (case == 'wrong-push' and '--push' in args)
        print('https://github.com/' + ('elsewhere/other' if wrong else 'hero-ws/hero-ws.github.io') + '.git')
    elif args == ['rev-parse', 'HEAD']:
        print(sha)
    elif 'push' in args and 'main' in args:
        pass
    else:
        raise AssertionError(args)
elif args == ['auth', 'status', '--hostname', 'github.com']:
    pass
elif args[:2] == ['api', 'user']:
    output({'login': 'mariomlz99'})
elif args[:2] == ['api', repo]:
    output({'permissions': {'admin': True}})
elif args[:3] in (['api', '--method', 'POST'], ['api', '--method', 'PUT']):
    assert args[3] == repo + '/pages'
elif args[:2] == ['api', repo + '/pages']:
    if case in ('new', 'pages-error'):
        print('gh: error (HTTP ' + ('404' if case == 'new' else '500') + ')', file=sys.stderr)
        sys.exit(1)
    # Reproduce the misleading overall error even while the deployment succeeds.
    output({'status': 'errored', 'build_type': 'legacy', 'source': {'branch': 'old' if case == 'reconfigure' else 'main', 'path': '/'}})
elif len(args) > 1 and args[1].startswith(repo + '/actions/runs?'):
    query = parse_qs(urlsplit(args[1]).query)
    assert query['head_sha'] == [sha] and query['branch'] == ['main']
    counter = Path(os.environ['HERO_MOCK_LOG'] + '.count')
    poll = int(counter.read_text()) + 1 if counter.exists() else 1
    counter.write_text(str(poll))
    if case == 'actions-error':
        print('gh: connection interrupted', file=sys.stderr)
        sys.exit(1)
    status, conclusion = 'completed', 'success'
    if case == 'delayed':
        status, conclusion = [('queued', None), ('in_progress', None), ('completed', 'success')][min(poll - 2, 2)]
    if case in ('failure', 'cancelled'):
        conclusion = case
    runs = [{'id': 10, 'head_sha': sha, 'path': 'dynamic/pages/pages-build-deployment', 'status': status, 'conclusion': conclusion, 'html_url': 'https://github.com/hero-ws/hero-ws.github.io/actions/runs/10'}]
    if case == 'pending' or (case == 'delayed' and poll == 1):
        runs = []
    # An unrelated successful workflow must never be mistaken for deployment.
    runs.append({'id': 100, 'head_sha': sha, 'path': '.github/workflows/lint.yml', 'status': 'completed', 'conclusion': 'success'})
    # The previous commit's result is excluded by the head_sha query above.
    output({'workflow_runs': runs})
else:
    raise AssertionError(args)
'''

with TemporaryDirectory(prefix='hero-publish-check-') as temporary:
    directory = Path(temporary)
    for name in ('git', 'gh', 'sleep'):
        command = directory / name
        command.write_text(MOCK)
        command.chmod(0o755)
    for case in ('existing', 'new', 'reconfigure', 'delayed', 'pending', 'failure', 'cancelled', 'pages-error', 'actions-error', 'wrong-remote', 'wrong-push', 'dirty'):
        log = directory / (case + '.jsonl')
        env = os.environ | {'PATH': str(directory) + os.pathsep + os.environ['PATH'], 'HERO_MOCK_CASE': case, 'HERO_MOCK_LOG': str(log)}
        result = subprocess.run(['bash', str(ROOT / 'publish.sh')], env=env, text=True, capture_output=True, timeout=20)
        events = [json.loads(line) for line in log.read_text().splitlines()]
        mutations = [e for e in events if e[:3] == ['gh', 'api', '--method']]
        pushes = [e for e in events if e[0] == 'git' and 'push' in e and 'main' in e]
        if case in ('existing', 'new', 'reconfigure', 'delayed'):
            assert result.returncode == 0, (case, result.stderr)
            assert 'Published: https://hero-ws.github.io/' in result.stdout
            assert len(pushes) == 1
            if case in ('new', 'reconfigure'):
                assert len(mutations) == 1 and mutations[0][3] == ('POST' if case == 'new' else 'PUT')
                assert events.index(pushes[0]) < events.index(mutations[0])
            else:
                assert not mutations
            if case == 'delayed':
                assert Path(str(log) + '.count').read_text() == '4'
        else:
            assert 'Published:' not in result.stdout
            assert not mutations
            if case == 'pending':
                assert result.returncode == 0 and 'still pending' in result.stdout
            else:
                assert result.returncode != 0
            if case in ('failure', 'cancelled'):
                assert f'finished with status: {case}' in result.stderr
                assert '/actions/runs/10' in result.stderr
            if case == 'actions-error':
                assert 'deployment status could not be read' in result.stderr
            if case in ('wrong-remote', 'wrong-push', 'dirty'):
                assert not pushes

print('PASS: deployment polling waits for the pushed commit, ignores stale Pages status and unrelated workflows, handles pending/failed/cancelled runs and API errors, preserves correct Pages settings, and rejects unsafe publish inputs. No network actions performed.')
