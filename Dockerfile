# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 1. Build the React frontend into static files (served by nginx)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# 2. Install PHP dependencies without dev packages
# ---------------------------------------------------------------------------
FROM composer:2 AS vendor
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --no-progress --prefer-dist --optimize-autoloader
COPY backend/ ./
RUN composer dump-autoload --no-dev --optimize --no-scripts

# ---------------------------------------------------------------------------
# 3. Runtime: PHP-FPM + nginx in one container, frontend and API on one origin
# ---------------------------------------------------------------------------
FROM php:8.4-fpm-alpine AS runtime

RUN apk add --no-cache nginx postgresql-dev supervisor tzdata \
    && docker-php-ext-install pdo_pgsql opcache bcmath \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Application code (with production vendor/ and without local .env thanks to .dockerignore)
COPY --from=vendor /app /app

# Built frontend, served from the same public directory as index.php
COPY --from=frontend /app/dist /app/public

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 80
ENTRYPOINT ["entrypoint"]
