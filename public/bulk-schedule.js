document.addEventListener('DOMContentLoaded', () => {
    const bulkForm = document.getElementById('bulk-form');
    const userSelect = document.getElementById('user-select');
    const slotSelect = document.getElementById('slot-select');
    const messageArea = document.getElementById('message');
    let allUsers = [];

    const populateSelect = async (url, selectElement, valueField, textField, name) => {
        try {
            const response = await fetch(url);
            const data = await response.json();
            const items = Array.isArray(data) ? data : data[name];
            if (name === 'users') allUsers = items;

            selectElement.innerHTML = `<option value="">-- ${selectElement.previousElementSibling.textContent.replace(':', '')} --</option>`;
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item[valueField];
                option.textContent = item[textField];
                selectElement.appendChild(option);
            });
        } catch (error) {
            console.error(`${name}の取得に失敗:`, error);
        }
    };

    userSelect.addEventListener('change', () => {
        const selectedUserId = userSelect.value;
        const selectedUser = allUsers.find(u => u.user_id === selectedUserId);
        if (selectedUser) {
            slotSelect.value = selectedUser.default_slot_id || '';
        }
    });

    bulkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        const userId = userSelect.value;
        const slotId = slotSelect.value;

        if (!userId || !slotId) {
            alert("生徒とコマを両方選択してください。");
            return;
        }

        const selectedUser = allUsers.find(u => u.user_id === userId);
        if (!selectedUser) return;

        const updatedUserData = {
            ...selectedUser,
            default_slot_id: slotId
        };
        // APIに送るデータから不要なものを削除
        delete updatedUserData.default_pc_name;
        delete updatedUserData.default_slot_name;

        if (!confirm(`${selectedUser.name}さんの通常授業を「${slotSelect.options[slotSelect.selectedIndex].text}」に設定します。よろしいですか？`)) {
            return;
        }

        try {
            const response = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUserData),
            });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error);
            }

            messageArea.textContent = `${selectedUser.name}さんの通常授業を設定しました。`;
            messageArea.classList.add('success');

            // 更新後のユーザー情報を再取得して、選択状態を維持
            await populateSelect('/api/users', userSelect, 'user_id', 'name', 'users');
            userSelect.value = userId;

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    // 初期化処理
    const initialize = async () => {
        await populateSelect('/api/users', userSelect, 'user_id', 'name', 'users');
        await populateSelect('/api/class_slots', slotSelect, 'slot_id', 'slot_name', 'class_slots');
    };

    initialize();
});