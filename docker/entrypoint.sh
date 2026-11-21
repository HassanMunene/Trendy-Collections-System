#!/bin/sh
set -e

cd /app

if [ -z "$APP_KEY" ]; then
    echo "ERROR: APP_KEY is not set. Generate one with: php artisan key:generate --show" >&2
    exit 1
fi

mkdir -p storage/app/public/avatars storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

# Serve uploaded profile photos from /storage/... (safe to repeat on every start).
php artisan storage:link --quiet || true

# Discover packages (sanctum, tinker...) and cache config/routes/views for production speed.
php artisan package:discover --ansi
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Safe to run on every start: already-applied migrations are skipped.
php artisan migrate --force

# Idempotent: creates the superadmin from SUPERADMIN_* once, leaves it alone afterwards.
php artisan trendy:ensure-superadmin

exec supervisord -c /etc/supervisord.conf
