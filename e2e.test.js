const request = require('supertest');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { createApp } = require('./server');

let app;
let db;
let agent;

const TEST_ADMIN = 'test_admin_e2e';
const TEST_PASS = 'S3cureP@ssw0rd!E2E';

// テスト用のZIPファイルを作成するヘルパー関数
const createTestZip = (dir, files) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const zipPath = path.join(dir, 'test_backup.zip');
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');

        output.on('close', () => resolve(zipPath));
        archive.on('error', err => reject(err));
        archive.pipe(output);
        for (const [name, content] of Object.entries(files)) {
            archive.append(content, { name });
        }
        archive.finalize();
    });
};

describe('E2Eテスト: 全機能総点検（新アーキテクチャ版）', () => {

    // テスト全体の前に一度だけ実行
    beforeAll(async () => {
        db = new sqlite3.Database(':memory:');
        app = createApp(db);
        agent = request.agent(app); // ログインセッションを維持するためのエージェント

        // テスト用の管理者アカウントにsuperadmin権限を付与
        await new Promise((resolve, reject) => {
            db.serialize(async () => {
                try {
                    const saltRounds = 10;
                    const hash = await bcrypt.hash(TEST_PASS, saltRounds);
                    await new Promise((res, rej) => db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [TEST_ADMIN, hash], function (err) { if (err) rej(err); res(this.lastID); }));
                    await new Promise((res, rej) => db.run("INSERT INTO roles (role_name) VALUES ('superadmin')", function (err) { if (err) rej(err); res(); }));
                    const admin = await new Promise((res, rej) => db.get("SELECT id FROM admins WHERE username = ?", [TEST_ADMIN], (err, row) => err ? rej(err) : res(row)));
                    const role = await new Promise((res, rej) => db.get("SELECT id FROM roles WHERE role_name = 'superadmin'", (err, row) => err ? rej(err) : res(row)));
                    if (admin && role) {
                        await new Promise((res, rej) => db.run("INSERT INTO admin_roles (admin_id, role_id) VALUES (?, ?)", [admin.id, role.id], (err) => err ? rej(err) : res()));
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    });

    // テスト全体の後に一度だけ実行
    afterAll((done) => {
        db.close(done);
        const uploadDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadDir)) {
            fs.rmSync(uploadDir, { recursive: true, force: true });
        }
    });

    // === 認証APIテスト ===
    describe('認証API', () => {
        it('誤ったパスワードではログインできない', async () => {
            await agent.post('/api/login').send({ username: TEST_ADMIN, password: 'wrong_password' }).expect(401);
        });
        it('正しい情報でログインし、セッションを確立する', async () => {
            const res = await agent.post('/api/login').send({ username: TEST_ADMIN, password: TEST_PASS }).expect(200);
            expect(res.body.success).toBe(true);
        });
    });

    // === マスターデータと通常授業設定のテスト ===
    describe('マスターデータと通常授業設定', () => {
        it('授業コマ、PC、生徒を順番に作成できる', async () => {
            await agent.post('/api/class_slots').send({ day_of_week: 1, period: 1, slot_name: '月曜1限', start_time: '10:00', end_time: '11:30' }).expect(201);
            await agent.post('/api/class_slots').send({ day_of_week: 2, period: 1, slot_name: '火曜1限', start_time: '10:00', end_time: '11:30' }).expect(201);
            await agent.post('/api/pcs').send({ pc_id: 'PC-TEST', pc_name: 'テストPC' }).expect(201);
            await agent.post('/api/users').send({ user_id: 'U001', name: '月曜 通常生徒', user_level: '通常', default_slot_id: 1, default_pc_id: 'PC-TEST' }).expect(201);
            await agent.post('/api/users').send({ user_id: 'U002', name: '火曜 振替元生徒', user_level: '通常', default_slot_id: 2, default_pc_id: 'PC-TEST' }).expect(201);
        });

        it('生徒の通常授業を変更できる', async () => {
            const res = await agent.get('/api/users/U002').expect(200);
            const userData = res.body;
            await agent.put('/api/users/U002').send({ ...userData, default_slot_id: 1 }).expect(200);
            const updatedRes = await agent.get('/api/users/U002').expect(200);
            expect(updatedRes.body.default_slot_id).toBe(1);
        });
    });

    // === デイリー授業ボードのシナリオテスト ===
    describe('デイリー授業ボード (/api/daily-roster)', () => {
        const MONDAY = '2025-07-21';
        const TUESDAY = '2025-07-22';

        it('通常授業の日に、設定された生徒が正しく表示される', async () => {
            const res = await agent.get(`/api/daily-roster?date=${MONDAY}`).expect(200);
            expect(res.body.length).toBe(2);
            expect(res.body.some(s => s.user_id === 'U001' && s.status === '通常')).toBe(true);
            expect(res.body.some(s => s.user_id === 'U002' && s.status === '通常')).toBe(true);
        });

        it('振替と欠席を登録すると、デイリー授業ボードに正しく反映される', async () => {
            await agent.post('/api/schedules').send({ user_id: 'U002', class_date: TUESDAY, slot_id: 2, status: '振替', original_class_date: MONDAY }).expect(201);
            const mondayRes = await agent.get(`/api/daily-roster?date=${MONDAY}`).expect(200);
            expect(mondayRes.body.some(s => s.user_id === 'U001' && s.status === '通常')).toBe(true);
            expect(mondayRes.body.some(s => s.user_id === 'U002' && s.status === '欠席')).toBe(true);
            const tuesdayRes = await agent.get(`/api/daily-roster?date=${TUESDAY}`).expect(200);
            expect(tuesdayRes.body.some(s => s.user_id === 'U002' && s.status === '振替')).toBe(true);
        });

        it('授業がない日には空の配列が返る', async () => {
            const SUNDAY = '2025-07-20';
            const res = await agent.get(`/api/daily-roster?date=${SUNDAY}`).expect(200);
            expect(res.body).toEqual([]);
        });
    });

    // === 出席漏れ一括処理のテスト ===
    describe('出席漏れ一括処理 (/api/unaccounted)', () => {
        const WEDNESDAY = '2025-07-23';
        beforeAll(async () => {
            await agent.post('/api/class_slots').send({ day_of_week: 3, period: 1, slot_name: '水曜1限', start_time: '10:00', end_time: '11:30' }).expect(201);
            await agent.post('/api/users').send({ user_id: 'U003', name: '水曜 未出席生徒', user_level: '通常', default_slot_id: 3 }).expect(201);
        });

        it('出席記録がない生徒がリストに表示される', async () => {
            const res = await agent.get(`/api/unaccounted?date=${WEDNESDAY}`).expect(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].user_id).toBe('U003');
        });

        it('出席を記録するとリストから消える', async () => {
            const logTime = new Date(`${WEDNESDAY}T12:00:00+09:00`).toISOString();
            await agent.post('/api/entry_logs').send({ user_id: 'U003', log_type: 'entry', log_time: logTime }).expect(201);
            const res = await agent.get(`/api/unaccounted?date=${WEDNESDAY}`).expect(200);
            expect(res.body).toEqual([]);
        });
    });

    // === インポート/エクスポートテスト ===
    describe('インポート/エクスポートAPI', () => {
        it('エクスポートAPI: ZIPファイルをダウンロードできる', async () => {
            await agent.get('/api/export').expect(200).expect('Content-Type', /zip/);
        });

        it('インポートAPI: ZIPファイルでデータをリストアできる', async () => {
            // ▼▼▼【修正点】インポートするZIPファイルに、管理者と権限の情報を追加する▼▼▼
            const adminUser = await new Promise((res, rej) => db.get("SELECT * FROM admins WHERE username = ?", [TEST_ADMIN], (err, row) => err ? rej(err) : res(row)));

            const csvData = {
                'admins.csv': `id,username,password_hash\n${adminUser.id},${adminUser.username},${adminUser.password_hash}`,
                'roles.csv': 'id,role_name\n1,superadmin',
                'admin_roles.csv': 'admin_id,role_id\n1,1',
                'class_slots.csv': 'slot_id,day_of_week,period,slot_name,start_time,end_time\n1,1,1,インポートされた月曜1限,10:00,11:30',
                'users.csv': 'user_id,name,email,user_level,default_pc_id,default_slot_id\nU999,ImportUser,,通常,,1'
            };
            const zipPath = await createTestZip(path.join(__dirname, 'uploads'), csvData);

            await agent.post('/api/import').attach('backupFile', zipPath).expect(200);

            const usersRes = await agent.get('/api/users').expect(200);
            expect(usersRes.body.users.some(u => u.user_id === 'U999' && u.default_slot_id === 1)).toBe(true);
        }, 10000);
    });
});