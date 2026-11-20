<?php
declare(strict_types=1);
$path=sys_get_temp_dir().'/trendy-superadmin-'.bin2hex(random_bytes(6)).'.sqlite';
putenv('TRENDY_DB_PATH='.$path);
require dirname(__DIR__).'/src/Api.php';
function assert_equal(mixed $expected,mixed $actual,string $label): void {
    if ($expected!==$actual) throw new RuntimeException("$label: expected ".var_export($expected,true).', got '.var_export($actual,true));
}
try {
    $owner=insert("INSERT INTO users(username,name,role,password_hash) VALUES ('owner','Owner','owner','test')");
    $admin=insert("INSERT INTO users(username,name,role,password_hash) VALUES ('superadmin','Super Admin','owner','test')");
    insert('INSERT INTO superadmin_users(user_id) VALUES (?)',[$admin]);
    $_SESSION=['user_id'=>$owner];
    assert_equal(0,(int)current_user()['is_superadmin'],'Ordinary owner marker');
    try { require_superadmin();throw new RuntimeException('Ordinary owner must be rejected'); }
    catch (ApiFailure $e) { assert_equal(403,$e->status,'Ordinary owner access'); }
    $_SESSION['user_id']=$admin;
    assert_equal(1,(int)require_superadmin()['is_superadmin'],'Superadmin marker');
    insert("INSERT INTO sales(ref,customer,total_cents,paid_cents,payment_method,sold_by) VALUES ('S-1','Walk-in',120000,120000,'cash',?)",[$owner]);
    insert("INSERT INTO sales(ref,customer,total_cents,paid_cents,payment_method,sold_by) VALUES ('S-2','Customer',80000,0,'unpaid',?)",[$owner]);
    insert("INSERT INTO stock_adjustments(source_type,source_id,before_qty,after_qty,reason,actor_id) VALUES ('roll',1,500,490,'Measured count',?)",[$owner]);
    $data=superadmin_dashboard_data();
    assert_equal(2,$data['active_staff'],'Active accounts');
    assert_equal(80000,$data['unpaid_cents'],'Unpaid balance');
    assert_equal(1,$data['corrections_week'],'Recent correction');
    assert_equal(1,count($data['unpaid_sales']),'Unpaid queue');
    echo "Superadmin test passed: access separation, account count, unpaid balance and correction queue.\n";
} finally {
    db();foreach ([$path,$path.'-wal',$path.'-shm'] as $file) @unlink($file);
}
