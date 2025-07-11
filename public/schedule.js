document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const searchInput = document.getElementById('student-search-input');
    const searchBtn = document.getElementById('student-search-btn');
    const searchResults = document.getElementById('student-search-results');
    const transferSection = document.getElementById('transfer-form-section');
    const transferForm = document.getElementById('transfer-form');
    const transferFormTitle = document.getElementById('transfer-form-title');
    const makeupSlotSelect = document.getElementById('makeup-slot-select');
    const makeupDateInput = document.getElementById('makeup-date');
    const rosterSection = document.getElementById('roster-section');
    const rosterList = document.getElementById('roster-list');
    const cancelDateInput = document.getElementById('cancel-date');
    const cancelSlotSelect = document.getElementById('cancel-slot-select');
    const transferMessage = document.getElementById('transfer-message');
    let selectedStudent = null;
    let classSlots = [];

    // --- 関数定義 ---
const updateMakeupSlots = async () => {
    const makeupDate = makeupDateInput.value;
    makeupSlotSelect.innerHTML = '<option value="">日付を選択してください</option>';
    if (!makeupDate) return;

    // ▼▼▼ この日付の扱い方を修正 ▼▼▼
    // タイムゾーンのズレを防ぐため、UTCとして日付を解釈し、曜日を取得する
    const dateParts = makeupDate.split('-').map(part => parseInt(part, 10));
    const date = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
    const dayOfWeek = date.getUTCDay();

        try {
            const response = await fetch(`/api/class_slots?dayOfWeek=${dayOfWeek}`);
            const slots = await response.json();
            
            makeupSlotSelect.innerHTML = '<option value="">コマを選択...</option>';
            if (slots.length > 0) {
                slots.forEach(slot => {
                    const option = document.createElement('option');
                    option.value = slot.slot_id;
                    option.textContent = slot.slot_name;
                    makeupSlotSelect.appendChild(option);
                });
            } else {
                makeupSlotSelect.innerHTML = '<option value="">この曜日のコマはありません</option>';
            }
        } catch (error) {
            console.error("振替先コマの取得エラー:", error);
        }
    };
    // 生徒を検索して結果を表示
    const searchStudents = async () => {
        const query = searchInput.value.trim();
        if (!query) return;
        try {
            const response = await fetch(`/api/users?name=${query}`);
            const data = await response.json();
            searchResults.innerHTML = '';
            if (data.users && data.users.length > 0) {
                data.users.forEach(user => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.textContent = `${user.name} (ID: ${user.user_id})`;
                    div.dataset.userId = user.user_id;
                    div.dataset.userName = user.name;
                    searchResults.appendChild(div);
                });
            } else {
                searchResults.textContent = '該当する生徒が見つかりません。';
            }
        } catch (error) {
            console.error("生徒検索エラー:", error);
        }
    };


    // ▼▼▼ 欠席するコマのドロップダウンを生成する関数 ▼▼▼
