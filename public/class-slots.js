document.addEventListener('DOMContentLoaded', () => {
    const slotForm = document.getElementById('slot-form');
    const slotListBody = document.getElementById('slot-list-body');
    const messageArea = document.getElementById('message');
    const days = ["日", "月", "火", "水", "木", "金", "土"];

    // コマ一覧をフェッチしてテーブルを生成する関数
    const fetchSlots = async () => {
        try {
            const response = await fetch('/api/class_slots');
            if (!response.ok) throw new Error('サーバーからの応答がありません。');
            const slots = await response.json();

            slotListBody.innerHTML = ''; // テーブルをクリア
            slots.forEach(slot => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${slot.slot_id}</td>
                    <td>${slot.slot_name}</td>
                    <td>${days[slot.day_of_week]}</td>
                    <td>${slot.period}</td>
                    <td>${slot.start_time || ''}</td>
                    <td>${slot.end_time || ''}</td>
                    <td>
                        <button class="delete-btn" data-id="${slot.slot_id}">削除</button>
                    </td>
                `;
                slotListBody.appendChild(tr);
            });
        } catch (error) {
            console.error('コマ一覧の取得に失敗:', error);
            slotListBody.innerHTML = `<tr><td colspan="7" class="error">${error.message}</td></tr>`;
        }
    };

    // コマ追加フォームの送信イベント
    slotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        const formData = {
            slot_name: document.getElementById('slot-name').value,
            day_of_week: parseInt(document.getElementById('day-of-week').value, 10),
            period: parseInt(document.getElementById('period').value, 10),
            start_time: document.getElementById('start-time').value,
            end_time: document.getElementById('end-time').value,
        };

        try {
            const response = await fetch('/api/class_slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            messageArea.textContent = `コマ「${formData.slot_name}」を追加しました。`;
            messageArea.classList.add('success');
            slotForm.reset();
            fetchSlots(); // 追加後に一覧を更新

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    // コマ削除のイベント（イベント委任）
    slotListBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const slotId = e.target.dataset.id;
            if (confirm(`コマID: ${slotId} を本当に削除しますか？このコマに紐づくスケジュールも全て削除されます。`)) {
                try {
                    const response = await fetch(`/api/class_slots/${slotId}`, { method: 'DELETE' });
                    if (!response.ok) {
                        const result = await response.json();
                        throw new Error(result.error);
                    }
                    fetchSlots(); // 削除後に一覧を更新
                } catch (error) {
                    alert(`削除失敗: ${error.message}`);
                }
            }
        }
    });

    // 初期化処理
    fetchSlots();
});
