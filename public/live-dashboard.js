document.addEventListener('DOMContentLoaded', () => {
    const displayedDateElem = document.getElementById('displayed-date');
    const classInfoElem = document.getElementById('current-class-info');
    const attendeeListContainer = document.getElementById('attendee-list-container');
    const prevDayBtn = document.getElementById('prev-day-btn');
    const nextDayBtn = document.getElementById('next-day-btn');
    const prevClassBtn = document.getElementById('prev-class-btn');
    const nextClassBtn = document.getElementById('next-class-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    let displayedDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    let dailyClasses = [];
    let currentClassIndex = -1;

    const formatDate = (date) => date.toISOString().split('T')[0];

    const renderCurrentClassView = () => {
        attendeeListContainer.innerHTML = '';
        if (currentClassIndex < 0 || currentClassIndex >= dailyClasses.length) {
            classInfoElem.textContent = "表示できる授業がありません。";
            prevClassBtn.disabled = true;
            nextClassBtn.disabled = true;
            return;
        }

        const classData = dailyClasses[currentClassIndex];
        classInfoElem.textContent = `${classData.slot_name} (${classData.start_time}〜)`;

        const attendees = classData.schedules.filter(s => s.status !== '欠席');
        const absentees = classData.schedules.filter(s => s.status === '欠席');

        const attendeesSection = document.createElement('div');
        attendeesSection.className = 'roster-section';
        let attendeeHtml = `<h4>出席予定者 (${attendees.length}名)</h4>`;
        if (attendees.length > 0) {
            attendeeHtml += '<div class="roster-grid">';
            attendeeHtml += attendees.map(student => {
                const card = document.createElement('div');
                card.className = student.is_present ? 'attendee-card present' : 'attendee-card absent';
                const statusTag = student.status !== '通常' ? `<span class="status-tag status-${student.status.toLowerCase()}">${student.status}</span>` : '';
                const levelTag = student.user_level ? `<span class="level-tag">${student.user_level}</span>` : '';
                const notes = student.notes ? `<p class="notes">備考: ${student.notes}</p>` : '';
                let controlsHtml = '';
                if (student.is_present) {
                    controlsHtml = `<button class="cancel-btn" data-user-id="${student.user_id}">出席を取り消し</button>`;
                } else {
                    controlsHtml = `<button class="attend-btn" data-user-id="${student.user_id}">出席を記録</button>
                                    <button class="absent-btn" data-user-id="${student.user_id}" data-slot-id="${student.slot_id}" data-schedule-id="${student.schedule_id || ''}">欠席にする</button>`;
                }
                card.innerHTML = `
                <div class="card-header">
                    <h3><a href="/info/${student.user_id}" target="_blank">${student.user_name}</a></h3>
                    <div>${levelTag} ${statusTag}</div>
                </div>
                <p>割当PC: ${student.pc_name || 'N/A'}</p>
                ${notes}
                <div class="attendance-controls">${controlsHtml}</div>`;
                return card.outerHTML;
            }).join('');
            attendeeHtml += '</div>';
        } else {
            attendeeHtml += '<p>出席予定者はいません。</p>';
        }
        attendeesSection.innerHTML = attendeeHtml;
        attendeeListContainer.appendChild(attendeesSection);

        const absenteesSection = document.createElement('div');
        absenteesSection.className = 'roster-section';
        let absenteeHtml = `<h4>欠席者 (${absentees.length}名)</h4>`;
        if (absentees.length > 0) {
            absenteeHtml += '<div class="roster-grid">';
            absenteeHtml += absentees.map(student => `
            <div class="attendee-card absent-stamped">
                <div class="card-header">
                    <h3><a href="/info/${student.user_id}" target="_blank">${student.user_name}</a></h3>
                    <div><span class="status-tag status-欠席">${student.status}</span></div>
                </div>
            </div>`).join('');
            absenteeHtml += '</div>';
        } else {
            absenteeHtml += '<p>欠席者はいません。</p>';
        }
        absenteesSection.innerHTML = absenteeHtml;
        attendeeListContainer.appendChild(absenteesSection);

        prevClassBtn.disabled = (currentClassIndex <= 0);
        nextClassBtn.disabled = (currentClassIndex >= dailyClasses.length - 1);
    };

    const loadDay = async (dateObj) => {
        displayedDate = dateObj;
        const dateString = formatDate(displayedDate);
        displayedDateElem.textContent = dateString;
        classInfoElem.textContent = 'データを取得中...';
        attendeeListContainer.innerHTML = '';
        prevClassBtn.disabled = true;
        nextClassBtn.disabled = true;

        try {
            const response = await fetch(`/api/daily-roster?date=${dateString}`);
            if (!response.ok) throw new Error('データ取得に失敗しました');
            const results = await response.json();
            if (!Array.isArray(results)) throw new Error("無効なデータ形式");

            const slotsMap = new Map();
            results.forEach(row => {
                if (!slotsMap.has(row.slot_id)) {
                    slotsMap.set(row.slot_id, {
                        slot_id: row.slot_id, slot_name: row.slot_name,
                        start_time: row.start_time, end_time: row.end_time,
                        schedules: []
                    });
                }
                if (row.user_id) {
                    slotsMap.get(row.slot_id).schedules.push(row);
                }
            });
            dailyClasses = Array.from(slotsMap.values()).sort((a, b) => a.start_time.localeCompare(b.start_time));

            if (dailyClasses.length > 0) {
                const now = new Date();
                const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                let bestMatchIndex = 0;
                if (formatDate(now) === dateString) {
                    let foundCurrent = false;
                    for (let i = 0; i < dailyClasses.length; i++) {
                        const classSlot = dailyClasses[i];
                        if (classSlot.start_time <= currentTime && classSlot.end_time > currentTime) {
                            bestMatchIndex = i;
                            foundCurrent = true;
                            break;
                        }
                        if (!foundCurrent && classSlot.start_time > currentTime) {
                            bestMatchIndex = i;
                            foundCurrent = true;
                            break;
                        }
                    }
                    if (!foundCurrent && dailyClasses.length > 0) bestMatchIndex = dailyClasses.length - 1;
                }
                currentClassIndex = bestMatchIndex;
            } else {
                currentClassIndex = -1;
            }
            renderCurrentClassView();
        } catch (error) {
            console.error("データ取得エラー:", error);
            classInfoElem.textContent = '取得失敗';
        }
    };

    attendeeListContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const userId = target.dataset.userId;
        const dateString = formatDate(displayedDate);

        try {
            if (target.classList.contains('attend-btn') && userId) {
                const logTimeForDate = new Date(`${dateString}T12:00:00+09:00`).toISOString();
                const response = await fetch('/api/entry_logs', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, log_type: 'entry', log_time: logTimeForDate })
                });
                if (!response.ok) throw new Error('出席記録に失敗しました');
                loadDay(displayedDate);
            }
            else if (target.classList.contains('cancel-btn') && userId) {
                if (confirm(`生徒ID: ${userId} の出席記録を取り消しますか？`)) {
                    const response = await fetch('/api/entry_logs', {
                        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: userId, date: dateString })
                    });
                    if (!response.ok) throw new Error((await response.json()).error || '出席取り消しに失敗');
                    loadDay(displayedDate);
                }
            }
            else if (target.classList.contains('absent-btn')) {
                const slotId = target.dataset.slotId;
                if (!userId || !slotId) return;

                if (confirm(`この生徒を「欠席」として記録しますか？`)) {
                    const response = await fetch(`/api/live/make-absent`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: userId,
                            class_date: dateString,
                            slot_id: slotId
                        })
                    });
                    if (!response.ok) throw new Error((await response.json()).error || '欠席記録に失敗');
                    loadDay(displayedDate);
                }
            }
        } catch (error) {
            console.error("ボタン操作エラー:", error);
            alert(`エラー: ${error.message}`);
        }
    });

    prevDayBtn.addEventListener('click', () => { displayedDate.setDate(displayedDate.getDate() - 1); loadDay(displayedDate); });
    nextDayBtn.addEventListener('click', () => { displayedDate.setDate(displayedDate.getDate() + 1); loadDay(displayedDate); });
    prevClassBtn.addEventListener('click', () => { if (currentClassIndex > 0) { currentClassIndex--; renderCurrentClassView(); } });
    nextClassBtn.addEventListener('click', () => { if (currentClassIndex < dailyClasses.length - 1) { currentClassIndex++; renderCurrentClassView(); } });
    refreshBtn.addEventListener('click', () => loadDay(displayedDate));

    loadDay(new Date());
});