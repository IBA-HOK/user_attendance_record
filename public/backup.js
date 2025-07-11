document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('export-btn');
    const importForm = document.getElementById('import-form');
    const fileInput = document.getElementById('backup-file-input');
    const messageArea = document.getElementById('import-message');

    // エクスポート処理
    exportBtn.addEventListener('click', () => {
        window.location.href = '/api/export';
    });

    // インポート処理
    importForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageArea.textContent = '';
        messageArea.className = 'message';
        
        if (!fileInput.files || fileInput.files.length === 0) {
            alert('ファイルを選択してください。');
            return;
        }

        if (!confirm('本当にインポートを実行しますか？現在のデータは全て失われます。')) {
            return;
        }

        const formData = new FormData();
        formData.append('backupFile', fileInput.files[0]);
        
        messageArea.textContent = 'インポート処理中... 画面を閉じないでください。';
        messageArea.classList.add('success');

        try {
            const response = await fetch('/api/import', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            messageArea.textContent = result.message;
            alert('インポートが完了しました。ページをリロードして確認してください。');

        } catch (error) {
            messageArea.textContent = `エラー: ${error.message}`;
            messageArea.classList.add('error');
        } finally {
            importForm.reset();
        }
    });
});