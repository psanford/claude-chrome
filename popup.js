var modelName = 'claude-3-5-sonnet-20240620';

document.addEventListener('DOMContentLoaded', function() {
  const questionInput = document.getElementById('question');
  const submitButton = document.getElementById('submit');
  const responseDiv = document.getElementById('response');
  const openSettingsLink = document.getElementById('openSettings');

  openSettingsLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Check for saved API key on popup open
  chrome.storage.sync.get('apiKey', function(data) {
    if (data.apiKey) {
      console.log('API key found:', data.apiKey.substring(0, 5) + '...');
    } else {
      console.log('No API key found');
    }
  });

  submitButton.addEventListener('click', async function() {
    const question = questionInput.value;

    if (!question) {
      responseDiv.textContent = 'Please enter a question.';
      return;
    }

    responseDiv.textContent = 'Fetching page content...';

    try {
      // Get the API key from storage
      const apiKey = await new Promise((resolve) => {
        chrome.storage.sync.get('apiKey', function(result) {
          resolve(result.apiKey);
        });
      });

      if (!apiKey) {
        responseDiv.textContent = 'API key not set. Please go to Settings to set your API key.';
        return;
      }

      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Execute content script to get page content
      const [{ result: pageContent }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: getPageContent,
      });

      responseDiv.textContent = 'Asking Claude...';

      // Call Claude API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 1024,
          messages: [
            { role: 'user', content: `Here's the content of a web page: ${pageContent}\n\nQuestion: ${question}` }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      responseDiv.textContent = data.content[0].text;
    } catch (error) {
      responseDiv.textContent = `Error: ${error.message}`;
    }
  });
});

// This function will be injected into the page to get its content
function getPageContent() {
  return document.body.innerText;
}
