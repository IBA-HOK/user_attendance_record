document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const filterForm = document.getElementById('filter-form');
    const scheduleListBody = document.getElementById('schedule-list-body');

    // 編集モーダル用の要素
    const editModal = document.getElementById('edit-schedule-modal');
    const editForm = document.getElementById('edit-schedule-form');
    const closeModalBtn = editModal.querySelector('.close-btn');
    const editMessage = document.getElementById('edit-message');
    let currentEditingScheduleId = null;

    // --- 関数定義 ---

    // セレクトボックスをデータで満たす汎用関数
    const populateSelect = async (url, selectElement, valueField, textFieldFn, defaultText) => {
        try {
            const response = await fetch(url);
            const items = await response.json();
            selectElement.innerHTML = `<option value="">-- ${defaultText} --</option>`;
            if (Array.isArray(items)) {
                items.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item[valueField];
                    option.textContent = typeof textFieldFn === 'function' ? textFieldFn(item) : item[textFieldFn];
                    selectElement.appendChild(option);
                });
            }
        } catch (error) {
            console.error(`${defaultText}の取得に失敗:`, error);
        }
    };

    // スケジュールを取得して表示するメイン関数
    const fetchSchedules = async () => {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        const status = document.getElementById('status-filter').value;
        // ▼▼▼ この行を追記 ▼▼▼
        const name = document.getElementById('name-filter').value.trim();

        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (status) params.append('status', status);
        if (name) params.append('name', name);

        try {
            const response = await fetch(`/api/schedules?${params.toString()}`);
            const schedules = await response.json();

            scheduleListBody.innerHTML = ''; // 以下、変更なし
            schedules.forEach(s => {
                const tr = document.createElement('tr');
                tr.dataset.schedule = JSON.stringify(s);
                tr.innerHTML = `
                <td>${s.class_date}</td>
                <td>${s.slot_name}</td>
                <td>${s.user_name}</td>
                <td><span class="status-${s.status.toLowerCase()}">${s.status}</span></td>
                <td>${s.pc_name || 'N/A'}</td>
                <td class="actions">
                    <button class="edit-btn">編集</button>
                    <button class="delete-btn">削除</button>
                </td>
            `;
                scheduleListBody.appendChild(tr);
            });
        } catch (error) {
            console.error("スケジュール取得エラー:", error);
        }
    };

    // --- イベントリスナー設定 ---

    // 絞り込みフォームの送信
    filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        fetchSchedules();
    });

    // 一覧テーブル内のボタンクリック（イベント委任）
    scheduleListBody.addEventListener('click', async (e) => {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr) return;

        const scheduleData = JSON.parse(tr.dataset.schedule);
        currentEditingScheduleId = scheduleData.schedule_id;

        // 削除ボタンの処理
        if (target.classList.contains('delete-btn')) {
            if (confirm(`ID:${scheduleData.schedule_id} の予定を本当に削除しますか？`)) {
                try {
                    const response = await fetch(`/api/schedules/${scheduleData.schedule_id}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error((await response.json()).error);
                    fetchSchedules();
                } catch (error) { alert(`削除失敗: ${error.message}`); }
            }
        }

        // 編集ボタンの処理
        if (target.classList.contains('edit-btn')) {
            document.getElementById('edit-student-name').textContent = scheduleData.user_name;
            document.getElementById('edit-class-date').value = scheduleData.class_date;
            document.getElementById('edit-slot-select').value = scheduleData.slot_id;
            document.getElementById('edit-status-select').value = scheduleData.status;
            document.getElementById('edit-pc-select').value = scheduleData.assigned_pc_id || '';
            editMessage.textContent = '';
            editModal.style.display = 'block';
        }
    });

    // 編集モーダルのフォーム送信
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            class_date: document.getElementById('edit-class-date').value,
            slot_id: document.getElementById('edit-slot-select').value,
            status: document.getElementById('edit-status-select').value,
            assigned_pc_id: document.getElementById('edit-pc-select').value || null,
        };
        try {
            const response = await fetch(`/api/schedules/${currentEditingScheduleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (!response.ok) throw new Error((await response.json()).error);
            editModal.style.display = 'none';
            fetchSchedules();
        } catch (error) {
            editMessage.textContent = `エラー: ${error.message}`;
            editMessage.classList.add('error');
        }
    });

    // モーダルを閉じる
    closeModalBtn.onclick = () => { editModal.style.display = 'none'; };
    window.onclick = (e) => { if (e.target == editModal) editModal.style.display = 'none'; };

    // --- 初期化処理 ---
    const initialize = async () => {
        await Promise.all([
            populateSelect('/api/class_slots', document.getElementById('edit-slot-select'), 'slot_id', 'slot_name', 'コマ'),
            populateSelect('/api/pcs', document.getElementById('edit-pc-select'), 'pc_id', (item) => `${item.pc_id} (${item.pc_name})`, 'PC')
        ]);
        fetchSchedules();
    };

    initialize();
});
