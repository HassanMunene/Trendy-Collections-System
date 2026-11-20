<?php
declare(strict_types=1);
ini_set('session.use_strict_mode','1');
$sessionDir=dirname(__DIR__).'/data/sessions';
if (!is_dir($sessionDir)) mkdir($sessionDir,0700,true);
ini_set('session.save_path',$sessionDir);
session_name('trendy_session');
session_set_cookie_params(['httponly'=>true,'secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off','samesite'=>'Strict','path'=>'/']);
session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(24));
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH) ?: '/';
if (str_starts_with($path,'/api/')) {
    try { require __DIR__ . '/../src/Api.php'; api($path,$_SERVER['REQUEST_METHOD']); }
    catch (ApiFailure $e) { reply(['error'=>$e->getMessage()],$e->status); }
    catch (PDOException $e) {
        if (str_contains($e->getMessage(),'UNIQUE constraint failed')) reply(['error'=>'That code or reference already exists'],409);
        error_log((string)$e); reply(['error'=>'Database error'],500);
    }
    catch (Throwable $e) { error_log((string)$e); reply(['error'=>'Server error'],500); }
}
if (preg_match('#^/print/order/(\d+)$#',$path,$printMatch)) {
    try {
        require __DIR__ . '/../src/Api.php';
        require_user();
        $order=order_detail((int)$printMatch[1]);
        if ($order['status']!=='confirmed') bad(409,'Confirm the order before printing a workroom card');
        require __DIR__ . '/print_order.php';
    } catch (ApiFailure $e) {
        http_response_code($e->status);
        header('Content-Type: text/plain; charset=utf-8');
        echo $e->getMessage();
    }
    exit;
}
if (preg_match('#^/print/roll/(\d+)$#',$path,$printMatch)) {
    try {
        require __DIR__ . '/../src/Api.php';
        require_user();
        $roll=row('SELECT r.*,f.code,f.category,f.material_type,f.texture,f.color,f.design,f.width_cm FROM rolls r JOIN fabrics f ON f.id=r.fabric_id WHERE r.id=?',[(int)$printMatch[1]]);
        if (!$roll) bad(404,'Roll not found');
        require __DIR__ . '/print_roll.php';
    } catch (ApiFailure $e) {
        http_response_code($e->status);
        header('Content-Type: text/plain; charset=utf-8');
        echo $e->getMessage();
    }
    exit;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="csrf-token" content="<?=htmlspecialchars($_SESSION['csrf'],ENT_QUOTES)?>">
<title>Trendy Collections</title><link rel="stylesheet" href="/assets/style.css?v=<?=filemtime(__DIR__.'/assets/style.css')?>"></head>
<body><div id="app"></div><script type="module" src="/assets/app.js?v=<?=filemtime(__DIR__.'/assets/app.js')?>"></script></body></html>
