document.addEventListener('DOMContentLoaded', function() {
  const questionInput = document.getElementById('question');
  const apiKeyInput = document.getElementById('apiKey');
  const submitButton = document.getElementById('submit');
  const responseDiv = document.getElementById('response');

  submitButton.addEventListener('click', async function() {
    const question = questionInput.value;
    const apiKey = apiKeyInput.value;

    if (!question || !apiKey) {
      responseDiv.textContent = 'Please enter both a question and your API key.';
      return;
    }

    responseDiv.textContent = 'Fetching page content...';

    try {
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
          model: 'claude-3-5-sonnet-20240620',
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
