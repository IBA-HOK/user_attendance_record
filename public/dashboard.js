document.addEventListener('DOMContentLoaded', () => {
    const filterForm = document.getElementById('filter-form');
    const manualAddForm = document.getElementById('manual-add-form');
    const logsTableBody = document.getElementById('logs-table-body');
    const addError = document.getElementById('add-error');
    const resetBtn = document.getElementById('reset-btn');

    // ログを取得してテーブルに表示する関数
    const fetchAndDisplayLogs = async (params = {}) => {
        const query = new URLSearchParams(params).toString();
        try {
            const response = await fetch(`/api/logs?${query}`);
            const data = await response.json();

            logsTableBody.innerHTML = ''; // テーブルをクリア
            if (data.logs) {
                data.logs.forEach(log => {
                    const row = document.createElement('tr');
                    const entryTime = new Date(log.entry_time).toLocaleString('ja-JP');
                    row.innerHTML = `
                        <td>${log.log_id}</td>
                        <td>${log.user_id}</td>
                        <td>${log.name}</td>
                        <td>${log.standard_slot || 'N/A'}</td>
                        <td>${entryTime}</td>
                    `;
                    logsTableBody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('ログの取得に失敗:', error);
        }
    };

    // 絞り込みフォームの送信イベント
    filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const params = {
            userId: document.getElementById('filter-user-id').value.trim(),
            name: document.getElementById('filter-name').value.trim(),
            slot: document.getElementById('filter-slot').value.trim(),
        };
        // 空のパラメータは除外
        Object.keys(params).forEach(key => {
            if (!params[key]) delete params[key];
        });
        fetchAndDisplayLogs(params);
    });

    // リセットボタンのイベント
    resetBtn.addEventListener('click', () => {
        filterForm.reset();
        fetchAndDisplayLogs();
    });

    // 手動追加フォームの送信イベント
    manualAddForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        addError.textContent = '';
        const userId = document.getElementById('add-user-id').value.trim();
        const entryTime = document.getElementById('add-entry-time').value.trim();

        try {
            const response = await fetch('/api/entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // entryTimeが空なら送信しない（サーバー側で現在時刻が使われる）
                body: JSON.stringify({ userId, entryTime: entryTime || undefined }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '追加に失敗しました。');

            manualAddForm.reset();
            fetchAndDisplayLogs(); // 追加後にリストを更新
        } catch (error) {
            addError.textContent = error.message;
        }
    });

    // 初期表示時に全ログを取得
    fetchAndDisplayLogs();
});
