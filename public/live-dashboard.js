document.addEventListener('DOMContentLoaded', () => {
    const classInfoElem = document.getElementById('current-class-info');
    const attendeeListContainer = document.getElementById('attendee-list-container');

    // 「出席」を記録する関数
    const logAttendance = async (userId) => {
        try {
            const response = await fetch('/api/entry_logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, log_type: 'entry' })
            });
            if (!response.ok) throw new Error('出席記録に失敗しました。');
            fetchCurrentClassStatus();
        } catch (error) { alert(`エラー: ${error.message}`); }
    };

    // 「出席取り消し」のための関数 (ログを削除)
    const cancelAttendance = async (userId) => {
        try {
            const response = await fetch('/api/entry_logs/today', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            if (!response.ok) throw new Error((await response.json()).error || '出席取り消しに失敗しました。');
            fetchCurrentClassStatus();
        } catch (error) { alert(`エラー: ${error.message}`); }
    };

    // 「欠席」にするための関数 (スケジュールを更新)
    const makeAbsent = async (userId) => {
        try {
            const response = await fetch('/api/live/make-absent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            if (!response.ok) throw new Error((await response.json()).error || '欠席処理に失敗しました。');
            fetchCurrentClassStatus();
        } catch (error) { alert(`エラー: ${error.message}`); }
    };

    // ライブ状況を取得して表示するメイン関数
    const fetchCurrentClassStatus = async () => {
        try {
            const response = await fetch('/api/live/current-class');
            const data = await response.json();
            attendeeListContainer.innerHTML = '';
            if (data.message) { classInfoElem.textContent = data.message; return; }

            if (data.current_class) {
                const classData = data.current_class;
                classInfoElem.textContent = `現在の授業: ${classData.slot_name} (${classData.start_time} - ${classData.end_time})`;

                if (data.attendees && data.attendees.length > 0) {
                    data.attendees.forEach(student => {
                        const card = document.createElement('div');
                        card.className = student.is_present ? 'attendee-card present' : 'attendee-card absent';
                        
                        const statusTag = student.status !== '通常' ? `<span class="status-tag">${student.status}</span>` : '';
                        const levelTag = student.user_level ? `<span class="level-tag">${student.user_level}</span>` : '';
                        const notes = student.notes ? `<p class="notes">備考: ${student.notes}</p>` : '';

                        // ▼▼▼ is_present の状態に応じて、表示するボタン群を切り替える ▼▼▼
                        let controlsHtml = '';
                        if (student.is_present) {
                            controlsHtml = `<button class="cancel-btn" data-user-id="${student.user_id}">出席を取り消し</button>`;
                        } else {
                            controlsHtml = `
                                <button class="attend-btn" data-user-id="${student.user_id}">出席を記録</button>
                                <button class="absent-btn" data-user-id="${student.user_id}">欠席にする</button>
                            `;
                        }

                        card.innerHTML = `
                            <div class="card-header">
                                <h3>${student.name}</h3>
                                <div>${levelTag} ${statusTag}</div>
                            </div>
                            <p>割当PC: ${student.pc_name || 'N/A'}</p>
                            ${notes}
                            <div class="attendance-controls">
                                ${controlsHtml}
                            </div>
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

    // ボタンのクリックイベント（イベント委任）
    attendeeListContainer.addEventListener('click', (e) => {
        const target = e.target;
        const userId = target.dataset.userId;

        if (target.classList.contains('attend-btn')) {
            logAttendance(userId);
        }
        if (target.classList.contains('cancel-btn')) {
            if (confirm(`生徒: ${userId} の出席記録を取り消しますか？`)) {
                cancelAttendance(userId);
            }
        }
        // ▼▼▼ 「欠席にする」ボタンの処理を追加 ▼▼▼
        if (target.classList.contains('absent-btn')) {
            if (confirm(`生徒: ${userId} を「欠席」として記録しますか？\nこの操作を行うと、この生徒はダッシュボードから消えます。`)) {
                makeAbsent(userId);
            }
        }
    });

    // 15秒ごとに自動更新
    setInterval(fetchCurrentClassStatus, 15000);
    // 初期表示
    fetchCurrentClassStatus();
});