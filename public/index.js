document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm("ログアウトしますか？")) {
                try {
                    const response = await fetch('/api/logout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    });

                    const result = await response.json();

                    if (result.success) {
                        // ログアウト成功後、ログインページへ強制送還
                        window.location.href = '/login.html';
                    } else {
                        alert('ログアウトに失敗しました。');
                    }
                } catch (error) {
                    console.error('ログアウト処理エラー:', error);
                    alert('エラーが発生しました。');
                }
            }
        });
    }
});
