<?php
declare(strict_types=1);

// Laragonの初期設定。異なる環境では環境変数またはconfig.local.phpで上書きする。
$config = [
    'host' => getenv('INVADER_DB_HOST') ?: '127.0.0.1',
    'port' => getenv('INVADER_DB_PORT') ?: '3306',
    'database' => getenv('INVADER_DB_NAME') ?: 'invader_attack',
    'username' => getenv('INVADER_DB_USER') ?: 'root',
    'password' => getenv('INVADER_DB_PASSWORD') !== false ? getenv('INVADER_DB_PASSWORD') : '',
];
if (is_file(__DIR__ . '/config.local.php')) {
    $config = array_replace($config, require __DIR__ . '/config.local.php');
}
return $config;
