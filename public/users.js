document.addEventListener('DOMContentLoaded', () => {
    const userForm = document.getElementById('user-form');
    const userListBody = document.getElementById('user-list-body');
    const pcSelect = document.getElementById('default-pc');
    const messageArea = document.getElementById('message');

    // PC一覧をフェッチしてドロップダウンを生成する関数
    const populatePcs = async () => {
        try {
            const response = await fetch('/api/pcs');
            const pcs = await response.json();
            pcs.forEach(pc => {
                const option = document.createElement('option');
                option.value = pc.pc_id;
                option.textContent = `${pc.pc_id} (${pc.pc_name})`;
                pcSelect.appendChild(option);
            });
        } catch (error) {
            console.error('PC一覧の取得に失敗:', error);
        }
    };

    // ユーザー一覧をフェッチしてテーブルを生成する関数
    // users.js の修正後

    const fetchUsers = async () => {
        try {
            const response = await fetch('/api/users');
            // responseがエラーでもjson()を試みる前にチェックする
            if (!response.ok) {
                // サーバーからエラーメッセージがJSONで返ってくることを期待
                const errorData = await response.json();
                throw new Error(errorData.error || 'サーバーエラー');
            }

            const data = await response.json(); // dataは { users: [...] } という形式

            userListBody.innerHTML = ''; // テーブルをクリア

            // data.users が存在し、配列であることを確認してから .forEach を使う
            if (data.users && Array.isArray(data.users)) {
                data.users.forEach(user => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                    <td>${user.user_id}</td>
                    <td>${user.name}</td>
                    <td>${user.user_level}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td>${user.default_pc_name || 'N/A'}</td>
                    <td>
                        <button class="delete-btn" data-id="${user.user_id}">削除</button>
                    </td>
                `;
                    userListBody.appendChild(tr);
                });
            }
        } catch (error) {
            console.error('ユーザー一覧の取得に失敗:', error);
            // エラーメッセージをユーザーに表示することも可能
            userListBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">データの読み込みに失敗しました。</td></tr>`;
        }
    };

    // ユーザー登録フォームの送信イベント
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        const formData = {
            user_id: document.getElementById('user-id').value,
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            user_level: document.getElementById('user-level').value,
            default_pc_id: document.getElementById('default-pc').value,
        };

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error);
            }

            messageArea.textContent = `ユーザー「${formData.name}」を登録しました。`;
            messageArea.classList.add('success');
            userForm.reset();
            fetchUsers(); // 登録後に一覧を更新

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    // ユーザー削除のイベント（イベント委任）
    userListBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const userId = e.target.dataset.id;
            if (confirm(`ユーザーID: ${userId} を本当に削除しますか？関連するスケジュールも全て削除されます。`)) {
                try {
                    const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
                    if (!response.ok) {
                        const result = await response.json();
                        throw new Error(result.error);
                    }
                    fetchUsers(); // 削除後に一覧を更新
                } catch (error) {
                    alert(`削除失敗: ${error.message}`);
                }
            }
        }
    });

    // 初期化処理
    populatePcs();
    fetchUsers();
});
