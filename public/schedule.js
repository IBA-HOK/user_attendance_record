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
    const transferMessage = document.getElementById('transfer-message');

    let selectedStudent = null;
    let classSlots = [];

    // --- 関数定義 ---

    // 全ての授業コマ情報を取得して保持
    const fetchAllClassSlots = async () => {
        try {
            const response = await fetch('/api/class_slots');
            classSlots = await response.json();
            classSlots.forEach(slot => {
                const option = document.createElement('option');
                option.value = slot.slot_id;
                option.textContent = slot.slot_name;
                makeupSlotSelect.appendChild(option);
            });
        } catch (error) {
            console.error("授業コマの取得に失敗:", error);
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

    // 振替先の出席者リストを表示
    const updateRosterDisplay = async () => {
        const date = makeupDateInput.value;
        const slotId = makeupSlotSelect.value;

        if (!date || !slotId) {
            rosterSection.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/schedules?date=${date}`);
            const schedules = await response.json();
            const roster = schedules.filter(s => s.slot_id == slotId && s.status !== '欠席');

            rosterList.innerHTML = '';
            if (roster.length > 0) {
                roster.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.user_name} (ステータス: ${item.status})`;
                    rosterList.appendChild(li);
                });
            } else {
                rosterList.textContent = 'まだ誰もいません。';
            }
            rosterSection.style.display = 'block';
        } catch (error) {
            console.error("出席者リストの取得エラー:", error);
        }
    };

    // 振替を登録するコア処理
    const registerTransfer = async (e) => {
        e.preventDefault();
        if (!selectedStudent) {
            alert("生徒が選択されていません。");
            return;
        }

        const cancelDate = document.getElementById('cancel-date').value;
        const makeupDate = makeupDateInput.value;
        const makeupSlotId = makeupSlotSelect.value;

        transferMessage.textContent = '';
        transferMessage.className = 'message';

        try {
            // 1. 元のスケジュールを検索して特定
            const scheduleResponse = await fetch(`/api/schedules?date=${cancelDate}`);
            const schedules = await scheduleResponse.json();
            const originalSchedule = schedules.find(s => s.user_id === selectedStudent.id && s.status === '通常');

            if (!originalSchedule) {
                throw new Error(`指定された日付(${cancelDate})に、${selectedStudent.name}さんの通常授業が見つかりませんでした。`);
            }

            // 2. 元のスケジュールを「欠席」に更新
            await fetch(`/api/schedules/${originalSchedule.schedule_id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: '欠席' })
            });

            // 3. 振替先のスケジュールを「振替」として新規作成
            const assignedPcId = (await (await fetch(`/api/users/${selectedStudent.id}`)).json()).default_pc_id;
            const newScheduleData = {
                user_id: selectedStudent.id,
                class_date: makeupDate,
                slot_id: makeupSlotId,
                status: '振替',
                assigned_pc_id: assignedPcId
            };
            const createResponse = await fetch('/api/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newScheduleData)
            });

            if (!createResponse.ok) throw new Error("振替先のスケジュール作成に失敗しました。");

            transferMessage.textContent = `${selectedStudent.name}さんの振替を正常に登録しました。`;
            transferMessage.classList.add('success');
            transferSection.style.display = 'none'; // フォームを隠す
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
    makeupSlotSelect.addEventListener('change', updateRosterDisplay);
    makeupDateInput.addEventListener('change', updateRosterDisplay);

    // 振替登録フォームの送信
    transferForm.addEventListener('submit', registerTransfer);

    // --- 初期化 ---
    fetchAllClassSlots();
});
