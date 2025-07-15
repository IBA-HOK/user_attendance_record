document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    const portalMenu = document.querySelector('.portal-menu');

    // --- 権限に基づいてメニュー項目を表示する関数 ---
    const displayMenuBasedOnPermissions = async () => {
        try {
            const response = await fetch('/api/my-permissions');
            if (!response.ok) {
                // 認証エラーなどで権限が取得できない場合は、ログインページにリダイレクト
                if (response.status === 401) {
                    window.location.href = '/login.html';
                }
                return;
            }
            const userPermissions = await response.json();

            const menuItems = portalMenu.querySelectorAll('.portal-card');

            menuItems.forEach(item => {
                const requiredPermission = item.dataset.permission;
                // 必要な権限が設定されていないか、ユーザーがその権限を持っていれば表示
                if (!requiredPermission || userPermissions.includes(requiredPermission)) {
                    item.style.display = 'block';
                }
            });

        } catch (error) {
            console.error('権限の取得またはメニューの表示中にエラーが発生しました:', error);
            portalMenu.innerHTML = '<p class="error">メニューの読み込みに失敗しました。ページを再読み込みしてください。</p>';
        }
    };

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

    // --- 初期化処理 ---
    displayMenuBasedOnPermissions();
});
