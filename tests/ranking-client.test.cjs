const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function client(fetch) {
    const context = { window: {}, crypto: webcrypto, location: { protocol: 'http:' }, fetch,
        AbortController, setTimeout, clearTimeout, TypeError };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('ranking.js', 'utf8'), context);
    return new context.window.InvaderRanking();
}
const weapons = () => [{id:'weapon_001', name:'AS-26'}, {id:'weapon_019', name:'ロケットランチャー'}];
const ok = data => ({ok:true, json:async () => data});

test('終了を複数回呼んでも一度だけ送信し、出撃時の装備を保存する', async () => {
    const calls = [];
    const ranking = client(async (url, options) => { calls.push(JSON.parse(options.body)); return ok({saved:true, id:1}); });
    const loadout = weapons();
    ranking.beginRun(loadout);
    loadout[0].id = 'weapon_002';
    const result = ranking.finishRun(23, 'defeat');
    ranking.finishRun(999, 'clear');
    await result.promise;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].weapon_1_id, 'weapon_001');
    assert.equal(calls[0].defeated_count, 23);
    assert.equal(result.status, 'saved');
    assert.match(calls[0].run_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('通信失敗後の再試行は同じ結果を再送する', async () => {
    const bodies = [];
    const ranking = client(async (url, options) => {
        bodies.push(options.body);
        if (bodies.length === 1) throw new TypeError('offline');
        return ok({saved:true, id:2, duplicate:true});
    });
    ranking.beginRun(weapons());
    const result = ranking.finishRun(300, 'clear');
    await result.promise;
    assert.equal(result.status, 'error');
    await ranking.saveResult();
    assert.equal(result.status, 'saved');
    assert.equal(bodies[0], bodies[1]);
});

test('前のプレイの遅延応答が次のプレイの結果を書き換えない', async () => {
    const pending = [];
    const ranking = client(() => new Promise(resolve => pending.push(resolve)));
    ranking.beginRun(weapons());
    const first = ranking.finishRun(10, 'defeat');
    ranking.beginRun(weapons());
    const second = ranking.finishRun(20, 'defeat');
    pending[0](ok({saved:true, id:1}));
    await first.promise;
    assert.equal(ranking.result, second);
    assert.equal(second.status, 'saving');
    pending[1](ok({saved:true, id:2}));
    await second.promise;
});

test('ランキング取得は保存を待ち、古い取得応答は表示しない', async () => {
    const pending = [];
    const ranking = client((url) => new Promise(resolve => pending.push({url, resolve})));
    ranking.beginRun(weapons());
    const result = ranking.finishRun(0, 'defeat');
    const first = ranking.loadRankings();
    assert.equal(pending.length, 1);
    pending[0].resolve(ok({saved:true, id:5}));
    await result.promise;
    await Promise.resolve();
    assert.equal(pending[1].url, 'api/rankings.php');
    const second = ranking.loadRankings();
    pending[2].resolve(ok({rankings:[]}));
    await second;
    pending[1].resolve({ok:false, json:async () => ({error:'old failure'})});
    await first;
    assert.equal(ranking.board.status, 'ready');
});

test('ゲームの全42武器とサーバーの固定ID・表示名が一致する', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
    scripts.forEach(script => new vm.Script(script));
    const code = scripts[0];
    const context = { console }; vm.createContext(context);
    vm.runInContext(code.slice(code.indexOf('const WEAPON_FPS'), code.indexOf('// F12')) + '\nthis.weapons = WEAPON_CATEGORIES.flatMap(c => c.weapons);', context);
    const catalog = JSON.parse(fs.readFileSync('api/weapons.json','utf8'));
    assert.equal(context.weapons.length, 42);
    assert.equal(Object.keys(catalog).length, 42);
    const ids = new Set();
    for (const weapon of context.weapons) {
        assert.equal(ids.has(weapon.id), false);
        ids.add(weapon.id);
        assert.equal(catalog[weapon.id], weapon.name);
    }
});

test('実際のゲーム終了処理がクリア・敗北を結果画面に送り、表示用の撃破数を固定する', async () => {
    for (const outcome of ['clear', 'defeat']) {
        const calls = [];
        const context = { console, window:{},
            document:{getElementById:() => ({getContext:() => ({})}), addEventListener:() => {}},
            crypto:webcrypto, location:{protocol:'http:'}, setTimeout, clearTimeout, AbortController,
            fetch:async (url, options) => {calls.push(JSON.parse(options.body)); return ok({saved:true,id:1});} };
        vm.createContext(context);
        vm.runInContext(fs.readFileSync('ranking.js','utf8'), context);
        const html = fs.readFileSync('index.html','utf8');
        const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.trim());
        vm.runInContext(script, context);
        vm.runInContext(`
            ranking.beginRun([WEAPON_CATEGORIES[0].weapons[0], WEAPON_CATEGORIES[3].weapons[0]]);
            defeatedCount = 127;
            keys.enter = true;
            isMouseDown = true;
            finishGame('${outcome}');
            defeatedCount = 0;
            this.testState = {scene:currentScene, result:ranking.result, enter:keys.enter, mouse:isMouseDown};
        `, context);
        await context.testState.result.promise;
        assert.equal(context.testState.scene, 4);
        assert.equal(context.testState.result.outcome, outcome);
        assert.equal(context.testState.result.payload.defeated_count, 127);
        assert.equal(context.testState.enter, false);
        assert.equal(context.testState.mouse, false);
        assert.equal(calls.length, 1);
    }
});
