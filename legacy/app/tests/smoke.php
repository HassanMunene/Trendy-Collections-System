<?php
declare(strict_types=1);
$path=sys_get_temp_dir().'/trendy-smoke-'.bin2hex(random_bytes(6)).'.sqlite';
putenv('TRENDY_DB_PATH='.$path);
require dirname(__DIR__).'/src/Database.php';

function same(mixed $want,mixed $got,string $message): void {
    if ($want!==$got) throw new RuntimeException("$message: expected ".var_export($want,true).', got '.var_export($got,true));
}
try {
    $owner=insert("INSERT INTO users(username,name,role,password_hash) VALUES ('owner','Owner','owner',?)",[password_hash('a-test-password',PASSWORD_ARGON2ID)]);
    $tailor=insert("INSERT INTO users(username,name,role,password_hash) VALUES ('amina','Amina','tailor',?)",[password_hash('another-test-password',PASSWORD_ARGON2ID)]);
    $fabric=insert("INSERT INTO fabrics(code,category,material_type,texture,color,created_by) VALUES ('LIN-CREAM','curtain','Linen','Woven','Cream',?)",[$owner]);
    $roll=insert("INSERT INTO rolls(tag,fabric_id,received_cm,received_by) VALUES ('RL-001',?,5000,?)",[$fabric,$owner]);
    $job=insert("INSERT INTO jobs(ref,customer,output_type,output_qty,created_by) VALUES ('PJ-001','Test customer','set',1,?)",[$owner]);
    same(5000,roll_balance($roll),'Receipt balance');
    $cut=atomic(function()use($job,$roll,$owner){
        $id=insert('INSERT INTO cuts(job_id,roll_id,cut_cm,used_cm,offcut_cm,waste_cm,cut_by) VALUES (?,?,?,?,?,?,?)',[$job,$roll,800,760,25,15,$owner]);
        execute('INSERT INTO roll_movements(roll_id,change_cm,kind,ref_type,ref_id,actor_id) VALUES (?,?,?,?,?,?)',[$roll,-800,'cut','cut',$id,$owner]);
        insert('INSERT INTO remnants(cut_id,initial_cm,remaining_cm) VALUES (?,?,?)',[$id,25,25]);
        return $id;
    });
    same(4200,roll_balance($roll),'Balance after cut');
    $remnant=row('SELECT remaining_cm FROM remnants WHERE cut_id=?',[$cut]);
    same(25,(int)$remnant['remaining_cm'],'Reusable offcut');
    insert('INSERT INTO sewing_entries(job_id,cut_id,sewn_cm,worker_id) VALUES (?,?,?,?)',[$job,$cut,760,$tailor]);
    $output=row('SELECT u.name,SUM(s.sewn_cm) cm FROM sewing_entries s JOIN users u ON u.id=s.worker_id GROUP BY u.id');
    same('Amina',$output['name'],'Worker attribution');
    same(760,(int)$output['cm'],'Worker sewn metres');
    atomic(function()use($job,$owner){
        execute("UPDATE jobs SET status='finished',finished_by=? WHERE id=?",[$owner,$job]);
        insert("INSERT INTO finished_stock(job_id,output_type,initial_qty,remaining_qty) VALUES (?,'set',1,1)",[$job]);
    });
    same(4200,roll_balance($roll),'Finishing does not deduct roll again');
    $stock=row('SELECT id FROM finished_stock WHERE job_id=?',[$job]);
    execute('UPDATE finished_stock SET remaining_qty=remaining_qty-1 WHERE id=?',[(int)$stock['id']]);
    same(4200,roll_balance($roll),'Selling finished set does not deduct roll again');
    atomic(function()use($roll,$owner){
        execute('INSERT INTO roll_movements(roll_id,change_cm,kind,ref_type,ref_id,actor_id) VALUES (?,?,?,?,?,?)',[$roll,-300,'sale','sale',1,$owner]);
    });
    same(3900,roll_balance($roll),'Direct 3 m fabric sale');
    try {
        atomic(function()use($job,$roll,$owner){
            insert('INSERT INTO cuts(job_id,roll_id,cut_cm,used_cm,offcut_cm,waste_cm,cut_by) VALUES (?,?,?,?,?,?,?)',[$job,$roll,100,60,20,10,$owner]);
        });
        throw new RuntimeException('Invalid cut should have failed');
    } catch (PDOException $e) { /* CHECK constraint correctly rejected the mismatch. */ }
    same(1,(int)row('SELECT COUNT(*) n FROM cuts')['n'],'Invalid cut rolled back');
    echo "Smoke test passed: roll arithmetic, offcut, worker attribution, finished sale and cut constraint.\n";
} finally {
    db(); // Ensure database exists before removing test files.
    foreach ([$path,$path.'-wal',$path.'-shm'] as $file) @unlink($file);
}
