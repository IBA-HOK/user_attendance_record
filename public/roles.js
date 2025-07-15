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
            renderPermissionsCheckboxes();
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
        }
    };

    // --- レンダリング ---
    const renderRoles = () => {
        rolesListUl.innerHTML = '';
        allRoles.forEach(role => {
            const li = document.createElement('li');
            li.textContent = role.role_name;
            li.dataset.roleId = role.id;
            if (role.id === selectedRoleId) {
                li.classList.add('selected');
            }
            li.addEventListener('click', () => handleRoleSelect(role.id, role.role_name));
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
    const handleRoleSelect = async (roleId, roleName) => {
        selectedRoleId = roleId;
        renderRoles(); // 選択状態をハイライト
        permissionsTitle.textContent = `「${roleName}」の権限`;

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
        }
    };

    roleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_name: roleNameInput.value }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            roleNameInput.value = '';
            fetchAllData(); // 全データを再取得して再描画
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
        }
    });

    permissionsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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
            if (!res.ok) throw new Error('権限の保存に失敗しました。');
            messageArea.textContent = '権限を保存しました。';
            setTimeout(() => messageArea.textContent = '', 3000);
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
        }
    });

    // --- 初期化 ---
    fetchAllData();
});
