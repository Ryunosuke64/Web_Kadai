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

async function main() {
    // 個別設定ファイルがテストDB指定を上書きする場合は、実データに触る前に停止。
    const config = spawnSync(php, ['-r', 'echo (require "api/config.php")["database"];'], {env, encoding:'utf8'});
    if (config.error) throw config.error;
    assert.equal(config.stdout, dbName, 'config.local.phpのdatabase指定を外してテストしてください。');
    const setup = spawnSync(php, ['scripts/setup-db.php'], {env, encoding:'utf8'});
    assert.equal(setup.status, 0, setup.stderr);
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
    assert.deepEqual((await read('api/rankings.php')).data.rankings, []);
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
    // 専用DBだけを削除して、DB利用不可時のJSONエラーを検証する。
    assert.match(dbName, /^invader_test_[0-9a-f]{32}$/);
    const removed = spawnSync(php, ['-r', 'require "api/bootstrap.php"; database()->exec("DROP DATABASE `" . getenv("INVADER_DB_NAME") . "`");'], {env, encoding:'utf8'});
    assert.equal(removed.status, 0);
    assert.equal(removed.stdout, '');
    databaseCreated = false;
    const unavailable = await read('api/rankings.php');
    assert.equal(unavailable.status, 503);
    assert.equal(typeof unavailable.data.error, 'string');
    assert.equal(unavailable.data.error.includes('SQLSTATE'), false);
    console.log('PASS: MySQL save, zero kills, duplicate, conflict, validation, names, tied ranks, top 10, private paths, DB unavailable');
}
main().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
    if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
    if (databaseCreated) {
        assert.match(dbName, /^invader_test_[0-9a-f]{32}$/);
        const cleanup = spawnSync(php, ['-r', 'require "api/bootstrap.php"; database()->exec("DROP DATABASE `" . getenv("INVADER_DB_NAME") . "`");'], {env, encoding:'utf8'});
        if (cleanup.status !== 0 || cleanup.stdout) { console.error('Test DB cleanup failed', cleanup.stderr); process.exitCode=1; }
    }
});
