<?php
declare(strict_types=1);
$path=sys_get_temp_dir().'/trendy-rolls-'.bin2hex(random_bytes(6)).'.sqlite';
putenv('TRENDY_DB_PATH='.$path);
require dirname(__DIR__).'/src/Api.php';
function expect_roll(bool $ok,string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $user=insert("INSERT INTO users(username,name,role,password_hash) VALUES ('owner','Owner','owner',?)",[password_hash('test-only-password',PASSWORD_ARGON2ID)]);
    $fabric=insert("INSERT INTO fabrics(code,category,material_type,texture,color,width_cm,created_by) VALUES ('BLK-ROSE','curtain','Blackout','Woven','Rose',280,?)",[$user]);
    insert("INSERT INTO rolls(tag,fabric_id,received_cm,received_by) VALUES ('R00002',?,1000,?)",[$fabric,$user]);
    $data=['fabric_id'=>$fabric,'received_cm'=>2450,'stated_cm'=>2500,'cost_cents'=>360000,
        'supplier'=>'Eastleigh Fabrics','supplier_building'=>'Test Plaza','supplier_stall'=>'B12',
        'dye_lot'=>'LOT-7','invoice_ref'=>'INV-12','purchase_date'=>'2026-10-21','location'=>'Shelf 3'];
    $first=receive_roll_record($data,$user);
    expect_roll($first['tag']==='R00003','Generated code should skip a legacy code');
    $saved=row('SELECT * FROM rolls WHERE id=?',[$first['id']]);
    expect_roll($saved['dye_lot']==='LOT-7' && $saved['supplier_stall']==='B12','Supplier and lot details were not saved');
    expect_roll((int)$saved['stated_cm']===2500 && (int)$saved['received_cm']===2450,'Stated and measured lengths were mixed');
    $second=receive_roll_record($data,$user);
    expect_roll($second['tag']==='R00004','Subsequent roll must have its own code');
    $newFabric=['code'=>'SHEER-IVORY','category'=>'shia','material_type'=>'Voile','texture'=>'Smooth','color'=>'Ivory',
        'design'=>'Plain','shade_code'=>'IV-2','width_cm'=>300,'opacity'=>'sheer','weight_gsm'=>110,
        'care_instructions'=>'Hand wash','retail_price_cents'=>180000];
    $combined=receive_roll_record([...$data,'new_fabric'=>$newFabric,'included_services'=>'Eyelets included','remnant_alert_cm'=>200],$user);
    $combinedRow=row('SELECT r.*,f.code,f.width_cm,f.opacity FROM rolls r JOIN fabrics f ON f.id=r.fabric_id WHERE r.id=?',[$combined['id']]);
    expect_roll($combined['tag']==='R00005' && $combinedRow['code']==='SHEER-IVORY','New fabric and roll should save together');
    expect_roll((int)$combinedRow['width_cm']===300 && $combinedRow['included_services']==='Eyelets included','Fabric and purchase details were lost');
    try { receive_roll_record([...$data,'new_fabric'=>[...$newFabric,'code'=>'DUPLICATE']],$user,false); throw new RuntimeException('Cutter created a fabric'); }
    catch (ApiFailure $error) { expect_roll($error->status===403,'Cutter should not create fabric'); }
    $before=(int)row('SELECT COUNT(*) n FROM rolls')['n'];
    try { receive_roll_record([...$data,'new_fabric'=>$newFabric],$user); throw new RuntimeException('Duplicate fabric code accepted'); }
    catch (PDOException $error) { expect_roll(str_contains($error->getMessage(),'UNIQUE'),'Duplicate design should fail'); }
    expect_roll((int)row('SELECT COUNT(*) n FROM rolls')['n']===$before,'Failed combined intake should not add a roll');
    try { receive_roll_record([...$data,'purchase_date'=>'2026-02-30'],$user); throw new RuntimeException('Invalid date accepted'); }
    catch (ApiFailure $error) { expect_roll($error->status===400,'Invalid date should return 400'); }
    expect_roll((int)row('SELECT COUNT(*) n FROM rolls')['n']===4,'Invalid receipt should not add a roll');
    echo "Roll receiving test passed: generated codes, single-save fabric and roll, purchase details and validation.\n";
} finally {
    foreach ([$path,$path.'-wal',$path.'-shm'] as $file) @unlink($file);
}
