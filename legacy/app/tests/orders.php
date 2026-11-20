<?php
declare(strict_types=1);
$path=sys_get_temp_dir().'/trendy-orders-'.bin2hex(random_bytes(6)).'.sqlite';
putenv('TRENDY_DB_PATH='.$path);
require dirname(__DIR__).'/src/Api.php';
try {
    $owner=insert("INSERT INTO users(username,name,role,password_hash) VALUES ('owner','Owner','owner','test')");
    $curtain=insert("INSERT INTO fabrics(code,category,material_type,texture,color,created_by) VALUES ('LIN-C','curtain','Linen','Woven','Cream',?)",[$owner]);
    $shia=insert("INSERT INTO fabrics(code,category,material_type,texture,color,created_by) VALUES ('SH-I','shia','Voile','Light','Ivory',?)",[$owner]);
    $customer=insert("INSERT INTO customers(name,created_by) VALUES ('Sample customer',?)",[$owner]);
    $order=insert("INSERT INTO customer_orders(ref,customer_id,status,created_by) VALUES ('TC-1',?,'draft',?)",[$customer,$owner]);
    $living=insert("INSERT INTO order_openings(order_id,room,width_cm,drop_cm,measurement_source) VALUES (?,'Living room',240,220,'customer')",[$order]);
    $bedroom=insert("INSERT INTO order_openings(order_id,room,width_cm,drop_cm,measurement_source) VALUES (?,'Bedroom',120,200,'staff')",[$order]);
    insert("INSERT INTO order_items(order_id,opening_id,item_type,quantity,piece_count,fabric_id,shia_fabric_id,heading,fullness_x100,unit_price_cents) VALUES (?,?,'set',1,2,?,?,'Pleated',220,180000)",[$order,$living,$curtain,$shia]);
    insert("INSERT INTO order_items(order_id,opening_id,item_type,quantity,piece_count,fabric_id,unit_price_cents) VALUES (?,?,'piece',1,1,?,55000)",[$order,$bedroom,$curtain]);
    $detail=order_detail($order);
    if (count($detail['openings'])!==2 || count($detail['items'])!==2 || $detail['total_cents']!==235000) throw new RuntimeException('Multi-opening order or quote total is wrong');
    if ($detail['items'][0]['shia_code']!=='SH-I' || $detail['items'][1]['room']!=='Bedroom') throw new RuntimeException('Item specifications are not linked to their opening');
    execute("UPDATE customer_orders SET status='confirmed',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=?",[$owner,$order]);
    $detail=order_detail($order);
    ob_start();$order=$detail;require dirname(__DIR__).'/public/print_order.php';$card=ob_get_clean();
    foreach (['Living room','Bedroom','SH-I','Pleated','Cut planning required'] as $expected) {
        if (!str_contains($card,$expected)) throw new RuntimeException("Workroom card is missing $expected");
    }
    echo "Order test passed: two openings, mixed items, quote total and workroom card.\n";
} finally {
    db();foreach ([$path,$path.'-wal',$path.'-shm'] as $file) @unlink($file);
}
