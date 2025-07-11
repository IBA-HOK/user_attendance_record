document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const messageArea = document.getElementById('login-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error);
            }

            // ログイン成功後、ポータルページにリダイレクト
            window.location.href = '/';

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        }
    });
});
