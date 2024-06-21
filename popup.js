document.addEventListener('DOMContentLoaded', function() {
  const questionInput = document.getElementById('question');
  const submitButton = document.getElementById('submit');
  const conversationDiv = document.getElementById('conversation');
  const openSettingsLink = document.getElementById('openSettings');
  const modelName = 'claude-3-5-sonnet-20240620';
  let messages = [];
  let pageContent = '';
  let currentTabId;
  let currentUrl;

  openSettingsLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Load chat history when the popup opens
  initializePopup();

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

      const responseContainer = addMessageToConversation('assistant', 'Claude is thinking...');

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
              updateMessageContent(responseContainer, assistantResponse);
            }
          }
        }

        buffer = lines[lines.length - 1];
      }

      messages.push({ role: 'assistant', content: assistantResponse });
      saveChatHistory();
      scrollToBottom();
    } catch (error) {
      addMessageToConversation('assistant', `Error: ${error.message}`);
    }
  });

  function addMessageToConversation(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);
    updateMessageContent(messageDiv, content);
    conversationDiv.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
  }

  function updateMessageContent(messageDiv, content) {
    messageDiv.innerHTML = ''; // Clear existing content
    const lines = content.split('\n');
    lines.forEach(line => {
      const p = document.createElement('p');
      p.textContent = line;
      messageDiv.appendChild(p);
    });
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

  function getChatHistoryKey(tabId, url) {
    return `chatHistory_${tabId}_${new URL(url).hostname}`;
  }

  function saveChatHistory() {
    const key = getChatHistoryKey(currentTabId, currentUrl);
    chrome.storage.local.set({ [key]: messages }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving chat history:', chrome.runtime.lastError);
      }
    });
  }

  function loadChatHistory(tabId, url) {
    const key = getChatHistoryKey(tabId, url);
    chrome.storage.local.get(key, function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading chat history:', chrome.runtime.lastError);
      } else if (result[key]) {
        messages = result[key];
        conversationDiv.innerHTML = ''; // Clear existing conversation
        messages.forEach(message => {
          addMessageToConversation(message.role, message.content);
        });
      } else {
        // No existing history for this tab/URL combination
        messages = [];
        conversationDiv.innerHTML = '';
      }
    });
  }

  async function initializePopup() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    currentUrl = tab.url;
    loadChatHistory(currentTabId, currentUrl);
  }

  // Listen for tab updates
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tabId === currentTabId) {
      // The current tab has been reloaded or navigated to a new URL
      currentUrl = tab.url;
      loadChatHistory(currentTabId, currentUrl);
    }
  });
});
