document.addEventListener('DOMContentLoaded', () => {
    const userForm = document.getElementById('user-form');
    const userList = document.getElementById('user-list');
    const errorMessage = document.getElementById('error-message');

    const modal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const closeModalBtn = document.querySelector('.close-btn');
    let currentEditingId = null;

    // ユーザー一覧を取得して表示
    const fetchUsers = async () => {
        const response = await fetch('/api/users');
        const data = await response.json();
        userList.innerHTML = '';
        if (data.users) {
            data.users.forEach(user => {
                const li = document.createElement('li');
                // データ属性に全情報を格納
                li.dataset.id = user.id;
                li.dataset.name = user.name;
                li.dataset.email = user.email || '';
                li.dataset.standard_slot = user.standard_slot || '';
                li.dataset.standard_seat = user.standard_seat || '';

                const emailDisplay = user.email ? `<span class="email">${user.email}</span>` : '';
                const slotDisplay = user.standard_slot ? ` | コマ: ${user.standard_slot}` : '';
                const seatDisplay = user.standard_seat ? ` | 座席: ${user.standard_seat}` : '';

                li.innerHTML = `
                    <div class="user-info">
                        <span class="id">ID: ${user.id}</span>
                        <strong>${user.name}</strong><br>
                        ${emailDisplay}
                        <small>${slotDisplay}${seatDisplay}</small>
                    </div>
                    <div class="actions">
                        <button class="edit-btn">編集</button>
                        <button class="delete-btn">削除</button>
                    </div>
                `;
                userList.appendChild(li);
            });
        }
    };

    // ユーザー登録処理
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            id: document.getElementById('user-id').value.trim(),
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            standard_slot: document.getElementById('standard_slot').value.trim(),
            standard_seat: document.getElementById('standard_seat').value.trim(),
        };

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            errorMessage.textContent = '';
            userForm.reset();
            fetchUsers();
        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });

    // 編集ボタンのクリックイベント
    userList.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;

        if (e.target.classList.contains('edit-btn')) {
            currentEditingId = li.dataset.id;
            document.getElementById('edit-id').textContent = li.dataset.id;
            document.getElementById('edit-name').value = li.dataset.name;
            document.getElementById('edit-email').value = li.dataset.email;
            document.getElementById('edit-standard_slot').value = li.dataset.standard_slot;
            document.getElementById('edit-standard_seat').value = li.dataset.standard_seat;
            modal.style.display = 'block';
        }

        if (e.target.classList.contains('delete-btn')) {
            if (confirm(`ID: ${li.dataset.id} のユーザーを本当に削除しますか？`)) {
                fetch(`/api/users/${li.dataset.id}`, { method: 'DELETE' }).then(fetchUsers);
            }
        }
    });

    // 編集モーダルの保存処理
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            name: document.getElementById('edit-name').value.trim(),
            email: document.getElementById('edit-email').value.trim(),
            standard_slot: document.getElementById('edit-standard_slot').value.trim(),
            standard_seat: document.getElementById('edit-standard_seat').value.trim(),
        };

        try {
            const response = await fetch(`/api/users/${currentEditingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            modal.style.display = 'none';
            fetchUsers();
        } catch (error) {
            alert(error.message);
        }
    });

    // モーダルを閉じる
    closeModalBtn.onclick = () => { modal.style.display = 'none'; };
    window.onclick = (e) => {
        if (e.target == modal) { modal.style.display = 'none'; }
    };

    fetchUsers();
});
