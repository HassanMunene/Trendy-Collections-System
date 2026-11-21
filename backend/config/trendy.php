<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Bootstrap superadmin
    |--------------------------------------------------------------------------
    |
    | The superadmin that is created automatically on deploy. docker/entrypoint.sh
    | runs `php artisan trendy:ensure-superadmin` on every start, so a fresh
    | database is never left without an oversight account. Leave the username or
    | password empty to skip automatic creation.
    |
    */

    'superadmin' => [
        'name' => env('SUPERADMIN_NAME', 'Super Admin'),
        'username' => env('SUPERADMIN_USERNAME'),
        'phone' => env('SUPERADMIN_PHONE'),
        'password' => env('SUPERADMIN_PASSWORD'),
    ],

];
