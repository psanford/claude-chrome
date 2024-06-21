document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('save');
  const statusDiv = document.getElementById('status');

  // Load saved API key
  chrome.storage.sync.get('apiKey', function(data) {
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }
  });

  saveButton.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.sync.set({apiKey: apiKey}, function() {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error saving API key: ' + chrome.runtime.lastError.message;
        } else {
          statusDiv.textContent = 'API key saved successfully.';
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
