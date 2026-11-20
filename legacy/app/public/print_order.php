<?php
declare(strict_types=1);
function h(mixed $value): string { return htmlspecialchars((string)($value??''),ENT_QUOTES,'UTF-8'); }
$grouped=[];
foreach ($order['items'] as $item) $grouped[(int)$item['opening_id']][]=$item;
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workroom card <?=h($order['ref'])?></title>
<style>
*{box-sizing:border-box}body{font:14px/1.45 system-ui,sans-serif;color:#2e1821;margin:0;background:#f2edef}.sheet{max-width:850px;margin:25px auto;padding:35px;background:white;box-shadow:0 3px 25px #0001}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #4c2434;padding-bottom:18px}.brand{font:26px Georgia,serif;margin:0}.muted{color:#65766a}.label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#79646c;font-weight:700}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:25px 0}.meta strong{display:block;font-size:16px}.opening{border:1px solid #dbcfd4;border-radius:8px;margin:18px 0;break-inside:avoid}.opening h2{font:21px Georgia,serif;background:#f3ecef;padding:12px 15px;margin:0}.opening-content{padding:14px 15px}.specs{display:flex;gap:20px;flex-wrap:wrap;margin:0 0 14px}.item{border-top:1px solid #e6dfe2;padding:12px 0}.item:first-of-type{border-top:0}.item strong{font-size:16px}.item p{margin:5px 0}.warning{border-left:4px solid #ad783a;background:#fff7ea;padding:10px 13px;margin:22px 0}.signoff{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:35px}.signoff div{border-top:1px solid #778a7a;padding-top:6px}.print{display:block;margin:20px auto;background:#4c2434;color:white;border:0;border-radius:7px;padding:10px 18px;cursor:pointer}@media print{body{background:white}.sheet{box-shadow:none;margin:0;max-width:none;padding:0}.print{display:none}@page{size:A4;margin:15mm}}
</style></head><body><button class="print" onclick="window.print()">Print card</button><main class="sheet">
<header class="top"><div><p class="brand">Trendy Collections</p><div class="muted">Workroom specification · confirmed order</div></div><div><div class="label">Order reference</div><strong><?=h($order['ref'])?></strong></div></header>
<div class="meta"><div><span class="label">Customer</span><strong><?=h($order['customer_name'])?></strong><span><?=h($order['customer_phone'])?></span></div><div><span class="label">Due date</span><strong><?=h($order['due_date']?:'Not set')?></strong></div><div><span class="label">Confirmed</span><strong><?=h($order['confirmed_at'])?></strong></div></div>
<?php if ($order['notes']!==''): ?><p><strong>Order notes:</strong> <?=nl2br(h($order['notes']))?></p><?php endif; ?>
<?php foreach ($order['openings'] as $opening): ?>
<section class="opening"><h2><?=h($opening['room'])?></h2><div class="opening-content"><div class="specs"><div><span class="label">Width</span><br><strong><?=h($opening['width_cm'])?> cm</strong></div><div><span class="label">Drop</span><br><strong><?=h($opening['drop_cm'])?> cm</strong></div><div><span class="label">Measurements from</span><br><strong><?=h($opening['measurement_source'])?></strong></div></div>
<?php if ($opening['notes']!==''): ?><p><strong>Measurement notes:</strong> <?=nl2br(h($opening['notes']))?></p><?php endif; ?>
<?php foreach ($grouped[(int)$opening['id']]??[] as $item): ?>
<div class="item"><strong><?=h($item['quantity'])?> <?=h(str_replace('_',' ',$item['item_type']))?><?php if ($item['item_type']==='set'): ?> · <?=h($item['piece_count'])?> curtain pieces per set<?php endif; ?></strong>
<p>Main fabric: <?=h($item['fabric_code'])?> · <?=h($item['fabric_color'])?></p>
<?php if ($item['shia_code']): ?><p>Included shia fabric: <?=h($item['shia_code'])?> · <?=h($item['shia_color'])?></p><?php endif; ?>
<?php if ($item['heading']!=='' || $item['fullness_x100']): ?><p>Heading/style: <?=h($item['heading']?:'Not specified')?><?php if ($item['fullness_x100']): ?> · Fullness <?=h(number_format((int)$item['fullness_x100']/100,2))?>×<?php endif; ?></p><?php endif; ?>
<?php if ($item['notes']!==''): ?><p>Making notes: <?=nl2br(h($item['notes']))?></p><?php endif; ?></div>
<?php endforeach; ?></div></section>
<?php endforeach; ?>
<div class="warning"><strong>Cut planning required.</strong> This card records the approved measurements and choices. A cutter must confirm cut lengths, allowances and selected rolls before cutting; no automatic metre calculation has been approved.</div>
<div class="signoff"><div>Cutter / date</div><div>Tailor / date</div><div>Checker / date</div></div>
</main></body></html>
