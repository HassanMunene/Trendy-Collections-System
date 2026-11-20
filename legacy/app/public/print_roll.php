<?php
declare(strict_types=1);
$safe=static fn(mixed $value): string => htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roll <?= $safe($roll['tag']) ?> label</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:20px;background:#f8f2f5;color:#301c26;font:13px system-ui,sans-serif}.controls{max-width:420px;margin:0 auto 15px}.controls button{min-height:44px;border:0;border-radius:9px;padding:10px 17px;background:#923c61;color:#fff;font-weight:700}.controls p{line-height:1.5;color:#66545d}.label{width:70mm;min-height:45mm;margin:auto;padding:4mm;border:1px solid #aaa;background:#fff;overflow:hidden}.brand{font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:#923c61}.tag{font-size:33px;font-weight:900;line-height:1.1;letter-spacing:.02em;margin:2mm 0}.fabric{font-size:11px;font-weight:750;line-height:1.25}.details{font-size:9px;line-height:1.4;margin-top:2mm}.details span{display:block} @page{size:70mm 45mm;margin:0}@media print{body{padding:0;background:#fff}.controls{display:none}.label{border:0;margin:0;width:70mm;height:45mm;min-height:0}}
</style></head><body>
<div class="controls"><button onclick="window.print()">Print label</button><p>This label shows the roll code in large type for manual entry on a phone. Use your browser's print dialog with a compatible label printer, or write the code on the roll.</p></div>
<main class="label" aria-label="Roll label"><div class="brand">Trendy Collections · Fabric roll</div><div class="tag"><?= $safe($roll['tag']) ?></div><div class="fabric"><?= $safe($roll['code']) ?> · <?= $safe($roll['color']) ?></div><div class="details"><span><?= $safe($roll['material_type']) ?> · <?= $safe($roll['texture']) ?><?= $roll['width_cm'] ? ' · '.$safe($roll['width_cm']).' cm wide' : '' ?></span><span><?= $roll['dye_lot']!=='' ? 'Dye lot '.$safe($roll['dye_lot']).' · ' : '' ?>Received <?= number_format((int)$roll['received_cm']/100,2) ?> m</span></div></main>
</body></html>
