#!/bin/bash
# Run as root before activating a release. Do not change existing screenshot permissions.
set -euo pipefail
install -d -o root -g manager-app -m 750 /opt/manager/uploads
install -d -o manager-app -g manager-app -m 700 /opt/manager/uploads/work-screenshots
runuser -u manager-app -- bash -c 'set -euo pipefail; probe=$(mktemp /opt/manager/uploads/work-screenshots/.write-check.XXXXXX); trap '\''rm -f "$probe"'\'' EXIT; printf storage-check > "$probe"; test "$(cat "$probe")" = storage-check'
printf 'Screenshot storage permissions and read/write probe passed.\n'
