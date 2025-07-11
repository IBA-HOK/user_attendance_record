document.addEventListener('DOMContentLoaded', () => {
    const classInfoElem = document.getElementById('current-class-info');
    const attendeeListContainer = document.getElementById('attendee-list-container');

    const fetchCurrentClassStatus = async () => {
        try {
            const response = await fetch('/api/live/current-class');
            const data = await response.json();

            attendeeListContainer.innerHTML = ''; // 表示をクリア

            if (data.message) {
                // 授業時間外の場合
                classInfoElem.textContent = data.message;
                return;
            }

            if (data.current_class) {
                const classData = data.current_class;
                classInfoElem.textContent = `現在の授業: ${classData.slot_name} (${classData.start_time} - ${classData.end_time})`;

                if (data.attendees && data.attendees.length > 0) {
                    data.attendees.forEach(student => {
                        const card = document.createElement('div');
                        card.className = student.is_present ? 'attendee-card present' : 'attendee-card absent';

                        const statusText = student.is_present
                            ? `出席 (${new Date(student.entry_log_time).toLocaleTimeString('ja-JP')})`
                            : '未入室';

                        const scheduleStatus = student.status !== '通常' ? `<span class="status-tag">${student.status}</span>` : '';

                        card.innerHTML = `
                            <h3>${student.name} ${scheduleStatus}</h3>
                            <p>割当PC: ${student.pc_name || 'N/A'}</p>
                            <p class="attendance-status">${statusText}</p>
                        `;
                        attendeeListContainer.appendChild(card);
                    });
                } else {
                    attendeeListContainer.innerHTML = '<p>このコマの出席予定者はいません。</p>';
                }
            }

        } catch (error) {
            console.error("ライブ状況の取得エラー:", error);
            classInfoElem.textContent = "データの取得に失敗しました。";
        }
    };

    // 15秒ごとに自動更新
    setInterval(fetchCurrentClassStatus, 15000);

    // 初期表示
    fetchCurrentClassStatus();
});
