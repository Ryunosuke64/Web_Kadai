<?php
declare(strict_types=1);

// ローカルのLaragon向け。初回のAPIアクセスで保存先を準備する。
function database(): PDO
{
    $config = require __DIR__ . '/config.php';
    if (!preg_match('/\A[a-zA-Z0-9_]+\z/', $config['database'])) {
        throw new RuntimeException('Invalid database name.');
    }
    $dsn = "mysql:host={$config['host']};port={$config['port']};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 3,
    ];
    try {
        $pdo = new PDO($dsn . ";dbname={$config['database']}", $config['username'], $config['password'], $options);
    } catch (PDOException $error) {
        // DBが存在しない場合だけ作成する。接続・認証エラーはそのまま通知する。
        if (($error->errorInfo[1] ?? null) !== 1049) throw $error;
        $pdo = new PDO($dsn, $config['username'], $config['password'], $options);
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$config['database']}` CHARACTER SET utf8mb4");
        $pdo->exec("USE `{$config['database']}`");
    }
    try {
        // 行を読み込まずに存在確認する。通常のリクエストではDDLを実行しない。
        $pdo->query('SELECT 1 FROM play_results LIMIT 0')->closeCursor();
    } catch (PDOException $error) {
        if (($error->errorInfo[1] ?? null) !== 1146) throw $error;
        $schema = file_get_contents(dirname(__DIR__) . '/database/schema.sql');
        if ($schema === false) throw new RuntimeException('Database schema was not found.');
        $pdo->exec($schema);
    }
    return $pdo;
}
