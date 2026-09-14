<?php
declare(strict_types=1);

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function requireMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        respond(['error' => 'このHTTPメソッドには対応していません。'], 405);
    }
}

function database(): PDO
{
    $config = require __DIR__ . '/config.php';
    return new PDO(
        "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4",
        $config['username'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
         PDO::ATTR_EMULATE_PREPARES => false,
         PDO::ATTR_TIMEOUT => 3]
    );
}

function weaponCatalog(): array
{
    return json_decode(file_get_contents(__DIR__ . '/weapons.json'), true, 512, JSON_THROW_ON_ERROR);
}

set_exception_handler(function (Throwable $error): void {
    error_log('[Invader ranking] ' . $error->getMessage());
    respond(['error' => 'ランキングに接続できません。サーバーの起動とDB設定を確認してください。'], 503);
});
