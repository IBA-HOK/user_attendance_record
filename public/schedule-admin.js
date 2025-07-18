document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const filterForm = document.getElementById('filter-form');
    const scheduleListBody = document.getElementById('schedule-list-body');
    const addScheduleBtn = document.getElementById('add-schedule-btn');

    // 新規追加モーダル
    const addModal = document.getElementById('add-schedule-modal');
    const addForm = document.getElementById('add-schedule-form');
    const closeAddModalBtn = addModal.querySelector('.close-btn');
    const searchInput = document.getElementById('student-search-input');
    const searchBtn = document.getElementById('student-search-btn');
    const searchResults = document.getElementById('student-search-results');
    const selectedStudentInfo = document.getElementById('selected-student-info');
    const addClassDateInput = document.getElementById('add-class-date');
    const addSlotSelect = document.getElementById('add-slot-select');
    let selectedUserForAdd = null;

    // 編集モーダル
    const editModal = document.getElementById('edit-schedule-modal');
    const editForm = document.getElementById('edit-schedule-form');
    const closeModalBtn = editModal.querySelector('.close-btn');
    const editMessage = document.getElementById('edit-message');
    const editClassDateInput = document.getElementById('edit-class-date');
    const editSlotSelect = document.getElementById('edit-slot-select');
    let currentEditingScheduleId = null;

    // --- 関数定義 ---
    const populateSelect = async (url, selectElement, valueField, textFieldFn, defaultText) => {
        try {
            const response = await fetch(url);
            const items = await response.json();
            selectElement.innerHTML = `<option value="">-- ${defaultText} --</option>`;
            if (Array.isArray(items)) {
                items.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item[valueField];
                    option.textContent = typeof textFieldFn === 'function' ? textFieldFn(item) : item[textFieldFn];
                    selectElement.appendChild(option);
                });
            }
        } catch (error) { console.error(`${defaultText}の取得に失敗:`, error); }
    };

    const fetchSchedules = async () => {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        const status = document.getElementById('status-filter').value;
        const name = document.getElementById('name-filter').value.trim();
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (status) params.append('status', status);
        if (name) params.append('name', name);
        try {
            const response = await fetch(`/api/schedules?${params.toString()}`);
            const schedules = await response.json();
            scheduleListBody.innerHTML = '';
            schedules.forEach(s => {
                const tr = document.createElement('tr');
                tr.dataset.schedule = JSON.stringify(s);
                tr.innerHTML = `
                    <td>${s.class_date}</td>
                    <td>${s.slot_name}</td>
                    <td>${s.user_name}</td>
                    <td><span class="status-${s.status.toLowerCase()}">${s.status}</span></td>
                    <td>${s.notes || ''}</td>
                    <td>${s.pc_name || 'N/A'}</td>
                    <td class="actions">
                        <button class="edit-btn">編集</button>
                        <button class="delete-btn">削除</button>
                    </td>
                `;
                scheduleListBody.appendChild(tr);
            });
        } catch (error) { console.error("スケジュール取得エラー:", error); }
    };

    const updateAddModalSlots = async () => {
        const selectedDate = addClassDateInput.value;
        addSlotSelect.innerHTML = '<option value="">日付を選択してください</option>';
        if (!selectedDate) return;
        const date = new Date(selectedDate + 'T00:00:00');
        const dayOfWeek = date.getDay();
        try {
            const response = await fetch(`/api/class_slots?dayOfWeek=${dayOfWeek}`);
            const slots = await response.json();
            addSlotSelect.innerHTML = '<option value="">コマを選択...</option>';
            if (slots.length > 0) {
                slots.forEach(slot => {
                    const option = document.createElement('option');
                    option.value = slot.slot_id;
                    option.textContent = slot.slot_name;
                    addSlotSelect.appendChild(option);
                });
            } else {
                addSlotSelect.innerHTML = '<option value="">この曜日のコマはありません</option>';
            }
        } catch (error) { console.error("新規追加用コマの取得エラー:", error); }
    };
    const updateEditModalSlots = async () => {
        const selectedDate = editClassDateInput.value;
        editSlotSelect.innerHTML = '<option value="">日付を選択してください</option>';
        if (!selectedDate) return;

        const date = new Date(selectedDate + 'T00:00:00');
        const dayOfWeek = date.getDay();

        try {
            const response = await fetch(`/api/class_slots?dayOfWeek=${dayOfWeek}`);
            const slots = await response.json();
            
            editSlotSelect.innerHTML = '<option value="">コマを選択...</option>';
            if (slots.length > 0) {
                slots.forEach(slot => {
                    const option = document.createElement('option');
                    option.value = slot.slot_id;
                    option.textContent = slot.slot_name;
                    editSlotSelect.appendChild(option);
                });
            } else {
                editSlotSelect.innerHTML = '<option value="">この曜日のコマはありません</option>';
            }
        } catch (error) {
            console.error("編集用コマの取得エラー:", error);
        }
    };
    const searchStudents = async () => {
        const query = searchInput.value.trim();
        if (!query) return;
        try {
            const response = await fetch(`/api/users?name=${query}`);
            const data = await response.json();
            searchResults.innerHTML = '';
            selectedStudentInfo.textContent = '';
            selectedUserForAdd = null;
            if (data.users && data.users.length > 0) {
                data.users.forEach(user => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.textContent = `${user.name} (ID: ${user.user_id})`;
                    div.dataset.userId = user.user_id;
                    div.dataset.userName = user.name;
                    div.dataset.defaultPcId = user.default_pc_id || '';
                    searchResults.appendChild(div);
                });
            } else {
                searchResults.textContent = '該当する生徒が見つかりません。';
            }
        } catch (error) { console.error("生徒検索エラー:", error); }
    };

    // --- イベントリスナー設定 ---
    addScheduleBtn.addEventListener('click', () => {
        addForm.reset();
        searchResults.innerHTML = '';
        selectedStudentInfo.textContent = '';
        selectedUserForAdd = null;
        document.getElementById('add-message').textContent = '';
        updateAddModalSlots();
        addModal.style.display = 'block';
    });

    addClassDateInput.addEventListener('change', updateAddModalSlots);
    searchBtn.addEventListener('click', searchStudents);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchStudents(); } });

    searchResults.addEventListener('click', (e) => {
        if (e.target.classList.contains('search-result-item')) {
            selectedUserForAdd = {
                id: e.target.dataset.userId,
                name: e.target.dataset.userName,
                pcId: e.target.dataset.defaultPcId
            };
            selectedStudentInfo.textContent = `選択中の生徒: ${e.target.textContent}`;
            searchResults.innerHTML = '';
        }
    });

    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageArea = document.getElementById('add-message');
        messageArea.textContent = '';
        if (!selectedUserForAdd) { alert('生徒を選択してください。'); return; }
        const formData = {
            user_id: selectedUserForAdd.id,
            class_date: document.getElementById('add-class-date').value,
            slot_id: document.getElementById('add-slot-select').value,
            status: document.getElementById('add-status-select').value,
            notes: document.getElementById('add-notes').value,
            assigned_pc_id: selectedUserForAdd.pcId || null
        };
        try {
            const response = await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            if (!response.ok) throw new Error((await response.json()).error);
            addModal.style.display = 'none';
            fetchSchedules();
        } catch (error) {
            messageArea.textContent = `追加失敗: ${error.message}`;
            messageArea.classList.add('error');
        }
    });

    filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        fetchSchedules();
    });

    scheduleListBody.addEventListener('click', async (e) => {
        const target = e.target;
        const tr = target.closest('tr');
        if (!tr) return;
        const scheduleData = JSON.parse(tr.dataset.schedule);
        currentEditingScheduleId = scheduleData.schedule_id;

        if (target.classList.contains('delete-btn')) {
            if (confirm(`ID:${scheduleData.schedule_id} の予定を本当に削除しますか？`)) {
                try {
                    const response = await fetch(`/api/schedules/${scheduleData.schedule_id}`, { method: 'DELETE' });
                    if (!response.ok) throw new Error((await response.json()).error);
                    fetchSchedules();
                } catch (error) { alert(`削除失敗: ${error.message}`); }
            }
        }
        
        if (target.classList.contains('edit-btn')) {
            // フォームの値を先にセット
            document.getElementById('edit-student-name').textContent = scheduleData.user_name;
            editClassDateInput.value = scheduleData.class_date;
            document.getElementById('edit-status-select').value = scheduleData.status;
            document.getElementById('edit-pc-select').value = scheduleData.assigned_pc_id || '';
            document.getElementById('edit-notes').value = scheduleData.notes || '';
            editMessage.textContent = '';

            // 日付に基づいてコマのドロップダウンを更新し、完了を待つ
            await updateEditModalSlots();
            
            // ドロップダウンが更新された後で、元のコマを選択状態にする
            editSlotSelect.value = scheduleData.slot_id;

            editModal.style.display = 'block';
        }
    });
    editClassDateInput.addEventListener('change', updateEditModalSlots);
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            class_date: document.getElementById('edit-class-date').value,
            slot_id: document.getElementById('edit-slot-select').value,
            status: document.getElementById('edit-status-select').value,
            assigned_pc_id: document.getElementById('edit-pc-select').value || null,
            notes: document.getElementById('edit-notes').value
        };
        try {
            const response = await fetch(`/api/schedules/${currentEditingScheduleId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData)
            });
            if (!response.ok) throw new Error((await response.json()).error);
            editModal.style.display = 'none';
            fetchSchedules();
        } catch (error) {
            editMessage.textContent = `エラー: ${error.message}`;
            editMessage.classList.add('error');
        }
    });

    closeModalBtn.onclick = () => { editModal.style.display = 'none'; };
    closeAddModalBtn.onclick = () => { addModal.style.display = 'none'; };
    window.onclick = (e) => {
        if (e.target == addModal) addModal.style.display = 'none';
        if (e.target == editModal) editModal.style.display = 'none';
    };

    const initialize = async () => {
        await Promise.all([
            populateSelect('/api/class_slots', document.getElementById('add-slot-select'), 'slot_id', 'slot_name', '日付を選択'),
            // populateSelect('/api/class_slots', document.getElementById('edit-slot-select'), 'slot_id', 'slot_name', 'コマを選択'),
            populateSelect('/api/pcs', document.getElementById('edit-pc-select'), 'pc_id', (item) => `${item.pc_id} (${item.pc_name})`, 'PCを選択')
        ]);
        fetchSchedules();
    };

    initialize();
});