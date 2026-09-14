// テストごとに専用DBを作り、終了時にそのDBだけを削除する。
// node tests/api.test.cjs "C:/laragon/bin/php/<version>/php.exe"
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const net = require('node:net');
const php = process.argv[2] || 'php';
const dbName = 'invader_test_' + randomUUID().replaceAll('-', '');
const env = {...process.env, INVADER_DB_NAME:dbName};
let server;
let databaseCreated = false;

function sql(statement) {
    assert.match(dbName, /^invader_test_[0-9a-f]{32}$/);
    const result = spawnSync(php, ['-r', `
        $config = require "api/config.php";
        $pdo = new PDO("mysql:host={$config['host']};port={$config['port']};charset=utf8mb4",
            $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec(getenv("INVADER_TEST_SQL"));
    `], {env:{...env, INVADER_TEST_SQL:statement}, encoding:'utf8'});
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
}

async function main() {
    // 個別設定ファイルがテストDB指定を上書きする場合は、実データに触る前に停止。
    const config = spawnSync(php, ['-r', 'echo (require "api/config.php")["database"];'], {env, encoding:'utf8'});
    if (config.error) throw config.error;
    assert.equal(config.stdout, dbName, 'config.local.phpのdatabase指定を外してテストしてください。');
    // setup-db.phpを実行せず、APIだけで初期化できることを確認する。
    databaseCreated = true;
    const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
    const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    server = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', '.', 'scripts/router.php'], {env, windowsHide:true, stdio:'ignore'});
    const base = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 50; i++) {
        try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    const read = async path => { const response = await fetch(base + path); return {status:response.status, data:await response.json()}; };
    const save = async (body, type='application/json') => {
        const response = await fetch(base+'api/save_result.php', {method:'POST', headers:{'Content-Type':type}, body:typeof body === 'string' ? body : JSON.stringify(body)});
        return {status:response.status, data:await response.json()};
    };
    const result = count => ({run_id:randomUUID(), defeated_count:count, weapon_1_id:'weapon_001', weapon_2_id:'weapon_042'});
    const empty = await read('api/rankings.php');
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.data.rankings, []);
    // DBだけ存在する場合も、初回保存時にテーブルが作成される。
    sql(`DROP TABLE \`${dbName}\`.play_results`);
    assert.equal((await read('api/save_result.php')).status, 405);
    assert.equal((await save('{')).status, 400);
    assert.equal((await save(result(1), 'text/plain')).status, 415);
    for (const count of [-1, 1.5, '12', 2147483648, null]) assert.equal((await save(result(count))).status, 422);
    assert.equal((await save({...result(1), run_id:'bad-id'})).status, 422);
    assert.equal((await save({...result(1), weapon_1_id:'unknown'})).status, 422);
    assert.equal((await save(' '.repeat(4097))).status, 413);
    const first = result(300);
    const saved = await save(first); assert.equal(saved.status, 201);
    const duplicate = await save(first); assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.id, saved.data.id);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal((await save({...first, defeated_count:301})).status, 409);
    assert.equal((await save(result(300))).status, 201);
    assert.equal((await save(result(0))).status, 201);
    let rows = (await read('api/rankings.php')).data.rankings;
    assert.deepEqual(rows.map(r => r.rank), [1,1,3]);
    assert.deepEqual(rows.map(r => r.defeated_count), [300,300,0]);
    assert.equal(rows[0].weapon_1_name, 'AS-26');
    const catalog = JSON.parse(fs.readFileSync('api/weapons.json','utf8'));
    assert.equal(rows[0].weapon_2_name, catalog.weapon_042);
    for (let i=1; i<=11; i++) await save(result(i));
    rows = (await read('api/rankings.php')).data.rankings;
    assert.equal(rows.length, 10);
    assert.deepEqual(rows.map(r => r.defeated_count), [300,300,11,10,9,8,7,6,5,4]);
    assert.equal((await fetch(base+'scripts/setup-db.php')).status, 404);
    // 通常のアクセスと明示的な初期化を繰り返しても記録を保持する。
    const setup = spawnSync(php, ['scripts/setup-db.php'], {env, encoding:'utf8'});
    assert.equal(setup.status, 0, setup.stderr);
    assert.deepEqual((await read('api/rankings.php')).data.rankings, rows);
    // ランキングを開かず初回保存した場合もDBから自動作成される。
    sql(`DROP DATABASE \`${dbName}\``);
    const fresh = result(42);
    assert.equal((await save(fresh)).status, 201);
    assert.deepEqual((await read('api/rankings.php')).data.rankings.map(r => r.defeated_count), [42]);
    // 既存テーブルの異常は、作り直してデータを消さずJSONエラーにする。
    sql(`ALTER TABLE \`${dbName}\`.play_results DROP COLUMN weapon_1_id`);
    const unavailable = await read('api/rankings.php');
    assert.equal(unavailable.status, 503);
    assert.equal(typeof unavailable.data.error, 'string');
    assert.equal(unavailable.data.error.includes('SQLSTATE'), false);
    assert.equal((await save(result(1))).status, 503);
    sql(`ALTER TABLE \`${dbName}\`.play_results ADD COLUMN weapon_1_id VARCHAR(64) NOT NULL DEFAULT 'weapon_001'`);
    assert.deepEqual((await read('api/rankings.php')).data.rankings.map(r => r.defeated_count), [42]);
    console.log('PASS: automatic DB/table setup on read/save, preserved records, zero kills, duplicate, conflict, validation, names, tied ranks, top 10, private paths, DB error');
}
main().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
    if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
    if (databaseCreated) {
        sql(`DROP DATABASE IF EXISTS \`${dbName}\``);
    }
});
