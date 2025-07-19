document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const searchInput = document.getElementById('student-search-input');
    const searchBtn = document.getElementById('student-search-btn');
    const searchResults = document.getElementById('student-search-results');
    const scheduleSection = document.getElementById('schedule-section');
    const scheduleListTitle = document.getElementById('schedule-list-title');
    const showSchedulesBtn = document.getElementById('show-schedules-btn');
    const scheduleCheckboxList = document.getElementById('schedule-checkbox-list');
    const bulkAbsenceForm = document.getElementById('bulk-absence-form');
    const messageArea = document.getElementById('message');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const notesInput = document.getElementById('absence-notes'); // ▼▼▼【追加】

    let selectedStudent = null;

    // --- 関数定義 ---
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
        } catch (error) {
            console.error("生徒検索エラー:", error);
        }
    };

    const fetchAndDisplaySchedules = async () => {
        if (!selectedStudent) return;

        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        const params = new URLSearchParams({
            userId: selectedStudent.id,
            status: '通常'
        });
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        try {
            const response = await fetch(`/api/schedules?${params.toString()}`);
            const schedules = await response.json();

            scheduleCheckboxList.innerHTML = '';
            if (schedules.length > 0) {
                schedules.forEach(s => {
                    const label = document.createElement('label');
                    label.innerHTML = `<input type="checkbox" name="schedules" 
                                           data-user-id="${s.user_id}" 
                                           data-class-date="${s.class_date}" 
                                           data-slot-id="${s.slot_id}"> ${s.class_date} (${s.slot_name})`;
                    scheduleCheckboxList.appendChild(label);
                });
            } else {
                scheduleCheckboxList.innerHTML = '<p>対象期間に登録されている通常授業はありません。</p>';
            }
        } catch (error) {
            console.error("スケジュール取得エラー:", error);
            scheduleCheckboxList.innerHTML = '<p>スケジュールの取得に失敗しました。</p>';
        }
    };

    // --- イベントリスナー設定 ---
    searchBtn.addEventListener('click', searchStudents);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); searchStudents(); }
    });

    searchResults.addEventListener('click', (e) => {
        if (e.target.classList.contains('search-result-item')) {
            selectedStudent = {
                id: e.target.dataset.userId,
                name: e.target.dataset.userName,
            };
            scheduleListTitle.textContent = `2. ${selectedStudent.name} さんの授業予定`;
            searchResults.innerHTML = '';
            searchInput.value = selectedStudent.name;

            const today = new Date();
            const oneMonthLater = new Date();
            oneMonthLater.setMonth(today.getMonth() + 1);
            startDateInput.value = today.toISOString().split('T')[0];
            endDateInput.value = oneMonthLater.toISOString().split('T')[0];

            scheduleSection.style.display = 'block';
            fetchAndDisplaySchedules();
        }
    });

    showSchedulesBtn.addEventListener('click', fetchAndDisplaySchedules);

    bulkAbsenceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        const selectedSchedules = Array.from(document.querySelectorAll('input[name="schedules"]:checked'))
            .map(cb => ({
                user_id: cb.dataset.userId,
                class_date: cb.dataset.classDate,
                slot_id: cb.dataset.slotId
            }));

        const notes = notesInput.value.trim(); // ▼▼▼【追加】

        if (selectedSchedules.length === 0) {
            alert('欠席にする授業を1つ以上選択してください。');
            return;
        }

        if (!confirm(`${selectedSchedules.length}件の授業を欠席として登録します。よろしいですか？`)) {
            return;
        }

        try {
            const response = await fetch('/api/schedules/bulk-absence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schedules: selectedSchedules,
                    notes: notes // ▼▼▼【追加】
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            messageArea.textContent = result.message;
            messageArea.classList.add('success');
            notesInput.value = ''; // フォームをリセット
            fetchAndDisplaySchedules();

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });
});