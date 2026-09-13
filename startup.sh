#!/bin/sh
set -eu
cd /workspace
node scripts/preview.mjs stop || true
if [ -x /workspace/engines/build.sh ]; then
  sh /workspace/engines/build.sh >>/tmp/norf-engines.log 2>&1 || true
fi
if [ -x /workspace/engines/bin/extract ]; then
  if ! curl -sf -o /dev/null --max-time 1 http://127.0.0.1:18765/health; then
    /workspace/engines/bin/extract >>/tmp/norf-extract.log 2>&1 &
  fi
fi
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
i=0
while [ "$i" -lt 40 ]; do
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
    exit 0
  fi
  i=$((i + 1))
  sleep 0.25
done
exit 0
