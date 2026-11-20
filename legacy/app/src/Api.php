<?php
declare(strict_types=1);
require_once __DIR__ . '/Database.php';

final class ApiFailure extends RuntimeException {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}
function bad(int $status, string $message): never { throw new ApiFailure($status,$message); }
function reply(mixed $data, int $status = 200): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store'); echo json_encode($data,JSON_THROW_ON_ERROR); exit;
}
function input(): array {
    if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) bad(415,'JSON required');
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 64000) bad(413,'Request too large');
    try { $data = json_decode($raw,true,32,JSON_THROW_ON_ERROR); }
    catch (JsonException) { bad(400,'Invalid JSON'); }
    if (!is_array($data)) bad(400,'JSON object required'); return $data;
}
function text_value(array $d,string $key,int $max=120): string {
    $value=$d[$key]??null;
    if (!is_string($value) || trim($value)==='' || mb_strlen(trim($value))>$max) bad(400,"$key is required (max $max characters)");
    return trim($value);
}
function optional_text(array $d,string $key,int $max=120): string {
    $value=$d[$key]??'';
    if (!is_string($value) || mb_strlen(trim($value))>$max) bad(400,"Invalid $key");
    return trim($value);
}
function number_value(array $d,string $key,int $min=0): int {
    $value=$d[$key]??null;
    if (!is_int($value) || $value<$min) bad(400,"$key must be an integer of at least $min");
    return $value;
}
function allowed(array $d,string $key,array $values): string {
    $value=$d[$key]??null;
    if (!is_string($value) || !in_array($value,$values,true)) bad(400,"Invalid $key");
    return $value;
}
function current_user(): ?array {
    $id=$_SESSION['user_id']??null;
    return is_int($id) ? row('SELECT u.id,u.username,u.name,u.role,EXISTS(SELECT 1 FROM superadmin_users s WHERE s.user_id=u.id) is_superadmin FROM users u WHERE u.id=? AND u.active=1',[$id]) : null;
}
function require_user(?array $roles=null): array {
    $user=current_user(); if (!$user) bad(401,'Sign in required');
    if ($roles!==null && !in_array($user['role'],$roles,true)) bad(403,'Your role cannot do this');
    return $user;
}
function require_superadmin(): array {
    $user=require_user();
    if ((int)$user['is_superadmin']!==1) bad(403,'Superadmin access required');
    return $user;
}
function fabric_values(array $d, int $uid, bool $requireWidth=false): array {
    $width=isset($d['width_cm'])&&$d['width_cm']!==null?number_value($d,'width_cm',1):null;
    if ($requireWidth && $width===null) bad(400,'Roll width is required for a new fabric');
    $opacity=optional_text($d,'opacity',20);
    if ($opacity!=='' && !in_array($opacity,['blackout','dimout','light_filtering','sheer'],true)) bad(400,'Invalid light filtering');
    return [text_value($d,'code',40),allowed($d,'category',['curtain','shia','pillow_case','other']),
        text_value($d,'material_type',60),text_value($d,'texture',60),text_value($d,'color',60),
        optional_text($d,'design',100),$width,optional_text($d,'shade_code',60),$opacity,
        isset($d['weight_gsm'])&&$d['weight_gsm']!==null?number_value($d,'weight_gsm',1):null,
        optional_text($d,'care_instructions',300),
        isset($d['retail_price_cents'])&&$d['retail_price_cents']!==null?number_value($d,'retail_price_cents'):null,$uid];
}
function insert_fabric(array $values, int $uid): int {
    $id=insert('INSERT INTO fabrics(code,category,material_type,texture,color,design,width_cm,shade_code,opacity,weight_gsm,care_instructions,retail_price_cents,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',$values);
    audit($uid,'create','fabric',$id,['code'=>$values[0]]);
    return $id;
}
function receive_roll_record(array $d, int $uid, bool $canCreateFabric=true): array {
    $newFabric=null;
    if (array_key_exists('new_fabric',$d)) {
        if (!$canCreateFabric) bad(403,'Your role cannot add a fabric variant');
        if (!is_array($d['new_fabric'])) bad(400,'New fabric details are required');
        $newFabric=fabric_values($d['new_fabric'],$uid,true);
        $fabric=null;
    } else {
        $fabric=number_value($d,'fabric_id',1);
        if (!row('SELECT id FROM fabrics WHERE id=?',[$fabric])) bad(400,'Fabric not found');
    }
    $date=optional_text($d,'purchase_date',10);
    if ($date!=='') {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/',$date,$parts) || !checkdate((int)$parts[2],(int)$parts[3],(int)$parts[1])) bad(400,'Invalid purchase date');
    }
    $received=number_value($d,'received_cm',1);
    $stated=isset($d['stated_cm'])&&$d['stated_cm']!==null?number_value($d,'stated_cm',1):null;
    $cost=number_value($d,'cost_cents');
    $remnant=isset($d['remnant_alert_cm'])&&$d['remnant_alert_cm']!==null?number_value($d,'remnant_alert_cm',1):null;
    $values=[optional_text($d,'supplier'),$stated,$received,$cost,
        optional_text($d,'location',80)?:'Main shop',optional_text($d,'dye_lot',80),
        optional_text($d,'supplier_building',80),optional_text($d,'supplier_stall',40),
        optional_text($d,'invoice_ref',80),$date,optional_text($d,'supplier_phone',40),
        optional_text($d,'included_services',300),$remnant,$uid];
    return atomic(function()use($values,$uid,$fabric,$newFabric){
        $fabricId=$newFabric!==null?insert_fabric($newFabric,$uid):$fabric;
        $id=insert('INSERT INTO rolls(tag,fabric_id,supplier,stated_cm,received_cm,cost_cents,location,dye_lot,supplier_building,supplier_stall,invoice_ref,purchase_date,supplier_phone,included_services,remnant_alert_cm,received_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            array_merge(['PENDING-'.bin2hex(random_bytes(12)),$fabricId],$values));
        $number=$id;
        do { $tag='R'.str_pad((string)$number,5,'0',STR_PAD_LEFT); $number++; }
        while (row('SELECT id FROM rolls WHERE tag=? AND id<>?',[$tag,$id]));
        execute('UPDATE rolls SET tag=? WHERE id=?',[$tag,$id]);
        audit($uid,'receive','roll',$id,['tag'=>$tag,'cm'=>$values[2]]);
        return ['id'=>$id,'tag'=>$tag,'fabric_id'=>$fabricId];
    });
}
function job_detail(int $id): array {
    $job=row('SELECT j.*,u.name assigned_name,fs.id finished_stock_id,fs.remaining_qty FROM jobs j
      LEFT JOIN users u ON u.id=j.assigned_to LEFT JOIN finished_stock fs ON fs.job_id=j.id WHERE j.id=?',[$id]);
    if (!$job) bad(404,'Job not found');
    $job['cuts']=rows('SELECT c.*,r.tag,f.category,f.material_type,f.texture,f.color,u.name cut_name,
      COALESCE((SELECT SUM(s.sewn_cm) FROM sewing_entries s WHERE s.cut_id=c.id),0) sewn_cm
      FROM cuts c JOIN rolls r ON r.id=c.roll_id JOIN fabrics f ON f.id=r.fabric_id
      JOIN users u ON u.id=c.cut_by WHERE c.job_id=? ORDER BY c.id',[$id]);
    $job['sewing']=rows('SELECT s.*,u.name worker_name,r.tag,f.material_type,f.texture,f.color
      FROM sewing_entries s JOIN users u ON u.id=s.worker_id JOIN cuts c ON c.id=s.cut_id
      JOIN rolls r ON r.id=c.roll_id JOIN fabrics f ON f.id=r.fabric_id WHERE s.job_id=? ORDER BY s.id',[$id]);
    return $job;
}
function adjust_stock(string $source, int $sourceId, int $counted, string $reason, int $actor): array {
    return atomic(function() use ($source,$sourceId,$counted,$reason,$actor) {
        if ($source==='roll') $before=roll_balance($sourceId);
        elseif ($source==='remnant') {
            $item=row('SELECT remaining_cm FROM remnants WHERE id=?',[$sourceId]);
            $before=$item===null?null:(int)$item['remaining_cm'];
        } else {
            $item=row('SELECT remaining_qty FROM finished_stock WHERE id=?',[$sourceId]);
            $before=$item===null?null:(int)$item['remaining_qty'];
        }
        if ($before===null) bad(404,'Stock item not found');
        if ($before===$counted) bad(409,'Counted stock matches the current balance');
        $id=insert('INSERT INTO stock_adjustments(source_type,source_id,before_qty,after_qty,reason,actor_id) VALUES (?,?,?,?,?,?)',
            [$source,$sourceId,$before,$counted,$reason,$actor]);
        if ($source==='roll') execute('INSERT INTO roll_movements(roll_id,change_cm,kind,ref_type,ref_id,actor_id,note) VALUES (?,?,?,?,?,?,?)',
            [$sourceId,$counted-$before,'adjustment','stock_adjustment',$id,$actor,$reason]);
        elseif ($source==='remnant') execute('UPDATE remnants SET remaining_cm=? WHERE id=?',[$counted,$sourceId]);
        else execute('UPDATE finished_stock SET remaining_qty=? WHERE id=?',[$counted,$sourceId]);
        audit($actor,'adjust',$source,$sourceId,['adjustment_id'=>$id,'before'=>$before,'after'=>$counted,'reason'=>$reason]);
        return ['id'=>$id,'before_qty'=>$before,'after_qty'=>$counted];
    });
}
function order_detail(int $id): array {
    $order=row('SELECT o.*,c.name customer_name,c.phone customer_phone,u.name created_by_name FROM customer_orders o JOIN customers c ON c.id=o.customer_id JOIN users u ON u.id=o.created_by WHERE o.id=?',[$id]);
    if (!$order) bad(404,'Order not found');
    $order['openings']=rows('SELECT * FROM order_openings WHERE order_id=? ORDER BY id',[$id]);
    $order['items']=rows('SELECT i.*,f.code fabric_code,f.color fabric_color,s.code shia_code,s.color shia_color,p.room,p.width_cm,p.drop_cm FROM order_items i JOIN fabrics f ON f.id=i.fabric_id LEFT JOIN fabrics s ON s.id=i.shia_fabric_id JOIN order_openings p ON p.id=i.opening_id WHERE i.order_id=? ORDER BY i.id',[$id]);
    $order['total_cents']=array_sum(array_map(fn($item)=>(int)$item['quantity']*(int)$item['unit_price_cents'],$order['items']));
    return $order;
}
function superadmin_dashboard_data(): array {
    return [
        'active_staff'=>(int)row('SELECT COUNT(*) n FROM users WHERE active=1')['n'],
        'fabric_count'=>(int)row('SELECT COUNT(*) n FROM fabrics')['n'],
        'roll_count'=>(int)row('SELECT COUNT(*) n FROM rolls')['n'],
        'order_count'=>(int)row('SELECT COUNT(*) n FROM customer_orders')['n'],
        'draft_orders'=>(int)row("SELECT COUNT(*) n FROM customer_orders WHERE status='draft'")['n'],
        'due_orders'=>(int)row("SELECT COUNT(*) n FROM customer_orders WHERE status='confirmed' AND due_date<=date('now','+3 hours')")['n'],
        'sales_today_cents'=>(int)row("SELECT COALESCE(SUM(total_cents),0) n FROM sales WHERE date(created_at,'+3 hours')=date('now','+3 hours')")['n'],
        'cash_today_cents'=>(int)row("SELECT COALESCE(SUM(paid_cents),0) n FROM sales WHERE payment_method='cash' AND date(created_at,'+3 hours')=date('now','+3 hours')")['n'],
        'unpaid_cents'=>(int)row('SELECT COALESCE(SUM(total_cents-paid_cents),0) n FROM sales')['n'],
        'corrections_week'=>(int)row("SELECT COUNT(*) n FROM stock_adjustments WHERE created_at>=datetime('now','-7 days')")['n'],
        'orders'=>rows('SELECT o.id,o.ref,o.status,o.due_date,c.name customer_name FROM customer_orders o JOIN customers c ON c.id=o.customer_id ORDER BY CASE WHEN o.due_date IS NULL THEN 1 ELSE 0 END,o.due_date,o.id DESC LIMIT 5'),
        'unpaid_sales'=>rows('SELECT id,ref,customer,total_cents,paid_cents,created_at FROM sales WHERE total_cents>paid_cents ORDER BY id DESC LIMIT 5'),
        'adjustments'=>rows('SELECT a.id,a.source_type,a.source_id,a.before_qty,a.after_qty,a.reason,a.created_at,u.name actor_name FROM stock_adjustments a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 5'),
        'sales_week'=>rows("SELECT date(created_at,'+3 hours') day,SUM(total_cents) sales_cents,SUM(paid_cents) paid_cents FROM sales WHERE date(created_at,'+3 hours')>=date('now','+3 hours','-6 days') GROUP BY day ORDER BY day"),
        'recent'=>rows('SELECT a.created_at,a.action,a.entity,a.entity_id,u.name actor FROM audit_events a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 8'),
    ];
}
function api(string $path,string $method): never {
    if ($method!=='GET') {
        $token=$_SERVER['HTTP_X_CSRF_TOKEN']??'';
        if (!is_string($token) || !hash_equals($_SESSION['csrf']??'', $token)) bad(403,'Session token expired; reload the page');
        $origin=$_SERVER['HTTP_ORIGIN']??'';
        if ($origin!=='' && $origin!==('http://' . ($_SERVER['HTTP_HOST']??'')) && $origin!==('https://' . ($_SERVER['HTTP_HOST']??''))) bad(403,'Invalid origin');
    }
    if ($path==='/api/me' && $method==='GET') reply(['user'=>current_user(),'csrf'=>$_SESSION['csrf']]);
    if ($path==='/api/login' && $method==='POST') {
        $d=input(); $username=text_value($d,'username',80); $password=text_value($d,'password',500);
        $user=row('SELECT * FROM users WHERE username=? AND active=1',[$username]);
        if (!$user || !password_verify($password,$user['password_hash'])) bad(401,'Incorrect username or password');
        session_regenerate_id(true); $_SESSION['user_id']=(int)$user['id'];
        $_SESSION['csrf']=bin2hex(random_bytes(24));
        reply(['user'=>current_user(),'csrf'=>$_SESSION['csrf']]);
    }
    if ($path==='/api/logout' && $method==='POST') {
        $_SESSION=[]; session_destroy(); reply(['ok'=>true]);
    }
    $user=require_user(); $uid=(int)$user['id'];
    if ($path==='/api/users' && $method==='GET') reply(rows('SELECT u.id,u.username,u.name,u.role,u.active,u.created_at,EXISTS(SELECT 1 FROM superadmin_users s WHERE s.user_id=u.id) is_superadmin FROM users u ORDER BY u.name'));
    if ($path==='/api/users' && $method==='POST') {
        require_user(['owner']); $d=input();
        $password=text_value($d,'password',500); if (mb_strlen($password)<8) bad(400,'Password must have at least 8 characters');
        $name=text_value($d,'name'); $username=text_value($d,'username',80);
        $role=allowed($d,'role',['owner','manager','cashier','cutter','tailor']);
        $id=atomic(function()use($uid,$name,$username,$role,$password){
            $id=insert('INSERT INTO users(username,name,role,password_hash) VALUES (?,?,?,?)',
                [$username,$name,$role,password_hash($password,PASSWORD_ARGON2ID)]);
            audit($uid,'create','user',$id,['username'=>$username,'role'=>$role]); return $id;
        }); reply(['id'=>$id],201);
    }
    if ($path==='/api/orders' && $method==='GET') {
        reply(rows('SELECT o.id,o.ref,o.due_date,o.status,o.created_at,c.name customer_name,COUNT(DISTINCT p.id) opening_count,COALESCE(SUM(i.quantity*i.unit_price_cents),0) total_cents FROM customer_orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN order_openings p ON p.order_id=o.id LEFT JOIN order_items i ON i.order_id=o.id AND i.opening_id=p.id GROUP BY o.id ORDER BY o.id DESC'));
    }
    if ($path==='/api/orders' && $method==='POST') {
        require_user(['owner','manager','cashier']); $d=input();
        $ref=text_value($d,'ref',40);$customer=text_value($d,'customer',120);$phone=optional_text($d,'phone',30);
        $due=optional_text($d,'due_date',10);if ($due!=='' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$due) || !checkdate((int)substr($due,5,2),(int)substr($due,8,2),(int)substr($due,0,4)))) bad(400,'Invalid due date');
        $notes=optional_text($d,'notes',500);
        $id=atomic(function()use($ref,$customer,$phone,$due,$notes,$uid){
            $customerId=insert('INSERT INTO customers(name,phone,created_by) VALUES (?,?,?)',[$customer,$phone,$uid]);
            $id=insert('INSERT INTO customer_orders(ref,customer_id,due_date,notes,created_by) VALUES (?,?,?,?,?)',[$ref,$customerId,$due?:null,$notes,$uid]);
            audit($uid,'create','order',$id,['ref'=>$ref]);return $id;
        });reply(['id'=>$id],201);
    }
    if (preg_match('#^/api/orders/(\d+)(?:/(openings|items|confirm))?$#',$path,$match)) {
        $orderId=(int)$match[1];$action=$match[2]??'';
        if ($action==='' && $method==='GET') reply(order_detail($orderId));
        if ($action==='openings' && $method==='POST') {
            require_user(['owner','manager','cashier']);$d=input();
            $room=text_value($d,'room',100);$width=number_value($d,'width_cm',1);$drop=number_value($d,'drop_cm',1);
            $source=allowed($d,'measurement_source',['customer','staff']);$notes=optional_text($d,'notes',500);
            $id=atomic(function()use($orderId,$room,$width,$drop,$source,$notes,$uid){
                $order=row('SELECT status FROM customer_orders WHERE id=?',[$orderId]);if (!$order) bad(404,'Order not found');
                if ($order['status']!=='draft') bad(409,'Confirmed order cannot be changed');
                $id=insert('INSERT INTO order_openings(order_id,room,width_cm,drop_cm,measurement_source,notes) VALUES (?,?,?,?,?,?)',[$orderId,$room,$width,$drop,$source,$notes]);
                audit($uid,'add_opening','order',$orderId,['opening_id'=>$id]);return $id;
            });reply(['id'=>$id,'order'=>order_detail($orderId)],201);
        }
        if ($action==='items' && $method==='POST') {
            require_user(['owner','manager','cashier']);$d=input();
            $openingId=number_value($d,'opening_id',1);$type=allowed($d,'item_type',['set','piece','shia','pillow_case']);
            $quantity=number_value($d,'quantity',1);$pieces=number_value($d,'piece_count',1);
            if ($type!=='set' && $pieces!==1) bad(400,'Piece count applies only to a set');
            $fabricId=number_value($d,'fabric_id',1);
            $shiaId=isset($d['shia_fabric_id'])&&$d['shia_fabric_id']!==null?number_value($d,'shia_fabric_id',1):null;
            if ($shiaId!==null && $type!=='set') bad(400,'Extra shia applies only to a set');
            $heading=optional_text($d,'heading',80);
            $fullness=isset($d['fullness_x100'])&&$d['fullness_x100']!==null?number_value($d,'fullness_x100',1):null;
            $price=number_value($d,'unit_price_cents');$notes=optional_text($d,'notes',500);
            $id=atomic(function()use($orderId,$openingId,$type,$quantity,$pieces,$fabricId,$shiaId,$heading,$fullness,$price,$notes,$uid){
                $order=row('SELECT status FROM customer_orders WHERE id=?',[$orderId]);if (!$order) bad(404,'Order not found');
                if ($order['status']!=='draft') bad(409,'Confirmed order cannot be changed');
                if (!row('SELECT id FROM order_openings WHERE id=? AND order_id=?',[$openingId,$orderId])) bad(400,'Opening is not on this order');
                $base=in_array($type,['set','piece'],true)?'curtain':$type;
                if (!row('SELECT id FROM fabrics WHERE id=? AND category=?',[$fabricId,$base])) bad(400,'Fabric category does not match this item');
                if ($shiaId!==null && !row("SELECT id FROM fabrics WHERE id=? AND category='shia'",[$shiaId])) bad(400,'Select a shia fabric');
                $id=insert('INSERT INTO order_items(order_id,opening_id,item_type,quantity,piece_count,fabric_id,shia_fabric_id,heading,fullness_x100,unit_price_cents,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    [$orderId,$openingId,$type,$quantity,$pieces,$fabricId,$shiaId,$heading,$fullness,$price,$notes]);
                audit($uid,'add_item','order',$orderId,['item_id'=>$id]);return $id;
            });reply(['id'=>$id,'order'=>order_detail($orderId)],201);
        }
        if ($action==='confirm' && $method==='POST') {
            require_user(['owner','manager']);
            atomic(function()use($orderId,$uid){
                $order=row('SELECT status FROM customer_orders WHERE id=?',[$orderId]);if (!$order) bad(404,'Order not found');
                if ($order['status']!=='draft') bad(409,'Order already confirmed');
                $items=(int)row('SELECT COUNT(*) n FROM order_items WHERE order_id=?',[$orderId])['n'];
                if ($items===0) bad(409,'Add at least one item before confirming');
                execute("UPDATE customer_orders SET status='confirmed',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=?",[$uid,$orderId]);
                audit($uid,'confirm','order',$orderId);
            });reply(['order'=>order_detail($orderId)]);
        }
    }
    if ($method==='PATCH' && preg_match('#^/api/orders/(\d+)/openings/(\d+)$#',$path,$match)) {
        require_user(['owner','manager','cashier']);$orderId=(int)$match[1];$openingId=(int)$match[2];$d=input();
        $room=text_value($d,'room',100);$width=number_value($d,'width_cm',1);$drop=number_value($d,'drop_cm',1);
        $source=allowed($d,'measurement_source',['customer','staff']);$notes=optional_text($d,'notes',500);
        atomic(function()use($orderId,$openingId,$room,$width,$drop,$source,$notes,$uid){
            $order=row('SELECT status FROM customer_orders WHERE id=?',[$orderId]);if (!$order) bad(404,'Order not found');
            if ($order['status']!=='draft') bad(409,'Confirmed order cannot be changed');
            if (!execute('UPDATE order_openings SET room=?,width_cm=?,drop_cm=?,measurement_source=?,notes=? WHERE id=? AND order_id=?',
                [$room,$width,$drop,$source,$notes,$openingId,$orderId])) bad(404,'Opening not found');
            audit($uid,'edit_opening','order',$orderId,['opening_id'=>$openingId]);
        });reply(['order'=>order_detail($orderId)]);
    }
    if ($path==='/api/fabrics' && $method==='GET') reply(rows('SELECT * FROM fabrics ORDER BY id DESC'));
    if ($path==='/api/fabrics' && $method==='POST') {
        require_user(['owner','manager','cashier']); $d=input();
        $values=fabric_values($d,$uid);
        $id=atomic(fn()=>insert_fabric($values,$uid)); reply(['id'=>$id],201);
    }
    if ($path==='/api/rolls' && $method==='GET') reply(rows('SELECT r.*,f.code,f.category,f.material_type,f.texture,f.color,f.design,f.width_cm,f.shade_code,f.opacity,f.weight_gsm,f.care_instructions,f.retail_price_cents,
      r.received_cm+COALESCE(SUM(m.change_cm),0) balance_cm FROM rolls r JOIN fabrics f ON f.id=r.fabric_id
      LEFT JOIN roll_movements m ON m.roll_id=r.id GROUP BY r.id ORDER BY r.id DESC'));
    if ($path==='/api/rolls' && $method==='POST') {
        require_user(['owner','manager','cashier','cutter']); $d=input();
        reply(receive_roll_record($d,$uid,in_array($user['role'],['owner','manager','cashier'],true)),201);
    }
    if ($path==='/api/jobs' && $method==='GET') reply(rows('SELECT j.*,u.name assigned_name,fs.id finished_stock_id,fs.remaining_qty
      FROM jobs j LEFT JOIN users u ON u.id=j.assigned_to LEFT JOIN finished_stock fs ON fs.job_id=j.id ORDER BY j.id DESC'));
    if ($path==='/api/jobs' && $method==='POST') {
        require_user(['owner','manager','cashier']); $d=input();
        $assigned=isset($d['assigned_to'])&&$d['assigned_to']!==null?number_value($d,'assigned_to',1):null;
        if ($assigned && !row('SELECT id FROM users WHERE id=? AND active=1',[$assigned])) bad(400,'Worker not found');
        $type=allowed($d,'output_type',['set','piece','shia','pillow_case']);
        $includeShia=number_value($d,'include_shia');
        if ($includeShia>1 || ($includeShia===1 && $type!=='set')) bad(400,'Shia can be added only to a curtain set');
        $values=[text_value($d,'ref',40),text_value($d,'customer'),optional_text($d,'room',100),
            $type,number_value($d,'output_qty',1),$includeShia,
            isset($d['width_cm'])&&$d['width_cm']!==null?number_value($d,'width_cm',1):null,
            isset($d['drop_cm'])&&$d['drop_cm']!==null?number_value($d,'drop_cm',1):null,
            $assigned,optional_text($d,'note',500),$uid];
        $id=atomic(function()use($values,$uid){
            $id=insert('INSERT INTO jobs(ref,customer,room,output_type,output_qty,include_shia,width_cm,drop_cm,assigned_to,note,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',$values);
            audit($uid,'create','job',$id,['ref'=>$values[0]]); return $id;
        }); reply(['id'=>$id],201);
    }
    if (preg_match('#^/api/jobs/(\d+)(?:/(cuts|sewing|finish))?$#',$path,$match)) {
        $jobId=(int)$match[1]; $action=$match[2]??'';
        if ($action==='' && $method==='GET') reply(job_detail($jobId));
        if ($method==='POST' && $action==='cuts') {
            require_user(['owner','manager','cutter','tailor']); $d=input();
            $rollId=number_value($d,'roll_id',1);$cut=number_value($d,'cut_cm',1);$used=number_value($d,'used_cm');
            $offcut=number_value($d,'offcut_cm');$waste=number_value($d,'waste_cm');
            if ($cut!==$used+$offcut+$waste) bad(400,'Cut must equal used + offcut + waste');
            $id=atomic(function()use($jobId,$rollId,$cut,$used,$offcut,$waste,$uid){
                $job=row('SELECT status FROM jobs WHERE id=?',[$jobId]); if (!$job) bad(404,'Job not found');
                if ($job['status']==='finished') bad(409,'Job already finished');
                $available=roll_balance($rollId); if ($available===null) bad(404,'Roll not found');
                if ($available<$cut) bad(409,'Only ' . number_format($available/100,2) . ' m remain on this roll');
                $id=insert('INSERT INTO cuts(job_id,roll_id,cut_cm,used_cm,offcut_cm,waste_cm,cut_by) VALUES (?,?,?,?,?,?,?)',
                    [$jobId,$rollId,$cut,$used,$offcut,$waste,$uid]);
                execute('INSERT INTO roll_movements(roll_id,change_cm,kind,ref_type,ref_id,actor_id) VALUES (?,?,?,?,?,?)',
                    [$rollId,-$cut,'cut','cut',$id,$uid]);
                if ($offcut>0) insert('INSERT INTO remnants(cut_id,initial_cm,remaining_cm) VALUES (?,?,?)',[$id,$offcut,$offcut]);
                execute("UPDATE jobs SET status='in_progress' WHERE id=?",[$jobId]);
                audit($uid,'cut','job',$jobId,['cut_id'=>$id,'roll_id'=>$rollId,'cut_cm'=>$cut]);return $id;
            }); reply(['id'=>$id,'job'=>job_detail($jobId)],201);
        }
        if ($method==='POST' && $action==='sewing') {
            require_user(['owner','manager','tailor']); $d=input();
            $cutId=number_value($d,'cut_id',1);$cm=number_value($d,'sewn_cm',1);
            $id=atomic(function()use($jobId,$cutId,$cm,$uid){
                $job=row('SELECT status FROM jobs WHERE id=?',[$jobId]); if (!$job) bad(404,'Job not found');
                if ($job['status']==='finished') bad(409,'Job already finished');
                $cut=row('SELECT used_cm FROM cuts WHERE id=? AND job_id=?',[$cutId,$jobId]); if (!$cut) bad(400,'Cut not on this job');
                $done=(int)row('SELECT COALESCE(SUM(sewn_cm),0) n FROM sewing_entries WHERE cut_id=?',[$cutId])['n'];
                if ($done+$cm>(int)$cut['used_cm']) bad(409,'Sewn metres exceed the material used on this cut');
                $id=insert('INSERT INTO sewing_entries(job_id,cut_id,sewn_cm,worker_id) VALUES (?,?,?,?)',[$jobId,$cutId,$cm,$uid]);
                audit($uid,'sew','job',$jobId,['entry_id'=>$id,'cut_id'=>$cutId,'sewn_cm'=>$cm]);return $id;
            }); reply(['id'=>$id,'job'=>job_detail($jobId)],201);
        }
        if ($method==='POST' && $action==='finish') {
            require_user(['owner','manager','tailor']);
            atomic(function()use($jobId,$uid){
                $job=row('SELECT * FROM jobs WHERE id=?',[$jobId]); if (!$job) bad(404,'Job not found');
                if ($job['status']==='finished') bad(409,'Job already finished');
                $cuts=rows('SELECT id,used_cm FROM cuts WHERE job_id=?',[$jobId]); if (!$cuts) bad(409,'Record material cuts first');
                if (array_sum(array_map(fn($cut)=>(int)$cut['used_cm'],$cuts))<=0) bad(409,'A finished item needs material recorded as used');
                $byCategory=rows('SELECT f.category,SUM(c.used_cm) used_cm FROM cuts c JOIN rolls r ON r.id=c.roll_id JOIN fabrics f ON f.id=r.fabric_id WHERE c.job_id=? GROUP BY f.category',[$jobId]);
                $materials=[];foreach($byCategory as $part)$materials[$part['category']]=(int)$part['used_cm'];
                $base=in_array($job['output_type'],['set','piece'],true)?'curtain':$job['output_type'];
                if (($materials[$base]??0)<=0) bad(409,'Required '.$base.' material is missing');
                if ((int)$job['include_shia']===1 && ($materials['shia']??0)<=0) bad(409,'This set requires shia material');
                foreach ($cuts as $cut) {
                    $done=(int)row('SELECT COALESCE(SUM(sewn_cm),0) n FROM sewing_entries WHERE cut_id=?',[(int)$cut['id']])['n'];
                    if ($done!==(int)$cut['used_cm']) bad(409,'Record all used material as sewn before finishing');
                }
                execute("UPDATE jobs SET status='finished',finished_by=?,finished_at=CURRENT_TIMESTAMP WHERE id=?",[$uid,$jobId]);
                insert('INSERT INTO finished_stock(job_id,output_type,initial_qty,remaining_qty) VALUES (?,?,?,?)',
                    [$jobId,$job['output_type'],$job['output_qty'],$job['output_qty']]);
                audit($uid,'finish','job',$jobId,['output_type'=>$job['output_type'],'qty'=>$job['output_qty']]);
            }); reply(['job'=>job_detail($jobId)]);
        }
    }
    if ($path==='/api/remnants' && $method==='GET') reply(rows('SELECT x.*,r.tag,f.material_type,f.texture,f.color FROM remnants x
      JOIN cuts c ON c.id=x.cut_id JOIN rolls r ON r.id=c.roll_id JOIN fabrics f ON f.id=r.fabric_id ORDER BY x.id DESC'));
    if ($path==='/api/adjustments' && $method==='GET') {
        require_user(['owner','manager']);
        reply(rows('SELECT a.*,u.name actor_name FROM stock_adjustments a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200'));
    }
    if ($path==='/api/adjustments' && $method==='POST') {
        require_user(['owner','manager']); $d=input();
        $source=allowed($d,'source_type',['roll','remnant','finished']);
        $sourceId=number_value($d,'source_id',1);
        $counted=number_value($d,'counted_qty');
        $reason=text_value($d,'reason',500);
        reply(adjust_stock($source,$sourceId,$counted,$reason,$uid),201);
    }
    if ($path==='/api/sales' && $method==='GET') {
        require_user(['owner','manager','cashier']);
        reply(rows('SELECT s.*,u.name sold_by_name FROM sales s JOIN users u ON u.id=s.sold_by ORDER BY s.id DESC'));
    }
    if ($path==='/api/sales' && $method==='POST') {
        require_user(['owner','manager','cashier']); $d=input();
        $source=allowed($d,'source_type',['roll','remnant','finished']);$sourceId=number_value($d,'source_id',1);
        $qty=number_value($d,'quantity',1);$price=number_value($d,'unit_price_cents');
        $payment=allowed($d,'payment_method',['cash','unpaid']);
        $total=$source==='finished'?$qty*$price:(int)round($qty*$price/100);
        $ref=text_value($d,'ref',40);$customer=optional_text($d,'customer')?:'Walk-in';
        $id=atomic(function()use($source,$sourceId,$qty,$price,$payment,$total,$ref,$customer,$uid){
            if ($source==='roll') {
                $available=roll_balance($sourceId);if ($available===null) bad(404,'Roll not found');
                if ($available<$qty) bad(409,'Not enough fabric on this roll');
            } elseif ($source==='remnant') {
                $stock=row('SELECT remaining_cm FROM remnants WHERE id=?',[$sourceId]);if (!$stock) bad(404,'Remnant not found');
                if ((int)$stock['remaining_cm']<$qty) bad(409,'Not enough fabric in this remnant');
            } else {
                $stock=row('SELECT remaining_qty FROM finished_stock WHERE id=?',[$sourceId]);if (!$stock) bad(404,'Finished item not found');
                if ((int)$stock['remaining_qty']<$qty) bad(409,'Not enough finished stock');
            }
            $saleId=insert('INSERT INTO sales(ref,customer,total_cents,paid_cents,payment_method,sold_by) VALUES (?,?,?,?,?,?)',
                [$ref,$customer,$total,$payment==='cash'?$total:0,$payment,$uid]);
            insert('INSERT INTO sale_lines(sale_id,source_type,source_id,quantity,unit,unit_price_cents,line_total_cents) VALUES (?,?,?,?,?,?,?)',
                [$saleId,$source,$sourceId,$qty,$source==='finished'?'piece':'cm',$price,$total]);
            if ($source==='roll') execute('INSERT INTO roll_movements(roll_id,change_cm,kind,ref_type,ref_id,actor_id) VALUES (?,?,?,?,?,?)',
                [$sourceId,-$qty,'sale','sale',$saleId,$uid]);
            elseif ($source==='remnant') execute('UPDATE remnants SET remaining_cm=remaining_cm-? WHERE id=?',[$qty,$sourceId]);
            else execute('UPDATE finished_stock SET remaining_qty=remaining_qty-? WHERE id=?',[$qty,$sourceId]);
            audit($uid,'sell','sale',$saleId,['source'=>$source,'source_id'=>$sourceId,'quantity'=>$qty,'total_cents'=>$total]);return $saleId;
        }); reply(['id'=>$id,'total_cents'=>$total],201);
    }
    if ($path==='/api/team' && $method==='GET') {
        require_user(['owner','manager']);
        reply(['rows'=>rows('SELECT s.id,s.created_at,u.name worker,j.ref job_ref,j.customer,
          f.category,f.material_type,f.texture,f.color,r.tag,s.sewn_cm FROM sewing_entries s
          JOIN users u ON u.id=s.worker_id JOIN jobs j ON j.id=s.job_id
          JOIN cuts c ON c.id=s.cut_id JOIN rolls r ON r.id=c.roll_id JOIN fabrics f ON f.id=r.fabric_id
          ORDER BY s.id DESC LIMIT 200'),
          'totals'=>rows("SELECT u.name,COALESCE(SUM(s.sewn_cm),0) sewn_cm FROM users u
          LEFT JOIN sewing_entries s ON s.worker_id=u.id AND date(s.created_at,'+3 hours')=date('now','+3 hours')
          GROUP BY u.id ORDER BY sewn_cm DESC,u.name")]);
    }
    if ($path==='/api/superadmin/dashboard' && $method==='GET') {
        require_superadmin();
        reply(superadmin_dashboard_data());
    }
    if ($path==='/api/dashboard' && $method==='GET') {
        $summary=row('SELECT COUNT(*) rolls,COALESCE(SUM(r.received_cm+COALESCE(m.delta,0)),0) balance_cm
          FROM rolls r LEFT JOIN (SELECT roll_id,SUM(change_cm) delta FROM roll_movements GROUP BY roll_id) m ON m.roll_id=r.id');
        reply($summary+[
            'draft_orders'=>(int)row("SELECT COUNT(*) n FROM customer_orders WHERE status='draft'")['n'],
            'due_orders'=>(int)row("SELECT COUNT(*) n FROM customer_orders WHERE status='confirmed' AND due_date<=date('now','+3 hours')")['n'],
            'orders'=>rows('SELECT o.id,o.ref,o.status,o.due_date,c.name customer_name FROM customer_orders o JOIN customers c ON c.id=o.customer_id ORDER BY CASE WHEN o.due_date IS NULL THEN 1 ELSE 0 END,o.due_date,o.id DESC LIMIT 5'),
            'jobs'=>rows("SELECT id,ref,customer,output_type,status FROM jobs WHERE status!='finished' ORDER BY id DESC LIMIT 5"),
            'open_jobs'=>(int)row("SELECT COUNT(*) n FROM jobs WHERE status!='finished'")['n'],
            'sewn_today_cm'=>(int)row("SELECT COALESCE(SUM(sewn_cm),0) n FROM sewing_entries WHERE date(created_at,'+3 hours')=date('now','+3 hours')")['n'],
            'finished_today'=>(int)row("SELECT COALESCE(SUM(output_qty),0) n FROM jobs WHERE status='finished' AND date(finished_at,'+3 hours')=date('now','+3 hours')")['n'],
            'sales_today_cents'=>in_array($user['role'],['owner','manager','cashier'],true)
                ?(int)row("SELECT COALESCE(SUM(total_cents),0) n FROM sales WHERE date(created_at,'+3 hours')=date('now','+3 hours')")['n']
                :null,
            'recent'=>rows('SELECT a.created_at,a.action,a.entity,a.entity_id,u.name actor FROM audit_events a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 12')
        ]);
    }
    bad(404,'Not found');
}
