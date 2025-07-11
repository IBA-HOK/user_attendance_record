document.addEventListener('DOMContentLoaded', () => {
    const pcForm = document.getElementById('pc-form');
    const pcListBody = document.getElementById('pc-list-body');
    const messageArea = document.getElementById('message');

    // PC一覧をフェッチしてテーブルを生成する関数
    const fetchPcs = async () => {
        try {
            const response = await fetch('/api/pcs');
            if (!response.ok) throw new Error('サーバーからの応答がありません。');
            const pcs = await response.json();

            pcListBody.innerHTML = ''; // テーブルをクリア
            pcs.forEach(pc => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${pc.pc_id}</td>
                    <td>${pc.pc_name}</td>
                    <td>${pc.notes || ''}</td>
                    <td>
                        <button class="delete-btn" data-id="${pc.pc_id}">削除</button>
                    </td>
                `;
                pcListBody.appendChild(tr);
            });
        } catch (error) {
            console.error('PC一覧の取得に失敗:', error);
            pcListBody.innerHTML = `<tr><td colspan="4" class="error">${error.message}</td></tr>`;
        }
    };

    // PC追加フォームの送信イベント
    pcForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        const formData = {
            pc_id: document.getElementById('pc-id').value,
            pc_name: document.getElementById('pc-name').value,
            notes: document.getElementById('pc-notes').value,
        };

        try {
            const response = await fetch('/api/pcs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            messageArea.textContent = `PC「${formData.pc_name}」を追加しました。`;
            messageArea.classList.add('success');
            pcForm.reset();
            fetchPcs(); // 追加後に一覧を更新

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    // PC削除のイベント（イベント委任）
    pcListBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const pcId = e.target.dataset.id;
            if (confirm(`PC ID: ${pcId} を本当に削除しますか？このPCを希望しているユーザーから設定が解除されます。`)) {
                try {
                    const response = await fetch(`/api/pcs/${pcId}`, { method: 'DELETE' });
                    if (!response.ok) {
                        const result = await response.json();
                        throw new Error(result.error);
                    }
                    fetchPcs(); // 削除後に一覧を更新
                } catch (error) {
                    alert(`削除失敗: ${error.message}`);
                }
            }
        }
    });

    // 初期化処理
    fetchPcs();
});
