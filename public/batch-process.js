document.addEventListener('DOMContentLoaded', () => {
    const dateSelectForm = document.getElementById('date-select-form');
    const targetDateInput = document.getElementById('target-date');
    const listTitle = document.getElementById('list-title');
    const table = document.getElementById('unaccounted-table');
    const tableBody = document.getElementById('unaccounted-list-body');

    const getTodayString = () => {
        const today = new Date();
        today.setHours(today.getHours() + 9); // JSTに補正
        return today.toISOString().split('T')[0];
    };

    const fetchUnaccountedStudents = async (date) => {
        listTitle.textContent = `${date} の出席未記録者リスト`;
        table.style.display = 'none';
        tableBody.innerHTML = '<tr><td colspan="3">データを取得中...</td></tr>';

        try {
            const response = await fetch(`/api/unaccounted?date=${date}`);
            if (!response.ok) throw new Error('データの取得に失敗しました。');
            const students = await response.json();

            tableBody.innerHTML = '';
            if (students.length > 0) {
                table.style.display = 'table';
                students.forEach(student => {
                    const tr = document.createElement('tr');
                    tr.id = `row-${student.schedule_id}`;
                    tr.innerHTML = `
                        <td>${student.user_name} (ID: ${student.user_id})</td>
                        <td>${student.slot_name}</td>
                        <td class="actions">
                            <button class="attend-btn" data-user-id="${student.user_id}">出席として記録</button>
                            <button class="absent-btn" data-schedule-id="${student.schedule_id}">欠席として記録</button>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });
            } else {
                listTitle.textContent = `${date} の出席未記録者はいません。`;
            }
        } catch (error) {
            console.error(error);
            listTitle.textContent = "データの取得中にエラーが発生しました。";
        }
    };

    dateSelectForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const targetDate = targetDateInput.value;
        if (targetDate) {
            fetchUnaccountedStudents(targetDate);
        }
    });

    tableBody.addEventListener('click', async (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        if (target.classList.contains('attend-btn')) {
            const userId = target.dataset.userId;
            const targetDate = targetDateInput.value;

            // ▼▼▼【修正点】選択した日付のタイムスタンプを生成して送信 ▼▼▼
            // タイムゾーン問題を避けるため、お昼の12時でタイムスタンプを生成
            const logTimeForDate = new Date(`${targetDate}T12:00:00+09:00`).toISOString();

            try {
                const response = await fetch('/api/entry_logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        log_type: 'entry',
                        log_time: logTimeForDate // タイムスタンプをAPIに渡す
                    })
                });
                if (!response.ok) throw new Error('出席記録に失敗');
                row.remove();
            } catch (error) { alert(`エラー: ${error.message}`); }
        }

        if (target.classList.contains('absent-btn')) {
            const scheduleId = target.dataset.scheduleId;
            try {
                const response = await fetch(`/api/schedules/${scheduleId}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: '欠席' })
                });
                if (!response.ok) throw new Error('欠席記録に失敗');
                row.remove();
            } catch (error) { alert(`エラー: ${error.message}`); }
        }
    });

    targetDateInput.value = getTodayString();
    fetchUnaccountedStudents(getTodayString());
});
