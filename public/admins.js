document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const adminForm = document.getElementById('admin-form');
    const messageArea = document.getElementById('message');
    const adminListBody = document.getElementById('admin-list-body');
    const rolesCheckboxGroup = document.getElementById('roles-checkbox-group');

    // ▼▼▼【新規】編集モーダル用の要素を取得 ▼▼▼
    const editAdminModal = document.getElementById('edit-admin-modal');
    const editAdminForm = document.getElementById('edit-admin-form');
    const editAdminNameSpan = document.getElementById('edit-admin-name');
    const editRolesCheckboxGroup = document.getElementById('edit-roles-checkbox-group');
    const editMessageArea = document.getElementById('edit-message');
    const closeEditModalBtn = editAdminModal.querySelector('.close-btn');

    // --- 状態管理 ---
    let availableRoles = [];
    let currentAdminId = null;
    let currentEditingAdminId = null;

    // --- データ取得とレンダリング ---

    // 【新規】ログイン中のユーザー情報を取得する関数
    const fetchCurrentUser = async () => {
        try {
            const response = await fetch('/api/me');
            if (response.ok) {
                const user = await response.json();
                currentAdminId = user.id;
            } else {
                console.error('ログイン中のユーザー情報を取得できませんでした。');
            }
        } catch (error) {
            console.error('ユーザー情報取得中にエラー:', error);
        }
    };

    const fetchAdmins = async () => {
        try {
            const response = await fetch('/api/admins');
            if (!response.ok) throw new Error((await response.json()).error);
            const admins = await response.json();
            renderAdminList(admins);
        } catch (error) {
            adminListBody.innerHTML = `<tr><td colspan="4" class="error">${error.message}</td></tr>`;
        }
    };

    const fetchRoles = async () => {
        try {
            const response = await fetch('/api/roles');
            if (!response.ok) throw new Error((await response.json()).error);
            availableRoles = await response.json();
            renderRolesCheckboxes();
            renderEditRolesCheckboxes(); // ▼▼▼【新規】編集用チェックボックスも描画
        } catch (error) {
            rolesCheckboxGroup.innerHTML = `<p class="error">${error.message}</p>`;
            editRolesCheckboxGroup.innerHTML = `<p class="error">${error.message}</p>`;
        }
    };

    const renderAdminList = (admins) => {
        adminListBody.innerHTML = '';
        admins.forEach(admin => {
            const tr = document.createElement('tr');
            const deleteButtonDisabled = (admin.id === currentAdminId) ? 'disabled' : '';
            const editButtonDisabled = (admin.id === currentAdminId) ? 'disabled' : ''; // 自分自身のロールは編集不可

            tr.innerHTML = `
                <td>${admin.id}</td>
                <td>${admin.username}</td>
                <td>${admin.roles || 'なし'}</td>
                <td class="actions">
                    <button class="edit-btn" data-id="${admin.id}" data-username="${admin.username}" ${editButtonDisabled}>編集</button>
                    <button class="delete-btn" data-id="${admin.id}" ${deleteButtonDisabled}>削除</button>
                </td>
            `;
            adminListBody.appendChild(tr);
        });
    };
    const renderRolesCheckboxes = () => {
        rolesCheckboxGroup.innerHTML = '';
        availableRoles.forEach(role => {
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" id="role-${role.id}" name="role" value="${role.id}"><label for="role-${role.id}">${role.role_name}</label>`;
            rolesCheckboxGroup.appendChild(div);
        });
    };
    const renderEditRolesCheckboxes = () => {
        editRolesCheckboxGroup.innerHTML = '';
        availableRoles.forEach(role => {
            const div = document.createElement('div');
            div.innerHTML = `<div><input type="checkbox" id="edit-role-${role.id}" name="edit-role" value="${role.id}"><label for="edit-role-${role.id}">${role.role_name}</label></div>`;
            editRolesCheckboxGroup.appendChild(div);
        });
    };

    // --- イベントリスナー ---

    // ▼▼▼【新規】削除ボタンのクリックイベントを追加（イベント委任）▼▼▼
    adminListBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const button = e.target;
            const adminId = button.dataset.id;
            const adminUsername = button.closest('tr').cells[1].textContent;

            if (confirm(`管理者「${adminUsername}」(ID: ${adminId}) を本当に削除しますか？この操作は元に戻せません。`)) {
                try {
                    const response = await fetch(`/api/admins/${adminId}`, {
                        method: 'DELETE'
                    });
                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.error);
                    }
                    messageArea.textContent = result.message;
                    messageArea.className = 'message success';
                    // メッセージを3秒後に消す
                    setTimeout(() => {
                        messageArea.textContent = '';
                        messageArea.className = 'message';
                    }, 3000);
                    fetchAdmins(); // 成功したらリストを再読み込み
                } catch (error) {
                    messageArea.textContent = `削除失敗: ${error.message}`;
                    messageArea.className = 'message error';
                }
            }
        }
        if (e.target.classList.contains('edit-btn')) {
            const button = e.target;
            currentEditingAdminId = button.dataset.id;
            const adminUsername = button.dataset.username;

            editAdminNameSpan.textContent = adminUsername;
            editMessageArea.textContent = '';
            editMessageArea.className = 'message';

            // 編集モーダルのチェックボックスをリセット
            editRolesCheckboxGroup.querySelectorAll('input').forEach(cb => cb.checked = false);

            try {
                // この管理者の現在のロールを取得
                const res = await fetch(`/api/admins/${currentEditingAdminId}/roles`);
                if (!res.ok) throw new Error('管理者ロールの取得に失敗しました');
                const assignedRoleIds = await res.json();

                // 対応するチェックボックスにチェックを入れる
                assignedRoleIds.forEach(id => {
                    const checkbox = document.getElementById(`edit-role-${id}`);
                    if (checkbox) checkbox.checked = true;
                });

                editAdminModal.style.display = 'block';
            } catch (error) {
                alert(`エラー: ${error.message}`);
            }
        }
    });

    adminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        const selectedRoleIds = Array.from(document.querySelectorAll('#roles-checkbox-group input:checked'))
            .map(cb => parseInt(cb.value));

        if (selectedRoleIds.length === 0) {
            messageArea.textContent = 'エラー: 最低一つのロールを選択してください。';
            messageArea.classList.add('error');
            return;
        }

        const formData = {
            username: document.getElementById('username').value,
            password: document.getElementById('password').value,
            role_ids: selectedRoleIds
        };

        try {
            const response = await fetch('/api/admins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            messageArea.textContent = `管理者「${result.username}」を登録しました。`;
            messageArea.classList.add('success');
            adminForm.reset();
            document.querySelectorAll('#roles-checkbox-group input:checked').forEach(cb => cb.checked = false);
            fetchAdmins();
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });
    editAdminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        editMessageArea.textContent = '';
        editMessageArea.className = 'message';

        const selectedRoleIds = Array.from(document.querySelectorAll('#edit-roles-checkbox-group input:checked'))
            .map(cb => parseInt(cb.value));

        if (selectedRoleIds.length === 0) {
            editMessageArea.textContent = 'エラー: 最低一つのロールを選択してください。';
            editMessageArea.classList.add('error');
            return;
        }

        try {
            const response = await fetch(`/api/admins/${currentEditingAdminId}/roles`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_ids: selectedRoleIds })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            editAdminModal.style.display = 'none';
            fetchAdmins(); // 一覧を更新して変更を反映
        } catch (error) {
            editMessageArea.textContent = `更新失敗: ${error.message}`;
            editMessageArea.classList.add('error');
        }
    });

    closeEditModalBtn.onclick = () => {
        editAdminModal.style.display = 'none';
    };
    window.onclick = (e) => {
        if (e.target == editAdminModal) {
            editAdminModal.style.display = 'none';
        }
    };

    // --- 初期化処理 ---
    const initializePage = async () => {
        await fetchCurrentUser();
        await Promise.all([
            fetchAdmins(),
            fetchRoles()
        ]);
    };

    initializePage();
});
