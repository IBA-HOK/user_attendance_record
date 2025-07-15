document.addEventListener('DOMContentLoaded', () => {
    const adminForm = document.getElementById('admin-form');
    const messageArea = document.getElementById('message');
    const adminListBody = document.getElementById('admin-list-body');
    const rolesCheckboxGroup = document.getElementById('roles-checkbox-group');

    let availableRoles = [];

    // --- データ取得とレンダリング ---
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
        } catch (error) {
            rolesCheckboxGroup.innerHTML = `<p class="error">${error.message}</p>`;
        }
    };

    const renderAdminList = (admins) => {
        adminListBody.innerHTML = '';
        admins.forEach(admin => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${admin.id}</td>
                <td>${admin.username}</td>
                <td>${admin.roles || 'なし'}</td>
                <td><button class="delete-btn" data-id="${admin.id}" disabled>削除</button></td>
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

    // --- フォーム送信 ---
    adminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';

        const selectedRoleIds = Array.from(document.querySelectorAll('#roles-checkbox-group input:checked'))
            .map(cb => parseInt(cb.value));

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
            adminForm.reset();
            fetchAdmins();
        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
        }
    });

    // --- 初期化 ---
    fetchAdmins();
    fetchRoles();
});
