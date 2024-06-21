document.addEventListener('DOMContentLoaded', function() {
  const questionInput = document.getElementById('question');
  const submitButton = document.getElementById('submit');
  const conversationDiv = document.getElementById('conversation');
  const openSettingsLink = document.getElementById('openSettings');
  const modelName = 'claude-3-5-sonnet-20240620';
  let messages = [];
  let pageContent = '';

  openSettingsLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  submitButton.addEventListener('click', async function() {
    const question = questionInput.value.trim();

    if (!question) {
      alert('Please enter a question.');
      return;
    }

    addMessageToConversation('user', question);
    questionInput.value = '';

    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        addMessageToConversation('assistant', 'API key not set. Please go to Settings to set your API key.');
        return;
      }

      if (!pageContent) {
        addMessageToConversation('assistant', 'Fetching page content...');
        pageContent = await getPageContent();
      }

      messages.push({ role: 'user', content: question });

      addMessageToConversation('assistant', 'Claude is thinking...');
      const responseContainer = conversationDiv.lastElementChild;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          system: `You are a browser extension chat bot. You and the user will have a discussion about the contents of this web page. Contents: ${pageContent}`,
          model: modelName,
          max_tokens: 1024,
          messages: messages,
          stream: true
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed: ${response.status} - ${response.statusText}. Error details: ${errorBody}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantResponse = '';

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
              assistantResponse += data.delta.text;
              responseContainer.textContent = assistantResponse;
            }
          }
        }

        buffer = lines[lines.length - 1];
      }

      messages.push({ role: 'assistant', content: assistantResponse });
      scrollToBottom();
    } catch (error) {
      addMessageToConversation('assistant', `Error: ${error.message}`);
    }
  });

  function addMessageToConversation(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);
    messageDiv.textContent = content;
    conversationDiv.appendChild(messageDiv);
    scrollToBottom();
  }

  function scrollToBottom() {
    conversationDiv.scrollTop = conversationDiv.scrollHeight;
  }

  async function getApiKey() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('apiKey', function(result) {
        resolve(result.apiKey);
      });
    });
  }

  async function getPageContent() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => document.body.innerText,
    });
    return result;
  }
});
