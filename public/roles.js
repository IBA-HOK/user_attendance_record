document.addEventListener('DOMContentLoaded', () => {
    const roleForm = document.getElementById('role-form');
    const roleNameInput = document.getElementById('role-name');
    const rolesListUl = document.getElementById('roles-list-ul');
    const permissionsGrid = document.getElementById('permissions-grid');
    const permissionsForm = document.getElementById('permissions-form');
    const permissionsTitle = document.getElementById('permissions-title');
    const messageArea = document.getElementById('message');

    let allPermissions = [];
    let allRoles = [];
    let selectedRoleId = null;

    // --- データ取得 ---
    const fetchAllData = async () => {
        try {
            const [permsRes, rolesRes] = await Promise.all([
                fetch('/api/permissions'),
                fetch('/api/roles')
            ]);
            if (!permsRes.ok || !rolesRes.ok) throw new Error('データ取得に失敗');

            allPermissions = await permsRes.json();
            allRoles = await rolesRes.json();

            renderRoles();
            // 権限チェックボックスは一度だけ描画すれば良い
            if (permissionsGrid.innerHTML === '') {
                renderPermissionsCheckboxes();
            }
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.className = 'message error';
        }
    };

    // --- レンダリング ---
    const renderRoles = () => {
        rolesListUl.innerHTML = '';
        allRoles.forEach(role => {
            const li = document.createElement('li');
            li.dataset.roleId = role.id;
            li.dataset.roleName = role.role_name;

            const roleNameSpan = document.createElement('span');
            roleNameSpan.className = 'role-name';
            roleNameSpan.textContent = role.role_name;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-role-btn';
            deleteBtn.textContent = '削除';
            // superadminロールは削除不可
            if (role.role_name === 'superadmin') {
                deleteBtn.disabled = true;
            }

            li.appendChild(roleNameSpan);
            li.appendChild(deleteBtn);

            if (role.id === selectedRoleId) {
                li.classList.add('selected');
            }
            rolesListUl.appendChild(li);
        });
    };

    const renderPermissionsCheckboxes = () => {
        permissionsGrid.innerHTML = '';
        allPermissions.forEach(perm => {
            const div = document.createElement('div');
            div.className = 'permission-item';
            div.innerHTML = `
                <input type="checkbox" id="perm-${perm.id}" name="permission" value="${perm.id}">
                <label for="perm-${perm.id}">${perm.description}</label>
            `;
            permissionsGrid.appendChild(div);
        });
    };

    // --- イベントハンドラ ---
    rolesListUl.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;

        const roleId = parseInt(li.dataset.roleId, 10);
        const roleName = li.dataset.roleName;

        if (e.target.classList.contains('delete-role-btn')) {
            // 削除ボタンがクリックされた場合
            handleRoleDelete(roleId, roleName);
        } else {
            // liの他の部分がクリックされた場合
            handleRoleSelect(roleId, roleName);
        }
    });

    // ▼▼▼【修正点】この関数のロジックを完全なものに復元 ▼▼▼
    const handleRoleSelect = async (roleId, roleName) => {
        selectedRoleId = roleId;
        renderRoles(); // 選択状態をハイライト
        permissionsTitle.textContent = `「${roleName}」の権限`;

        // メッセージをクリア
        messageArea.textContent = '';
        messageArea.className = 'message';

        // チェックボックスをリセット
        document.querySelectorAll('#permissions-grid input').forEach(cb => cb.checked = false);

        // superadminの場合は全チェック＆無効化
        if (roleName === 'superadmin') {
            document.querySelectorAll('#permissions-grid input').forEach(cb => {
                cb.checked = true;
                cb.disabled = true;
            });
            permissionsForm.querySelector('button').disabled = true;
            return;
        } else {
            document.querySelectorAll('#permissions-grid input').forEach(cb => cb.disabled = false);
            permissionsForm.querySelector('button').disabled = false;
        }

        try {
            const res = await fetch(`/api/roles/${roleId}/permissions`);
            if (!res.ok) throw new Error('権限情報の取得に失敗');
            const assignedIds = await res.json();
            assignedIds.forEach(id => {
                const checkbox = document.getElementById(`perm-${id}`);
                if (checkbox) checkbox.checked = true;
            });
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.className = 'message error';
        }
    };

    const handleRoleDelete = async (roleId, roleName) => {
        if (!confirm(`ロール「${roleName}」を本当に削除しますか？\nこのロールが割り当てられている全ての管理者から、このロールが解除されます。`)) {
            return;
        }

        try {
            const res = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);

            messageArea.textContent = result.message;
            messageArea.className = 'message success';
            setTimeout(() => { messageArea.textContent = ''; messageArea.className = 'message'; }, 3000);

            if (selectedRoleId === roleId) {
                selectedRoleId = null;
                permissionsTitle.textContent = '権限を選択';
                document.querySelectorAll('#permissions-grid input').forEach(cb => {
                    cb.checked = false;
                    cb.disabled = false;
                });
                permissionsForm.querySelector('button').disabled = false;
            }

            fetchAllData();

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.className = 'message error';
        }
    };

    roleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';
        try {
            const res = await fetch('/api/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_name: roleNameInput.value }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            roleNameInput.value = '';
            fetchAllData();
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.className = 'message error';
        }
    });

    permissionsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        if (!selectedRoleId) {
            alert('ロールを選択してください。');
            return;
        }
        const selectedPermissionIds = Array.from(document.querySelectorAll('#permissions-grid input:checked'))
            .map(cb => parseInt(cb.value));

        try {
            const res = await fetch(`/api/roles/${selectedRoleId}/permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permission_ids: selectedPermissionIds }),
            });
            if (!res.ok) {
                const errResult = await res.json();
                throw new Error(errResult.error || '権限の保存に失敗しました。');
            }

            messageArea.textContent = '権限を保存しました。';
            messageArea.classList.add('success');

            setTimeout(() => {
                messageArea.textContent = '';
                messageArea.className = 'message';
            }, 3000);

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    // --- 初期化 ---
    fetchAllData();
});
