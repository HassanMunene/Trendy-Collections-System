<?php
declare(strict_types=1);
require __DIR__ . '/src/Database.php';

if ((int)row('SELECT COUNT(*) n FROM users')['n'] > 0) {
    fwrite(STDOUT, "An owner already exists. Create other staff accounts from the app.\n"); exit(0);
}
function ask(string $prompt): string { fwrite(STDOUT,$prompt); return trim((string)fgets(STDIN)); }
$username = ask('Owner username: ');
$name = ask('Owner display name: ');
$password = ask('Owner password (8+ characters; visible while typing): ');
if ($username === '' || $name === '' || strlen($password) < 8) {
    fwrite(STDERR,"Username/name are required and password must have at least 8 characters.\n"); exit(1);
}
insert("INSERT INTO users(username,name,role,password_hash) VALUES (?,?, 'owner', ?)",
    [$username,$name,password_hash($password,PASSWORD_ARGON2ID)]);
fwrite(STDOUT,"Owner account created. Start the app with ./start.sh\n");
