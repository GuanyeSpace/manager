#!/bin/sh
set -eu
umask 077
mkdir -p /var/backups/manager
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="/var/backups/manager/manager-$stamp.dump"
docker compose -p manager -f /opt/manager/compose.yml exec -T db pg_dump -U manager -d manager -Fc > "$archive.tmp"
mv "$archive.tmp" "$archive"
screenshots="/var/backups/manager/manager-$stamp.screenshots.tar.gz"
if [ -d /opt/manager/uploads/work-screenshots ]; then
  tar -czf "$screenshots.tmp" -C /opt/manager/uploads work-screenshots
  mv "$screenshots.tmp" "$screenshots"
fi
find /var/backups/manager -name 'manager-*.dump' -mtime +14 -delete
find /var/backups/manager -name 'manager-*.screenshots.tar.gz' -mtime +14 -delete
