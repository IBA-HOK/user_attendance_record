document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('student-search-input');
    const searchBtn = document.getElementById('student-search-btn');
    const searchResults = document.getElementById('student-search-results');
    const transferSection = document.getElementById('transfer-form-section');
    const transferForm = document.getElementById('transfer-form');
    const transferFormTitle = document.getElementById('transfer-form-title');
    const makeupSlotSelect = document.getElementById('makeup-slot-select');
    const makeupDateInput = document.getElementById('makeup-date');
    const rosterSection = document.getElementById('roster-section');
    const rosterList = document.getElementById('roster-list');
    const cancelDateInput = document.getElementById('cancel-date');
    const cancelSlotSelect = document.getElementById('cancel-slot-select');
    const transferMessage = document.getElementById('transfer-message');
    let selectedStudent = null;

    const updateMakeupSlots = async () => {
        const makeupDate = makeupDateInput.value;
        makeupSlotSelect.innerHTML = '<option value="">日付を選択してください</option>';
        if (!makeupDate) return;
        const dateParts = makeupDate.split('-').map(part => parseInt(part, 10));
        const date = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
        const dayOfWeek = date.getUTCDay();
        try {
            const response = await fetch(`/api/class_slots?dayOfWeek=${dayOfWeek}`);
            const slots = await response.json();
            makeupSlotSelect.innerHTML = '<option value="">コマを選択...</option>';
            if (slots.length > 0) {
                slots.forEach(slot => {
                    const option = document.createElement('option');
                    option.value = slot.slot_id;
                    option.textContent = slot.slot_name;
                    makeupSlotSelect.appendChild(option);
                });
            } else {
                makeupSlotSelect.innerHTML = '<option value="">この曜日のコマはありません</option>';
            }
        } catch (error) { console.error("振替先コマの取得エラー:", error); }
    };

    const searchStudents = async () => {
        const query = searchInput.value.trim();
        if (!query) return;
        try {
            const response = await fetch(`/api/users?name=${query}`);
            const data = await response.json();
            searchResults.innerHTML = '';
            if (data.users && data.users.length > 0) {
                data.users.forEach(user => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.textContent = `${user.name} (ID: ${user.user_id})`;
                    div.dataset.userId = user.user_id;
                    div.dataset.userName = user.name;
                    searchResults.appendChild(div);
                });
            } else {
                searchResults.textContent = '該当する生徒が見つかりません。';
            }
        } catch (error) { console.error("生徒検索エラー:", error); }
    };

    const populateCancelSlots = async () => {
        const date = cancelDateInput.value;
        cancelSlotSelect.innerHTML = '<option value="">日付と生徒を選択してください</option>';
        if (!date || !selectedStudent) return;
        try {
            const response = await fetch(`/api/users/${selectedStudent.id}/default-schedule?date=${date}`);
            if (!response.ok) throw new Error('通常授業の取得に失敗しました。');
            const schedule = await response.json();
            cancelSlotSelect.innerHTML = '';
            if (schedule && schedule.default_slot_id) {
                const option = document.createElement('option');
                option.value = schedule.default_slot_id;
                option.textContent = schedule.slot_name;
                cancelSlotSelect.appendChild(option);
            } else {
                cancelSlotSelect.innerHTML = '<option value="">この日の通常授業はありません</option>';
            }
        } catch (error) {
            console.error("欠席コマの取得エラー:", error);
            cancelSlotSelect.innerHTML = `<option value="">取得エラー</option>`;
        }
    };

    const updateRosterDisplay = async () => {
        const date = makeupDateInput.value;
        const slotId = makeupSlotSelect.value;
        if (!date || !slotId) {
            rosterSection.style.display = 'none';
            return;
        }
        try {
            const response = await fetch(`/api/daily-roster?date=${date}`);
            const schedules = await response.json();
            const roster = schedules.filter(s => s.slot_id.toString() === slotId);
            rosterList.innerHTML = '';
            if (roster.length > 0) {
                roster.forEach(item => {
                    if (item.user_id) {
                        const li = document.createElement('li');
                        li.textContent = `${item.user_name} (ステータス: ${item.status})`;
                        rosterList.appendChild(li);
                    }
                });
                if (rosterList.innerHTML === '') rosterList.textContent = 'まだ誰もいません。';
            } else {
                rosterList.textContent = 'まだ誰もいません。';
            }
            rosterSection.style.display = 'block';
        } catch (error) { console.error("出席者リストの取得エラー:", error); }
    };

    const registerTransfer = async (e) => {
        e.preventDefault();
        if (!selectedStudent) return alert("生徒が選択されていません。");
        const originalClassDate = cancelDateInput.value;
        const makeupDate = makeupDateInput.value;
        const makeupSlotId = makeupSlotSelect.value;
        if (!originalClassDate || !makeupDate || !makeupSlotId) {
            return alert("欠席日、振替日、振替先のコマをすべて選択してください。");
        }
        transferMessage.textContent = '';
        transferMessage.className = 'message';
        try {
            const userResponse = await fetch(`/api/users/${selectedStudent.id}`);
            if (!userResponse.ok) throw new Error('生徒情報の取得に失敗しました。');
            const userData = await userResponse.json();
            const assignedPcId = userData.default_pc_id;

            const newScheduleData = {
                user_id: selectedStudent.id,
                class_date: makeupDate,
                slot_id: makeupSlotId,
                status: '振替',
                assigned_pc_id: assignedPcId || null,
                notes: `(${originalClassDate} からの振替)`,
                original_class_date: originalClassDate
            };
            const createResponse = await fetch('/api/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newScheduleData)
            });
            if (!createResponse.ok) {
                const errResult = await createResponse.json();
                throw new Error(errResult.error || '振替スケジュール作成に失敗しました。');
            }
            transferMessage.textContent = `${selectedStudent.name}さんの振替を正常に登録しました。`;
            transferMessage.classList.add('success');
            transferSection.style.display = 'none';
            rosterSection.style.display = 'none';
            searchInput.value = '';
            selectedStudent = null;
        } catch (error) {
            transferMessage.textContent = `エラー: ${error.message}`;
            transferMessage.classList.add('error');
        }
    };

    searchBtn.addEventListener('click', searchStudents);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchStudents(); } });

    searchResults.addEventListener('click', (e) => {
        if (e.target.classList.contains('search-result-item')) {
            selectedStudent = {
                id: e.target.dataset.userId,
                name: e.target.dataset.userName,
            };
            transferFormTitle.textContent = `2. ${selectedStudent.name} さんの振替を登録`;
            transferForm.reset();
            transferMessage.textContent = '';
            transferSection.style.display = 'block';
            searchResults.innerHTML = '';
            populateCancelSlots();
        }
    });

    cancelDateInput.addEventListener('change', populateCancelSlots);
    makeupDateInput.addEventListener('change', () => {
        updateMakeupSlots();
        updateRosterDisplay();
    });
    makeupSlotSelect.addEventListener('change', updateRosterDisplay);
    transferForm.addEventListener('submit', registerTransfer);
});