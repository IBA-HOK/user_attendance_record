document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const userForm = document.getElementById('user-form');
    const pcSelect = document.getElementById('default-pc');
    const slotSelect = document.getElementById('default-slot');
    const messageArea = document.getElementById('message');
    const userListBody = document.getElementById('user-list-body');
    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');
    const editPcSelect = document.getElementById('edit-default-pc');
    const editSlotSelect = document.getElementById('edit-default-slot');
    const editMessageArea = document.getElementById('edit-message');
    const closeEditModalBtn = editUserModal.querySelector('.close-btn');
    let currentEditingUserId = null;
    const prefixInput = document.getElementById('id-prefix');
    const savePrefixBtn = document.getElementById('save-prefix-btn');
    const userIdInput = document.getElementById('user-id');
    const PREFIX_STORAGE_KEY = 'userIdPrefix';
    // --- 関数定義 ---
    const populateSelect = async (url, selectElement, valueField, textFieldFn, defaultText) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('サーバーからのデータ取得に失敗');
            const data = await response.json();
            // APIの応答が { users: [...] } のようなオブジェクトか、配列かを判定
            const items = Array.isArray(data) ? data : data.users;

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

    const fetchUsers = async () => {
        try {
            const response = await fetch('/api/users');
            if (!response.ok) throw new Error('サーバーからの応答エラー');
            const data = await response.json();
            userListBody.innerHTML = '';
            if (data.users && Array.isArray(data.users)) {
                allUsers = data.users; // 全ユーザーリストを更新
                data.users.forEach(user => {
                    const tr = document.createElement('tr');
                    tr.dataset.user = JSON.stringify(user);
                    tr.innerHTML = `
                        <td><a href="/info/${user.user_id}">${user.user_id}</a></td>
                        <td><a href="/info/${user.user_id}">${user.name}</a></td>
                        <td>${user.user_level}</td>
                        <td>${user.email || 'N/A'}</td>
                        <td>${user.default_pc_name || 'N/A'}</td>
                        <td>${user.default_slot_name || '未設定'}</td>
                        <td class="actions">
                            <button class="edit-btn">編集</button>
                            <button class="delete-btn">削除</button>
                        </td>
                    `;
                    userListBody.appendChild(tr);
                });
            }
        } catch (error) {
            console.error('ユーザー一覧の取得に失敗:', error.message);
            userListBody.innerHTML = `<tr><td colspan="7" class="error">データ読み込みに失敗しました。</td></tr>`;
        }
    };
    const loadPrefix = () => {
        const savedPrefix = localStorage.getItem(PREFIX_STORAGE_KEY);
        if (savedPrefix) prefixInput.value = savedPrefix;
    };

    const savePrefix = () => {
        const prefix = prefixInput.value.trim();
        localStorage.setItem(PREFIX_STORAGE_KEY, prefix);
        alert(`プリフィックス「${prefix}」を保存しました。`);
    };
    const generateNextAvailableId = () => {
        const prefix = prefixInput.value.trim();
        const existingNumbers = allUsers
            .map(user => user.user_id)
            .filter(id => id && id.startsWith(prefix))
            .map(id => parseInt(id.substring(prefix.length), 10))
            .filter(num => !isNaN(num) && num > 0);

        let nextNumber = 1;
        if (existingNumbers.length > 0) {
            const sortedNumbers = [...new Set(existingNumbers)].sort((a, b) => a - b);
            for (const num of sortedNumbers) {
                if (num === nextNumber) {
                    nextNumber++;
                } else {
                    break;
                }
            }
        }
        return(prefix + (`${nextNumber}`).padStart(4, '0'));
    };
    // --- イベントリスナー設定 ---
    savePrefixBtn.addEventListener('click', savePrefix);
    // generateIdBtn.addEventListener('click', generateUserId);
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        let userId = userIdInput.value.trim();
        if (userId === '') {
            userId = generateNextAvailableId();
        }

        const formData = {
            user_id: userId,
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            user_level: document.getElementById('user-level').value,
            default_pc_id: pcSelect.value || null,
            default_slot_id: slotSelect.value || null,
        };

        try {
            const response = await fetch('/api/users', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(formData) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            messageArea.textContent = `ユーザー「${formData.name}」(ID: ${formData.user_id}) を登録しました。`;
            messageArea.classList.add('success');
            userForm.reset();
            loadPrefix()
            prefixInput.value = localStorage.getItem(PREFIX_STORAGE_KEY) || '';
            await fetchUsers(); // ユーザーリストを再取得してallUsersを更新
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    userListBody.addEventListener('click', async (e) => {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr) return;

        const userData = JSON.parse(tr.dataset.user);
        const userId = userData.user_id;

        if (target.classList.contains('edit-btn')) {
            currentEditingUserId = userId;
            document.getElementById('edit-user-id').textContent = userId;
            document.getElementById('edit-name').value = userData.name;
            document.getElementById('edit-email').value = userData.email || '';
            document.getElementById('edit-user-level').value = userData.user_level || '通常';
            editPcSelect.value = userData.default_pc_id || '';
            editSlotSelect.value = userData.default_slot_id || '';
            editMessageArea.textContent = '';
            editUserModal.style.display = 'block';
        }

        if (target.classList.contains('delete-btn')) {
            if (confirm(`ユーザーID: ${userId} を本当に削除しますか？`)) {
                try {
                    const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error((await response.json()).error);
                    fetchUsers();
                } catch (error) {
                    alert(`削除失敗: ${error.message}`);
                }
            }
        }
    });

    editUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            name: document.getElementById('edit-name').value,
            email: document.getElementById('edit-email').value,
            user_level: document.getElementById('edit-user-level').value,
            default_pc_id: editPcSelect.value || null,
            default_slot_id: editSlotSelect.value || null,
        };
        try {
            const response = await fetch(`/api/users/${currentEditingUserId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
            });
            if (!response.ok) throw new Error((await response.json()).error);
            editUserModal.style.display = 'none';
            fetchUsers();
        } catch (error) {
            editMessageArea.textContent = `エラー: ${error.message}`;
            editMessageArea.classList.add('error');
        }
    });

    closeEditModalBtn.onclick = () => { editUserModal.style.display = 'none'; };
    window.onclick = (e) => {
        if (e.target == editUserModal) editUserModal.style.display = 'none';
    };

    // --- 初期化処理 ---
    const initializePage = async () => {
        const pcTextFieldFn = (item) => `${item.pc_id} (${item.pc_name})`;
        await Promise.all([
            populateSelect('/api/pcs', pcSelect, 'pc_id', pcTextFieldFn, 'PCを選択'),
            populateSelect('/api/pcs', editPcSelect, 'pc_id', pcTextFieldFn, 'PCを選択'),
            populateSelect('/api/class_slots', slotSelect, 'slot_id', 'slot_name', '通常授業コマを選択 (任意)'),
            populateSelect('/api/class_slots', editSlotSelect, 'slot_id', 'slot_name', 'コマを選択')
        ]);
        fetchUsers();
        loadPrefix()
    };

    initializePage();
});
