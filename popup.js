document.addEventListener('DOMContentLoaded', function() {
  const questionInput = document.getElementById('question');
  const submitButton = document.getElementById('submit');
  const responseDiv = document.getElementById('response');
  const openSettingsLink = document.getElementById('openSettings');
  const modelName = 'claude-3-5-sonnet-20240620';

  openSettingsLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  submitButton.addEventListener('click', async function() {
    const question = questionInput.value;

    if (!question) {
      responseDiv.textContent = 'Please enter a question.';
      return;
    }

    responseDiv.textContent = 'Fetching page content...';

    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        responseDiv.textContent = 'API key not set. Please go to Settings to set your API key.';
        return;
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const [{ result: pageContent }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: getPageContent,
      });

      responseDiv.textContent = 'Asking Claude...';

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
          ],
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      responseDiv.textContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line.startsWith('data:')) {
            const data = JSON.parse(line.slice(5));
            if (data.type === 'content_block_delta') {
              responseDiv.textContent += data.delta.text;
            }
          }
        }

        buffer = lines[lines.length - 1];
      }
    } catch (error) {
      responseDiv.textContent = `Error: ${error.message}`;
    }
  });
});

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('apiKey', function(result) {
      resolve(result.apiKey);
    });
  });
}

function getPageContent() {
  return document.body.innerText;
}
