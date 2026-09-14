<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$config = require dirname(__DIR__) . '/api/config.php';
if (!preg_match('/\A[a-zA-Z0-9_]+\z/', $config['database'])) {
    fwrite(STDERR, "Invalid database name.\n");
    exit(1);
}
try {
    $pdo = new PDO(
        "mysql:host={$config['host']};port={$config['port']};charset=utf8mb4",
        $config['username'], $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 3]
    );
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$config['database']}` CHARACTER SET utf8mb4");
    $pdo->exec("USE `{$config['database']}`");
    $pdo->exec(file_get_contents(dirname(__DIR__) . '/database/schema.sql'));
    echo "Ready: {$config['database']}.play_results\n";
} catch (PDOException $error) {
    fwrite(STDERR, "Database setup failed. Check MySQL and api/config.local.php.\n");
    exit(1);
}
