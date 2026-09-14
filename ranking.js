// 通信と1プレイ分の結果を管理。ゲームの描画ループからは独立して動作する。
class InvaderRanking {
    constructor(baseUrl = 'api/') {
        this.baseUrl = baseUrl;
        this.run = null;
        this.result = null;
        this.board = { status: 'idle', rows: [], error: '' };
        this.requestVersion = 0;
    }

    beginRun(weapons) {
        // getRandomValuesはHTTPのローカル仮想ホストでも使用できる。
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        this.run = {
            id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
            weapons: weapons.map(w => Object.freeze({ id: w.id, name: w.name })),
            finished: false
        };
        this.result = null;
    }

    finishRun(count, outcome) {
        if (!this.run || this.run.finished) return this.result;
        this.run.finished = true;
        const result = {
            payload: Object.freeze({
                run_id: this.run.id,
                defeated_count: count,
                weapon_1_id: this.run.weapons[0].id,
                weapon_2_id: this.run.weapons[1].id
            }),
            weapons: this.run.weapons,
            outcome,
            status: 'idle', error: '', savedId: null, promise: null
        };
        this.result = result;
        this.saveResult(result);
        return result;
    }

    async request(path, options = {}) {
        if (!/^https?:$/.test(location.protocol)) {
            throw new Error('ローカルサーバーからゲームを開いてください。');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(this.baseUrl + path, {
                ...options, signal: controller.signal, cache: 'no-store'
            });
            let data;
            try { data = await response.json(); }
            catch { throw new Error('ランキングAPIが見つかりません。PHPの起動を確認してください。'); }
            if (!response.ok) throw new Error(data.error || 'ランキング通信に失敗しました。');
            return data;
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('通信がタイムアウトしました。再試行してください。');
            if (error instanceof TypeError) throw new Error('サーバーに接続できません。起動を確認してください。');
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    saveResult(result = this.result) {
        if (!result || result.status === 'saved') return Promise.resolve();
        if (result.status === 'saving') return result.promise;
        result.status = 'saving';
        result.error = '';
        result.promise = this.request('save_result.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.payload), keepalive: true
        }).then(data => {
            if (data.saved !== true || !Number.isInteger(data.id)) throw new Error('保存結果を確認できません。再試行してください。');
            result.savedId = data.id;
            result.status = 'saved';
        }).catch(error => {
            result.status = 'error';
            result.error = error.message;
        });
        return result.promise;
    }

    async loadRankings() {
        const version = ++this.requestVersion;
        this.board = { status: 'loading', rows: [], error: '' };
        // 結果画面から開いた場合、自分の保存が完了してから一覧を取得する。
        if (this.result?.status === 'saving') await this.result.promise;
        try {
            const data = await this.request('rankings.php');
            if (!Array.isArray(data.rankings) || data.rankings.length > 10 || data.rankings.some(row =>
                !Number.isInteger(row.id) || !Number.isInteger(row.rank) || row.rank < 1 ||
                !Number.isInteger(row.defeated_count) || row.defeated_count < 0 ||
                typeof row.weapon_1_name !== 'string' || typeof row.weapon_2_name !== 'string')) {
                throw new Error('ランキングの形式が正しくありません。');
            }
            if (version === this.requestVersion) this.board = { status: 'ready', rows: data.rankings, error: '' };
        } catch (error) {
            if (version === this.requestVersion) this.board = { status: 'error', rows: [], error: error.message };
        }
    }
}
window.InvaderRanking = InvaderRanking;
