document.addEventListener('DOMContentLoaded', () => {
    const bulkForm = document.getElementById('bulk-form');
    const userSelect = document.getElementById('user-select');
    const slotSelect = document.getElementById('slot-select');
    const pcSelect = document.getElementById('pc-select');
    const messageArea = document.getElementById('message');

    // データを取得してセレクトボックスを生成する汎用関数
    const populateSelect = async (url, selectElement, valueField, textField, name) => {
        try {
            const response = await fetch(url);
            const data = await response.json();
            const items = Array.isArray(data) ? data : data[name]; // APIの応答形式の差異を吸収

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

    // フォームの送信イベント
    bulkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        const formData = {
            user_id: userSelect.value,
            slot_id: slotSelect.value,
            pc_id: pcSelect.value || null, // 未選択の場合はnull
            term_end_date: document.getElementById('term-end-date').value,
        };

        if (!formData.user_id || !formData.slot_id || !formData.term_end_date) {
            alert("生徒、コマ、終了日をすべて選択してください。");
            return;
        }

        if (!confirm(`${userSelect.options[userSelect.selectedIndex].text}さんの通常授業を、${slotSelect.options[slotSelect.selectedIndex].text}で${formData.term_end_date}まで一括登録します。よろしいですか？`)) {
            return;
        }

        try {
            const response = await fetch('/api/schedules/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            messageArea.textContent = result.message;
            messageArea.classList.add('success');
            bulkForm.reset();

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    // 初期化処理
    populateSelect('/api/users', userSelect, 'user_id', 'name', 'users');
    populateSelect('/api/class_slots', slotSelect, 'slot_id', 'slot_name', 'class_slots');
    populateSelect('/api/pcs', pcSelect, 'pc_id', 'pc_name', 'pcs');
});
