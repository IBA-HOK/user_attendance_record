document.addEventListener('DOMContentLoaded', () => {
    let currentMonth = new Date();
    let allData = {};

    const getStudentIdFromUrl = () => {
        const parts = window.location.pathname.split('/');
        return parts[parts.length - 1];
    };

    const fetchData = async () => {
        const studentId = getStudentIdFromUrl();
        if (!studentId) return;
        try {
            const response = await fetch(`/api/student-info/${studentId}`);
            if (!response.ok) throw new Error('生徒情報の取得に失敗');
            allData = await response.json();
            renderAll();
        } catch (error) {
            document.body.innerHTML = `<h1>エラー: ${error.message}</h1>`;
        }
    };

    const renderAll = () => {
        renderProfile();
        renderNextSchedule();
        renderNotes();
        renderScheduleHistory();
        renderCalendar();
    };

    const renderProfile = () => {
        const p = allData.profile;
        document.getElementById('student-name').textContent = p.name;
        document.getElementById('profile-id').textContent = p.user_id;
        document.getElementById('profile-level').textContent = p.user_level;
        document.getElementById('profile-email').textContent = p.email || 'N/A';
        document.getElementById('profile-pc').textContent = p.default_pc_name || 'N/A';
    };

    const renderNextSchedule = () => {
        const today = new Date().toISOString().split('T')[0];
        const futureSchedules = allData.schedules
            .filter(s => s.class_date >= today && s.status !== '欠席')
            .sort((a, b) => a.class_date.localeCompare(b.class_date));

        if (futureSchedules.length > 0) {
            const next = futureSchedules[0];
            document.getElementById('next-schedule').textContent = `${next.class_date} (${next.slot_name}) - ${next.status}`;
        } else {
            document.getElementById('next-schedule').textContent = '今後の予定はありません。';
        }
    };

    const renderNotes = () => {
        const notesHistory = allData.schedules
            .filter(s => s.notes)
            .map(s => `<div class="history-item">${s.class_date}: ${s.notes}</div>`)
            .join('');
        if (notesHistory) document.getElementById('notes-history').innerHTML = notesHistory;
    };

    const renderScheduleHistory = () => {
        const list = allData.schedules
            .sort((a, b) => b.class_date.localeCompare(a.class_date)) // 日付の降順でソート
            .map(s => `<div class="history-item">${s.class_date} | ${s.slot_name} | <strong>${s.status}</strong></div>`)
            .join('');
        document.getElementById('schedule-history-list').innerHTML = list;
    };

    /**
     * ▼▼▼【修正点】この関数を全面的に書き換え▼▼▼
     * カレンダー描画ロジック
     */
    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        document.getElementById('month-name').textContent = `${year}年 ${month + 1}月`;

        const calendarEl = document.querySelector('.calendar');
        calendarEl.innerHTML = '<div class="calendar-day header">日</div><div class="calendar-day header">月</div><div class="calendar-day header">火</div><div class="calendar-day header">水</div><div class="calendar-day header">木</div><div class="calendar-day header">金</div><div class="calendar-day header">土</div>';

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // 1. 差分スケジュール（振替・欠席など）を日付をキーにしたマップに変換
        const schedulesByDate = new Map();
        allData.schedules.forEach(s => {
            if (!schedulesByDate.has(s.class_date)) {
                schedulesByDate.set(s.class_date, []);
            }
            schedulesByDate.get(s.class_date).push(s);
        });

        // 2. 出席ログを日付ごとに集計
        const attendanceByDate = new Set();
        allData.logs.forEach(log => {
            const dateStr = new Date(log.log_time).toISOString().split('T')[0];
            attendanceByDate.add(dateStr);
        });

        // 3. 生徒の通常授業の曜日を取得
        const defaultDayOfWeek = allData.profile.default_day_of_week;
        const defaultSlotName = allData.profile.default_slot_name;

        // カレンダーの日付部分を生成
        for (let i = 0; i < firstDayOfMonth; i++) {
            calendarEl.insertAdjacentHTML('beforeend', '<div class="calendar-day"></div>');
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

            let className = 'calendar-day';
            let dayContent = `<div class="day-number">${day}</div>`;
            const daySlotsContainer = document.createElement('div');
            daySlotsContainer.className = 'day-slots';

            const diffSchedules = schedulesByDate.get(dateStr);
            const isAttended = attendanceByDate.has(dateStr);
            const isDefaultDay = (currentDate.getDay() === defaultDayOfWeek);

            // 表示ロジック
            if (diffSchedules) {
                // 振替や欠席などの差分がある日は、それを優先して表示
                diffSchedules.forEach(s => {
                    const slotDiv = document.createElement('div');
                    slotDiv.textContent = `${s.slot_name} (${s.status})`;
                    slotDiv.classList.add(`status-${s.status.toLowerCase()}`);
                    daySlotsContainer.appendChild(slotDiv);
                });
                className += ' special-schedule';
            } else if (isDefaultDay) {
                // 差分がなく、通常授業の日
                const slotDiv = document.createElement('div');
                slotDiv.textContent = defaultSlotName;
                daySlotsContainer.appendChild(slotDiv);
                className += ' scheduled';
            }

            if (isAttended) {
                className += ' attended';
            }

            dayContent += daySlotsContainer.outerHTML;
            calendarEl.insertAdjacentHTML('beforeend', `<div class="${className}">${dayContent}</div>`);
        }
    };

    document.getElementById('prev-month').onclick = () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); };
    document.getElementById('next-month').onclick = () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); };

    fetchData();
});