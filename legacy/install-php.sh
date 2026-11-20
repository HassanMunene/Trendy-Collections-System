#!/usr/bin/env bash
set -euo pipefail

# Run from a normal terminal on the host machine. This needs sudo and working internet.
sudo apt-get update
sudo apt-get install -y \
  php-cli php-mbstring php-xml php-curl php-zip php-sqlite3 php-pgsql php-intl \
  composer unzip

php --version | head -n 2
composer --version
php -m | grep -E '^(curl|intl|mbstring|pdo_sqlite|pgsql|xml|zip)$' || true