const populateCancelSlots = async () => {
    const date = cancelDateInput.value;
    if (!date || !selectedStudent) return;

    try {
        const response = await fetch(`/api/schedules?date=${date}&userId=${selectedStudent.id}&status=通常`);
        const schedules = await response.json();
        
        // --- 重複排除の術 ---
        const uniqueSchedules = [];
        const seenSlotIds = new Set();
        schedules.forEach(s => {
            if (!seenSlotIds.has(s.slot_id)) {
                uniqueSchedules.push(s);
                seenSlotIds.add(s.slot_id);
            }
        });
        // --------------------

        cancelSlotSelect.innerHTML = '<option value="">コマを選択...</option>';
        if (uniqueSchedules.length > 0) {
            uniqueSchedules.forEach(s => {
                const option = document.createElement('option');
                option.value = s.schedule_id; // 代表として最初に見つかったschedule_idを使う
                option.textContent = s.slot_name;
                cancelSlotSelect.appendChild(option);
            });
        } else {
            cancelSlotSelect.innerHTML = '<option value="">この日の通常授業はありません</option>';
        }
    } catch (error) { console.error("欠席コマの取得エラー:", error); }
};

    // ▼▼▼ 【修正】振替先の出席者リストを表示（重複排除ロジックを追加） ▼▼▼
    const updateRosterDisplay = async () => {
        const date = makeupDateInput.value;
        const slotId = makeupSlotSelect.value;
        if (!date || !slotId) {
            rosterSection.style.display = 'none';
            return;
        }
        try {
            const response = await fetch(`/api/schedules?date=${date}&slotId=${slotId}`);
            const schedules = await response.json();
            const roster = schedules.filter(s => s.status !== '欠席');
            
            // --- 重複排除の術 ---
            const uniqueRoster = [];
            const seenUserIds = new Set();
            roster.forEach(item => {
                if (!seenUserIds.has(item.user_id)) {
                    uniqueRoster.push(item);
                    seenUserIds.add(item.user_id);
                }
            });
            // --------------------

            rosterList.innerHTML = '';
            if (uniqueRoster.length > 0) {
                uniqueRoster.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.user_name} (ステータス: ${item.status})`;
                    rosterList.appendChild(li);
                });
            } else {
                rosterList.textContent = 'まだ誰もいません。';
            }
            rosterSection.style.display = 'block';
        } catch (error) { console.error("出席者リストの取得エラー:", error); }
    };


    // 振替を登録するコア処理
 const registerTransfer = async (e) => {
    e.preventDefault();
    if (!selectedStudent) return alert("生徒が選択されていません。");

    const originalScheduleId = cancelSlotSelect.value;
    const makeupDate = makeupDateInput.value;
    const makeupSlotId = makeupSlotSelect.value;

    if (!originalScheduleId) {
        return alert("欠席にする元の授業コマを選択してください。");
    }
    if (!makeupDate || !makeupSlotId) {
        return alert("振替先の授業日とコマを選択してください。");
    }
    
    transferMessage.textContent = '';
    transferMessage.className = 'message';

    try {
        // 1. 元のスケジュールを「欠席」に更新
        const cancelResponse = await fetch(`/api/schedules/${originalScheduleId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: '欠席' })
        });
        if (!cancelResponse.ok) throw new Error('元の授業の欠席処理に失敗しました。');

        // 2. 生徒のデフォルトPC情報を取得
        const userResponse = await fetch(`/api/users/${selectedStudent.id}`);
        if (!userResponse.ok) throw new Error('生徒情報の取得に失敗しました。');
        const userData = await userResponse.json();
        const assignedPcId = userData.default_pc_id;

        // 3. 振替先のスケジュールを「振替」として新規作成
        const newScheduleData = {
            user_id: selectedStudent.id,
            class_date: makeupDate,
            slot_id: makeupSlotId,
            status: '振替',
            assigned_pc_id: assignedPcId || null // pcIdがなければnullを送る
        };

        const createResponse = await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newScheduleData)
        });

        if (!createResponse.ok) {
            const errResult = await createResponse.json();
            throw new Error(errResult.error || '振替先のスケジュール作成に失敗しました。');
        }

        transferMessage.textContent = `${selectedStudent.name}さんの振替を正常に登録しました。`;
        transferMessage.classList.add('success');
        transferSection.style.display = 'none';
        rosterSection.style.display = 'none';

    } catch (error) {
        transferMessage.textContent = `エラー: ${error.message}`;
        transferMessage.classList.add('error');
    }
};

    // --- イベントリスナー設定 ---

    searchBtn.addEventListener('click', searchStudents);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchStudents();
    });
    cancelDateInput.addEventListener('change', populateCancelSlots);

    // 検索結果から生徒を選択
    searchResults.addEventListener('click', (e) => {
        if (e.target.classList.contains('search-result-item')) {
            selectedStudent = {
                id: e.target.dataset.userId,
                name: e.target.dataset.userName,
            };
            transferFormTitle.textContent = `2. ${selectedStudent.name} さんの振替を登録`;
            transferSection.style.display = 'block';
            searchResults.innerHTML = ''; // 検索結果をクリア
        }
    });

    // 振替先のコマ/日付が変更されたら出席者リストを更新
    makeupDateInput.addEventListener('change', () => {
        updateMakeupSlots();
        updateRosterDisplay();
    });
    makeupSlotSelect.addEventListener('change', updateRosterDisplay);

    // 振替登録フォームの送信
    transferForm.addEventListener('submit', registerTransfer);

    // --- 初期化 ---
    // fetchAllClassSlots();
});
