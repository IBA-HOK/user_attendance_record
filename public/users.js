document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    // 新規登録フォーム
    const userForm = document.getElementById('user-form');
    const pcSelect = document.getElementById('default-pc');
    const messageArea = document.getElementById('message');

    // ユーザー一覧テーブル
    const userListBody = document.getElementById('user-list-body');

    // ユーザー編集用モーダル
    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');
    const editPcSelect = document.getElementById('edit-default-pc');
    const editMessageArea = document.getElementById('edit-message');
    const closeEditModalBtn = editUserModal.querySelector('.close-btn');
    let currentEditingUserId = null;

    // スケジュール設定用モーダル
    const scheduleModal = document.getElementById('schedule-modal');
    const scheduleForm = document.getElementById('schedule-form');
    const scheduleModalTitle = document.getElementById('schedule-modal-title');
    const scheduleSlotSelect = document.getElementById('schedule-slot-select');
    const schedulePcSelect = document.getElementById('schedule-pc-select');
    const scheduleMessageArea = document.getElementById('schedule-message');
    const closeScheduleModalBtn = scheduleModal.querySelector('.close-btn');
    let currentSchedulingUser = null;

    // --- 関数定義 ---

    // セレクトボックスをデータで満たす汎用関数
    const populateSelect = async (url, selectElement, valueField, textFieldFn, defaultText) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('サーバーからのデータ取得に失敗');
            const items = await response.json(); // APIの応答は生配列と仮定

            selectElement.innerHTML = `<option value="">-- ${defaultText} --</option>`;

            if (items && Array.isArray(items)) {
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

    // ユーザー一覧をフェッチしてテーブルを生成
    const fetchUsers = async () => {
        try {
            const response = await fetch('/api/users');
            if (!response.ok) {
                throw new Error('サーバーからの応答エラー');
            }

            // サーバーからの { "users": [...] } という応答を正しく受け取る
            const data = await response.json();

            userListBody.innerHTML = ''; // テーブルをクリア

            // data.users が存在し、配列であることを確認してから処理する
            if (data.users && Array.isArray(data.users)) {
                data.users.forEach(user => {
                    const tr = document.createElement('tr');
                    // データ属性に全情報を格納する
                    tr.dataset.userId = user.user_id;
                    tr.dataset.name = user.name;
                    tr.dataset.email = user.email || '';
                    tr.dataset.userLevel = user.user_level || '通常';
                    tr.dataset.defaultPcId = user.default_pc_id || '';

                    // テーブルのセルを生成する
                    tr.innerHTML = `
                    <td>${user.user_id}</td>
                    <td>${user.name}</td>
                    <td>${user.user_level}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td>${user.default_pc_name || 'N/A'}</td>
                    <td class="actions">
                        <button class="edit-btn">編集</button>
                        <button class="schedule-btn">スケジュール</button>
                        <button class="delete-btn">削除</button>
                    </td>
                `;
                    userListBody.appendChild(tr);
                });
            }
        } catch (error) {
            console.error('ユーザー一覧の取得に失敗:', error.message);
            userListBody.innerHTML = `<tr><td colspan="6" class="error">データ読み込みに失敗しました。</td></tr>`;
        }
    };

    // --- イベントリスナー設定 ---

    // 新規ユーザー登録フォーム
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';
        const formData = {
            user_id: document.getElementById('user-id').value,
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            user_level: document.getElementById('user-level').value,
            default_pc_id: pcSelect.value,
        };
        try {
            const response = await fetch('/api/users', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(formData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            messageArea.textContent = `ユーザー「${formData.name}」を登録しました。`;
            messageArea.classList.add('success');
            userForm.reset();
            fetchUsers();
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    // ユーザー一覧のボタンクリック（イベント委任）
    userListBody.addEventListener('click', async (e) => {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr) return;

        const userId = tr.dataset.userId;

        // 編集ボタンの処理
        if (target.classList.contains('edit-btn')) {
            currentEditingUserId = userId;
            document.getElementById('edit-user-id').textContent = userId;
            document.getElementById('edit-name').value = tr.dataset.name;
            document.getElementById('edit-email').value = tr.dataset.email;
            document.getElementById('edit-user-level').value = tr.dataset.userLevel;
            editPcSelect.value = tr.dataset.defaultPcId;
            editMessageArea.textContent = '';
            editUserModal.style.display = 'block';
        }

        // スケジュール設定ボタンの処理
        if (target.classList.contains('schedule-btn')) {
            currentSchedulingUser = {id: userId, name: tr.dataset.name, pcId: tr.dataset.defaultPcId};
            scheduleModalTitle.textContent = `${currentSchedulingUser.name} さんの通常授業を設定`;
            scheduleMessageArea.textContent = '';
            scheduleForm.reset();
            schedulePcSelect.value = currentSchedulingUser.pcId;
            scheduleModal.style.display = 'block';
        }

        // 削除ボタンの処理
        if (target.classList.contains('delete-btn')) {
            if (confirm(`ユーザーID: ${userId} を本当に削除しますか？`)) {
                try {
                    const response = await fetch(`/api/users/${userId}`, {method: 'DELETE'});
                    if (!response.ok) throw new Error((await response.json()).error);
                    fetchUsers();
                } catch (error) {
                    alert(`削除失敗: ${error.message}`);
                }
            }
        }
    });

    // ユーザー編集モーダルのフォーム送信
    editUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            name: document.getElementById('edit-name').value,
            email: document.getElementById('edit-email').value,
            user_level: document.getElementById('edit-user-level').value,
            default_pc_id: editPcSelect.value,
        };
        try {
            const response = await fetch(`/api/users/${currentEditingUserId}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(formData)
            });
            if (!response.ok) throw new Error((await response.json()).error);
            editUserModal.style.display = 'none';
            fetchUsers();
        } catch (error) {
            editMessageArea.textContent = `エラー: ${error.message}`;
            editMessageArea.classList.add('error');
        }
    });

    // スケジュール設定モーダルのフォーム送信
    scheduleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            user_id: currentSchedulingUser.id,
            slot_id: scheduleSlotSelect.value,
            pc_id: schedulePcSelect.value || null,
            term_end_date: document.getElementById('schedule-end-date').value,
        };
        if (!confirm(`${currentSchedulingUser.name}さんの通常授業を登録しますか？`)) return;
        try {
            const response = await fetch('/api/schedules/bulk', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(formData)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            scheduleMessageArea.textContent = result.message;
            scheduleMessageArea.classList.add('success');
        } catch (error) {
            scheduleMessageArea.textContent = `エラー: ${error.message}`;
            scheduleMessageArea.classList.add('error');
        }
    });

    // モーダルを閉じる処理
    closeEditModalBtn.onclick = () => {
        editUserModal.style.display = 'none';
    };
    closeScheduleModalBtn.onclick = () => {
        scheduleModal.style.display = 'none';
    };
    window.onclick = (e) => {
        if (e.target == editUserModal) editUserModal.style.display = 'none';
        if (e.target == scheduleModal) scheduleModal.style.display = 'none';
    };

    // --- 初期化処理 ---
    const initializePage = async () => {
        const pcTextFieldFn = (item) => `${item.pc_id} (${item.pc_name})`;
        await Promise.all([
            populateSelect('/api/pcs', pcSelect, 'pc_id', pcTextFieldFn, '希望PCを選択'),
            populateSelect('/api/pcs', editPcSelect, 'pc_id', pcTextFieldFn, '希望PCを選択'),
            populateSelect('/api/class_slots', scheduleSlotSelect, 'slot_id', 'slot_name', 'コマを選択'),
            populateSelect('/api/pcs', schedulePcSelect, 'pc_id', pcTextFieldFn, '使用PCを選択')
        ]);
        fetchUsers();
    };

    initializePage();
});
