<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
requireMethod('POST');

if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
    respond(['error' => 'JSON形式で送信してください。'], 415);
}
$raw = file_get_contents('php://input', false, null, 0, 4097);
if (strlen($raw) > 4096) {
    respond(['error' => '送信データが大きすぎます。'], 413);
}
try {
    $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
} catch (JsonException $error) {
    respond(['error' => 'JSONの形式が正しくありません。'], 400);
}
if (!is_array($data)
    || !is_string($data['run_id'] ?? null)
    || !preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i', $data['run_id'])
    || !is_int($data['defeated_count'] ?? null)
    || $data['defeated_count'] < 0 || $data['defeated_count'] > 2147483647) {
    respond(['error' => 'プレイIDまたは撃破数が正しくありません。'], 422);
}
$catalog = weaponCatalog();
foreach (['weapon_1_id', 'weapon_2_id'] as $field) {
    if (!is_string($data[$field] ?? null) || !isset($catalog[$data[$field]])) {
        respond(['error' => '選択された武器が見つかりません。'], 422);
    }
}

$pdo = database();
$values = [strtolower($data['run_id']), $data['defeated_count'], $data['weapon_1_id'], $data['weapon_2_id']];
$duplicate = false;
try {
    $statement = $pdo->prepare('INSERT INTO play_results (run_id, defeated_count, weapon_1_id, weapon_2_id) VALUES (?, ?, ?, ?)');
    $statement->execute($values);
} catch (PDOException $error) {
    // 同じプレイの再送は更新せず、最初に保存された結果を保持する。
    if (($error->errorInfo[1] ?? null) !== 1062) throw $error;
    $duplicate = true;
}
$statement = $pdo->prepare('SELECT id, defeated_count, weapon_1_id, weapon_2_id FROM play_results WHERE run_id = ?');
$statement->execute([$values[0]]);
$saved = $statement->fetch();
if (!$saved || (int)$saved['defeated_count'] !== $values[1]
    || $saved['weapon_1_id'] !== $values[2] || $saved['weapon_2_id'] !== $values[3]) {
    respond(['error' => 'このプレイIDには別の結果が保存されています。'], 409);
}
respond(['saved' => true, 'id' => (int)$saved['id'], 'duplicate' => $duplicate], $duplicate ? 200 : 201);
