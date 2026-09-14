<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/api/database.php';
try {
    database();
    $config = require dirname(__DIR__) . '/api/config.php';
    echo "Ready: {$config['database']}.play_results\n";
} catch (Throwable $error) {
    fwrite(STDERR, "Database setup failed. Check MySQL and api/config.local.php.\n");
    exit(1);
}
