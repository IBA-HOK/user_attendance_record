document.addEventListener('DOMContentLoaded', () => {
    const userForm = document.getElementById('user-form');
    const userList = document.getElementById('user-list');
    const errorMessage = document.getElementById('error-message');
    
    // 編集モーダル関連の要素
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
                li.dataset.id = user.id;
                li.dataset.name = user.name;
                li.dataset.email = user.email;
                li.innerHTML = `
                    <div class="user-info">
                        <span class="id">ID: ${user.id}</span><br>
                        <strong>${user.name}</strong><br>
                        <span class="email">${user.email}</span>
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
        const id = document.getElementById('user-id').value.trim();
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        
        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name, email }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            userForm.reset();
            fetchUsers();
        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });

    // ユーザー一覧のクリックイベント（編集と削除）
    userList.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        const id = li.dataset.id;
        
        if (e.target.classList.contains('delete-btn')) {
            // 削除処理
            if (confirm(`ID: ${id} のユーザーを本当に削除しますか？`)) {
                fetch(`/api/users/${id}`, { method: 'DELETE' }).then(fetchUsers);
            }
        } else if (e.target.classList.contains('edit-btn')) {
            // 編集処理
            currentEditingId = id;
            document.getElementById('edit-id').textContent = id;
            document.getElementById('edit-name').value = li.dataset.name;
            document.getElementById('edit-email').value = li.dataset.email;
            modal.style.display = 'block';
        }
    });

    // 編集モーダルの保存ボタン
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('edit-name').value.trim();
        const email = document.getElementById('edit-email').value.trim();
        
        try {
            const response = await fetch(`/api/users/${currentEditingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email }),
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

    // 初期表示
    fetchUsers();
});