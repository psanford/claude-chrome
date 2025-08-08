document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('modelSelect');
  const saveButton = document.getElementById('save');
  const fetchModelsButton = document.getElementById('fetchModels');
  const statusDiv = document.getElementById('status');

  // Function to populate model select options
  function populateModels(models) {
    modelSelect.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      modelSelect.appendChild(option);
    });
  }

  // Load models from storage or use defaults
  chrome.storage.sync.get(['fetchedModels'], function(data) {
    const modelsToUse = data.fetchedModels || CLAUDE_MODELS;
    populateModels(modelsToUse);
  });

  // Load saved API key and model
  chrome.storage.sync.get(['apiKey', 'selectedModel', 'fetchedModels'], function(data) {
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }
    
    const modelsToUse = data.fetchedModels || CLAUDE_MODELS;
    
    if (data.selectedModel) {
      modelSelect.value = data.selectedModel;
    } else {
      // Set default model if none is selected
      const defaultModel = modelsToUse.find(model => model.isDefault) || modelsToUse[0];
      if (defaultModel) {
        modelSelect.value = defaultModel.id;
      }
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

  // Fetch models from Anthropic API
  fetchModelsButton.addEventListener('click', async function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      statusDiv.textContent = 'Please enter an API key first.';
      return;
    }

    statusDiv.textContent = 'Fetching models...';
    fetchModelsButton.disabled = true;

    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Transform API response to match our model format
      const fetchedModels = data.data.map(model => ({
        id: model.id,
        name: model.display_name || model.id,
        isDefault: model.id === 'claude-3-7-sonnet-latest'
      }));

      // Store fetched models
      chrome.storage.sync.set({fetchedModels: fetchedModels}, function() {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error storing models: ' + chrome.runtime.lastError.message;
        } else {
          populateModels(fetchedModels);
          statusDiv.textContent = `Successfully fetched ${fetchedModels.length} models.`;
          setTimeout(() => {
            statusDiv.textContent = '';
          }, 3000);
        }
      });

    } catch (error) {
      statusDiv.textContent = 'Error fetching models: ' + error.message;
    } finally {
      fetchModelsButton.disabled = false;
    }
  });
});
