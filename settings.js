document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('modelSelect');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');

  // Load saved API key and model
  chrome.storage.sync.get(['apiKey', 'selectedModel'], function(data) {
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }
    if (data.selectedModel) {
      modelSelect.value = data.selectedModel;
    }
  });

  saveButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;

    if (apiKey) {
      chrome.storage.sync.set({apiKey: apiKey, selectedModel: selectedModel}, function() {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error saving settings: ' + chrome.runtime.lastError.message;
        } else {
          statusDiv.textContent = 'Settings saved successfully.';
          setTimeout(() => {
            statusDiv.textContent = '';
          }, 3000);
        }
      });
    } else {
      statusDiv.textContent = 'Please enter a valid API key.';
    }
  });
});
