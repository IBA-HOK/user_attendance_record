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
            .sort((a,b) => a.class_date.localeCompare(b.class_date));
        
        if (futureSchedules.length > 0) {
            const next = futureSchedules[0];
            document.getElementById('next-schedule').textContent = `${next.class_date} (${next.slot_name})`;
        } else {
            document.getElementById('next-schedule').textContent = '今後の予定はありません。';
        }
    };
    
    const renderNotes = () => {
        const notesHistory = allData.schedules
            .filter(s => s.notes)
            .map(s => `<div class="history-item">${s.class_date}: ${s.notes}</div>`)
            .join('');
        if(notesHistory) document.getElementById('notes-history').innerHTML = notesHistory;
    };

    const renderScheduleHistory = () => {
        const list = allData.schedules
            .map(s => `<div class="history-item">${s.class_date} | ${s.slot_name} | <strong>${s.status}</strong></div>`)
            .join('');
        document.getElementById('schedule-history-list').innerHTML = list;
    };

const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    document.getElementById('month-name').textContent = `${year}年 ${month + 1}月`;
    
    const calendarEl = document.querySelector('.calendar');
    calendarEl.innerHTML = '<div class="calendar-day header">日</div><div class="calendar-day header">月</div><div class="calendar-day header">火</div><div class="calendar-day header">水</div><div class="calendar-day header">木</div><div class="calendar-day header">金</div><div class="calendar-day header">土</div>';
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // ▼▼▼ ここからが修正箇所 ▼▼▼

    // 1. スケジュールを日付をキーにしたマップに変換
    const schedulesByDate = new Map();
    allData.schedules.forEach(s => {
        if (s.status !== '欠席') {
            if (!schedulesByDate.has(s.class_date)) {
                schedulesByDate.set(s.class_date, []);
            }
            schedulesByDate.get(s.class_date).push(s);
        }
    });

    // 2. 出席ログを日付ごとに集計
    const attendanceByDate = {};
    allData.logs.forEach(log => {
        const dateStr = new Date(log.log_time).toISOString().split('T')[0];
        if (!attendanceByDate[dateStr]) attendanceByDate[dateStr] = 0;
        attendanceByDate[dateStr]++;
    });

    // ▲▲▲ ここまでが修正箇所 ▲▲▲

    for (let i = 0; i < firstDay; i++) {
        calendarEl.insertAdjacentHTML('beforeend', '<div class="calendar-day"></div>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        let className = 'calendar-day';
        const attendanceCount = attendanceByDate[dateStr];
        const daySchedules = schedulesByDate.get(dateStr);

        if (attendanceCount > 0) {
            className += attendanceCount > 1 ? ' multiple' : ' attended';
        } else if (daySchedules) {
            className += ' scheduled';
        }
        
        // ▼▼▼ コマ名を描画するロジックを追加 ▼▼▼
        let dayContent = `<div class="day-number">${day}</div>`;
        if (daySchedules) {
            dayContent += '<div class="day-slots">';
            daySchedules.forEach(s => {
                dayContent += `<div>${s.slot_name}</div>`;
            });
            dayContent += '</div>';
        }
        // ▲▲▲ ここまでが修正箇所 ▲▲▲

        calendarEl.insertAdjacentHTML('beforeend', `<div class="${className}">${dayContent}</div>`);
    }
};

    document.getElementById('prev-month').onclick = () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); };
    document.getElementById('next-month').onclick = () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); };

    fetchData();
});