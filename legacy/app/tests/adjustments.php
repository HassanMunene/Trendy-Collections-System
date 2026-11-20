<?php
declare(strict_types=1);
$path=sys_get_temp_dir().'/trendy-adjustments-'.bin2hex(random_bytes(6)).'.sqlite';
putenv('TRENDY_DB_PATH='.$path);
require dirname(__DIR__).'/src/Api.php';

function expect_qty(int $expected, int $actual, string $label): void {
    if ($expected!==$actual) throw new RuntimeException("$label: expected $expected, got $actual");
}
try {
    $owner=insert("INSERT INTO users(username,name,role,password_hash) VALUES ('owner','Owner','owner','test')");
    $fabric=insert("INSERT INTO fabrics(code,category,material_type,texture,color,created_by) VALUES ('F-1','curtain','Linen','Woven','Blue',?)",[$owner]);
    $roll=insert("INSERT INTO rolls(tag,fabric_id,received_cm,received_by) VALUES ('R-1',?,500,?)",[$fabric,$owner]);
    $job=insert("INSERT INTO jobs(ref,customer,output_type,output_qty,created_by) VALUES ('J-1','Test','piece',2,?)",[$owner]);
    $cut=insert('INSERT INTO cuts(job_id,roll_id,cut_cm,used_cm,offcut_cm,waste_cm,cut_by) VALUES (?,?,?,?,?,?,?)',[$job,$roll,100,80,20,0,$owner]);
    $remnant=insert('INSERT INTO remnants(cut_id,initial_cm,remaining_cm) VALUES (?,?,?)',[$cut,20,20]);
    $finished=insert("INSERT INTO finished_stock(job_id,output_type,initial_qty,remaining_qty) VALUES (?,'piece',2,2)",[$job]);

    $a=adjust_stock('roll',$roll,450,'Physical count',$owner);
    expect_qty(500,$a['before_qty'],'Roll before');
    expect_qty(450,roll_balance($roll),'Roll after decrease');
    adjust_stock('roll',$roll,475,'Found more on roll',$owner);
    expect_qty(475,roll_balance($roll),'Roll after increase');
    adjust_stock('remnant',$remnant,0,'Offcut damaged',$owner);
    expect_qty(0,(int)row('SELECT remaining_cm FROM remnants WHERE id=?',[$remnant])['remaining_cm'],'Remnant after');
    adjust_stock('finished',$finished,1,'One piece missing',$owner);
    expect_qty(1,(int)row('SELECT remaining_qty FROM finished_stock WHERE id=?',[$finished])['remaining_qty'],'Finished after');
    try {
        adjust_stock('roll',$roll,475,'No change',$owner);
        throw new RuntimeException('No-change correction should fail');
    } catch (ApiFailure $e) { expect_qty(409,$e->status,'No-change status'); }
    try {
        adjust_stock('finished',$finished,-1,'Invalid negative count',$owner);
        throw new RuntimeException('Negative correction should fail');
    } catch (PDOException $e) { /* The database rejects negative stock and rolls back the correction. */ }
    expect_qty(1,(int)row('SELECT remaining_qty FROM finished_stock WHERE id=?',[$finished])['remaining_qty'],'Negative correction rollback');
    expect_qty(4,(int)row('SELECT COUNT(*) n FROM stock_adjustments')['n'],'Adjustment history');
    expect_qty(4,(int)row("SELECT COUNT(*) n FROM audit_events WHERE action='adjust'")['n'],'Audit history');
    echo "Adjustment test passed: roll, offcut, finished stock, history and no-op guard.\n";
} finally {
    db();
    foreach ([$path,$path.'-wal',$path.'-shm'] as $file) @unlink($file);
}
