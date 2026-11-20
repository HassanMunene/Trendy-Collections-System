<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/src/Database.php';

$existing=row('SELECT u.username FROM superadmin_users s JOIN users u ON u.id=s.user_id LIMIT 1');
if ($existing) {
    fwrite(STDOUT,"A superadmin account already exists: {$existing['username']}.\n");
    exit(0);
}
$username=$argv[1]??'superadmin';
$name=$argv[2]??'Trendy Super Admin';
if (!preg_match('/^[a-z][a-z0-9_.-]{2,39}$/i',$username) || trim($name)==='' || mb_strlen($name)>120) {
    fwrite(STDERR,"Usage: php setup-superadmin.php [username] [display name]\n");
    exit(1);
}
if (row('SELECT id FROM users WHERE username=?',[$username])) {
    fwrite(STDERR,"Username already exists. Pass a different username.\n");
    exit(1);
}
$password=bin2hex(random_bytes(16));
$document=__DIR__.'/data/SUPERADMIN-CREDENTIALS.md';
if (file_exists($document)) {
    fwrite(STDERR,"Credential document already exists; move it before creating another superadmin.\n");
    exit(1);
}
$temporary=$document.'.tmp';
$contents="# Trendy Collections — superadmin login\n\n"
    ."Local pilot address: `http://127.0.0.1:8000`\n\n"
    ."- Username: `{$username}`\n- Password: `{$password}`\n\n"
    ."Created: ".date('Y-m-d H:i:s T')."\n\n"
    ."Keep this file private. The superadmin can view business oversight data and perform owner operations. Change this temporary password before real customer data is entered.\n";
if (file_put_contents($temporary,$contents,LOCK_EX)===false || !chmod($temporary,0600)) {
    @unlink($temporary);
    fwrite(STDERR,"Could not save the credential document.\n");
    exit(1);
}
try {
    atomic(function()use($username,$name,$password){
        $id=insert("INSERT INTO users(username,name,role,password_hash) VALUES (?,?,'owner',?)",
            [$username,$name,password_hash($password,PASSWORD_ARGON2ID)]);
        insert('INSERT INTO superadmin_users(user_id) VALUES (?)',[$id]);
        audit($id,'bootstrap','superadmin',$id);
    });
    if (!rename($temporary,$document)) throw new RuntimeException("Account created but credential file could not be finalized; temporary file is at $temporary");
    chmod($document,0600);
    fwrite(STDOUT,"Superadmin created. Credentials are in data/SUPERADMIN-CREDENTIALS.md.\n");
} catch (Throwable $e) {
    if (file_exists($temporary) && !str_contains($e->getMessage(),'Account created')) @unlink($temporary);
    throw $e;
}
