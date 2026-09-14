<?php
// PHPの開発サーバー用。公開するパスをゲームとAPIに限定する。
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (in_array($path, ['/', '/index.html', '/game_portal.html', '/ranking.js', '/api/save_result.php', '/api/rankings.php'], true)) {
    return false;
}
http_response_code(404);
echo 'Not found';
