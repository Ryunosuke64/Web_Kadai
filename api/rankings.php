<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
requireMethod('GET');

$pdo = database();
$rows = $pdo->query('SELECT id, defeated_count, weapon_1_id, weapon_2_id FROM play_results ORDER BY defeated_count DESC, id ASC LIMIT 10')->fetchAll();
$catalog = weaponCatalog();
$previousCount = null;
$rank = 0;
$results = [];
foreach ($rows as $index => $row) {
    $count = (int)$row['defeated_count'];
    if ($count !== $previousCount) $rank = $index + 1;
    $previousCount = $count;
    $results[] = [
        'id' => (int)$row['id'],
        'rank' => $rank,
        'defeated_count' => $count,
        'weapon_1_name' => $catalog[$row['weapon_1_id']] ?? $row['weapon_1_id'],
        'weapon_2_name' => $catalog[$row['weapon_2_id']] ?? $row['weapon_2_id'],
    ];
}
respond(['rankings' => $results]);
