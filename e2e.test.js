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

// (ヘルパー関数は変更なし)
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

describe('E2Eテスト: 全機能総点検', () => {

    beforeAll(async () => {
        db = new sqlite3.Database(':memory:');
        app = createApp(db);
        agent = request.agent(app);

        const saltRounds = 10;
        const hash = await bcrypt.hash(TEST_PASS, saltRounds);
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [TEST_ADMIN, hash], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    });

    afterAll((done) => {
        db.close(done);
        const uploadDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadDir)) {
            fs.rmSync(uploadDir, { recursive: true, force: true });
        }
    });

    // (認証APIテストは変更なし)
    describe('認証APIテスト', () => {
        it('誤ったパスワードではログインできない', async () => {
            await agent.post('/api/login').send({ username: TEST_ADMIN, password: 'wrong_password' }).expect(401);
        });
        it('正しい情報でログインできる', async () => {
            const res = await agent.post('/api/login').send({ username: TEST_ADMIN, password: TEST_PASS }).expect(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('マスタデータCRUDテスト', () => {
        // これらの変数は、この describe ブロック内の全てのテストで共有される
        let testPcId;
        let testUserId;
        let testSlotIdMon;
        let testSlotIdTue;

        // beforeAll は、このブロック内のどのテストよりも先に一度だけ実行される
        beforeAll(async () => {
            // テストに必要な全ての基礎データをここで作成する
            const pcRes = await agent.post('/api/pcs')
                .send({ pc_id: 'TEST-PC-01', pc_name: 'テスト用PC', notes: 'E2Eテスト' })
                .expect(201);
            testPcId = pcRes.body.pc_id;

            const userRes = await agent.post('/api/users')
                .send({ user_id: 'U001', name: 'テストユーザー', email: 'test@example.com', user_level: '通常', default_pc_id: testPcId })
                .expect(201);
            testUserId = userRes.body.user_id;

            const resMon = await agent.post('/api/class_slots')
                .send({ day_of_week: 1, period: 1, slot_name: '月曜1限テスト', start_time: '10:00', end_time: '11:30' })
                .expect(201);
            testSlotIdMon = resMon.body.slot_id;

            const resTue = await agent.post('/api/class_slots')
                .send({ day_of_week: 2, period: 1, slot_name: '火曜1限テスト', start_time: '10:00', end_time: '11:30' })
                .expect(201);
            testSlotIdTue = resTue.body.slot_id;
        });

        // 各テストは、作成済みのデータが正しいか「確認」するだけの役割になる
        it('PCマスタが作成されていることを確認', () => {
            expect(testPcId).toBe('TEST-PC-01');
        });

        it('ユーザーマスタが作成されていることを確認', () => {
            expect(testUserId).toBe('U001');
        });

        it('授業コママスタが作成されていることを確認', () => {
            expect(typeof testSlotIdMon).toBe('number');
            expect(typeof testSlotIdTue).toBe('number');
        });

        it('ユーザーマスタ: GETでリストが正しく取得できる', async () => {
            const res = await agent.get('/api/users').expect(200);
            expect(res.body).toHaveProperty('users');
            expect(res.body.users.some(u => u.user_id === testUserId)).toBe(true);
        });

        it('授業コママスタ: 曜日で絞り込んで取得できる', async () => {
            const res = await agent.get('/api/class_slots?dayOfWeek=1').expect(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(1);
            expect(res.body[0].slot_id).toBe(testSlotIdMon);
            expect(res.body[0].day_of_week).toBe(1);
        });
    });

    // (スケジュール関連APIテストは変更なし)
    describe('スケジュール関連APIテスト', () => {
        let testScheduleId;
        it('スケジュール: 新規作成できる', async () => {
            const res = await agent.post('/api/schedules').send({ user_id: 'U001', class_date: '2025-07-14', slot_id: 1, status: '通常', assigned_pc_id: 'TEST-PC-01', notes: '新規作成テスト' }).expect(201);
            testScheduleId = res.body.schedule_id;
        });
        it('スケジュール: 更新できる', async () => {
            await agent.put(`/api/schedules/${testScheduleId}`).send({ class_date: '2025-07-14', slot_id: 1, status: '振替', assigned_pc_id: null, notes: '更新テスト' }).expect(200);
        });
        it('スケジュール: GETで更新内容を確認できる', async () => {
            const res = await agent.get(`/api/schedules?userId=U001`).expect(200);
            const schedule = res.body.find(s => s.schedule_id === testScheduleId);
            expect(schedule.status).toBe('振替');
        });
        it('スケジュール: ステータスのみを更新できる', async () => {
            await agent.put(`/api/schedules/${testScheduleId}/status`).send({ status: '出席' }).expect(200);
        });
        it('スケジュール: 削除できる', async () => {
            await agent.delete(`/api/schedules/${testScheduleId}`).expect(200);
        });
    });

    describe('高度なAPIテスト', () => {
        it('ライブ状況API: 授業時間内に正しい情報が返る', async () => {
            const today = new Date();
            const year = today.getFullYear();
            const month = (today.getMonth() + 1).toString().padStart(2, '0');
            const day = today.getDate().toString().padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;
            await agent.post('/api/schedules').send({ user_id: 'U001', class_date: todayStr, slot_id: 1, status: '通常' });
            const res = await agent.get('/api/live/current-class').expect(200);
            if (res.body.message) {
                expect(res.body.message).toBe("現在、授業時間外です。");
            } else {
                expect(res.body).toHaveProperty('current_class');
                expect(res.body).toHaveProperty('attendees');
            }
        });
        it('一括登録API: 未来のスケジュールをまとめて作成できる', async () => {
            const res = await agent.post('/api/schedules/bulk').send({ user_id: 'U001', slot_id: 1, term_end_date: '2025-07-31' }).expect(201);
            expect(res.body.message).toContain('通常授業スケジュールを登録しました');
        });
    });

    describe('インポート/エクスポートAPIテスト', () => {
        it('エクスポートAPI: ZIPファイルをダウンロードできる', async () => {
            await agent.get('/api/export').expect(200);
        });
        it('インポートAPI: ZIPファイルでデータをリストアできる', async () => {
            const csvData = { 'users.csv': 'user_id,name,email,user_level,default_pc_id\nU999,ImportUser,,通常,' };
            const zipPath = await createTestZip(path.join(__dirname, 'uploads'), csvData);
            await agent.post('/api/import').attach('backupFile', zipPath).expect(200);
            const usersRes = await agent.get('/api/users').expect(200);
            expect(usersRes.body.users.some(u => u.user_id === 'U999')).toBe(true);
        }, 60000);
    });
});
