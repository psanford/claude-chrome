document.addEventListener('DOMContentLoaded', function() {
  const questionInput = document.getElementById('question');
  const submitButton = document.getElementById('submit');
  const conversationDiv = document.getElementById('conversation');
  const openSettingsLink = document.getElementById('openSettings');
  const clearHistoryLink = document.getElementById('clearHistory');
  const currentModelSpan = document.getElementById('currentModel');
  
  let selectedModel = CLAUDE_MODELS.find(model => model.isDefault)?.id || CLAUDE_MODELS[0].id;
  let messages = [];
  let pageContent = '';
  let currentTabId;
  let currentUrl;

  // Auto-resize textarea
  questionInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    saveTextFieldContent();
  });

  // Handle settings link
  openSettingsLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Handle clear history link
  clearHistoryLink.addEventListener('click', function(e) {
    e.preventDefault();
    
    if (confirm('Are you sure you want to clear the chat history for this tab?')) {
      clearCurrentTabHistory();
    }
  });


  // Handle key press events for the question input
  questionInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitButton.click();
    }
  });

  // Initialize sidebar
  initializeSidebar();

  submitButton.addEventListener('click', async function() {
    const question = questionInput.value.trim();

    if (!question) {
      return;
    }

    addMessageToConversation('user', question);
    questionInput.value = '';
    questionInput.style.height = 'auto';
    saveTextFieldContent();

    let responseContainer = null;
    
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        addMessageToConversation('assistant', 'API key not set. Please go to Settings to set your API key.');
        return;
      }

      if (!pageContent) {
        const thinkingMsg = addMessageToConversation('assistant', '');
        updateMessageWithThinking(thinkingMsg, 'Fetching page content...');
        pageContent = await getPageContent();
        removeThinking(thinkingMsg);
      }

      messages.push({ role: 'user', content: question });

      responseContainer = addMessageToConversation('assistant', '');
      updateMessageWithThinking(responseContainer, 'Claude is thinking...');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-dangerous-direct-browser-access': true,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          system: `You are a browser extension chat bot. You and the user will have a discussion about the contents of this web page. Contents: ${pageContent}`,
          model: selectedModel,
          max_tokens: 4096,
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

      removeThinking(responseContainer);

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
      if (responseContainer) {
        removeThinking(responseContainer);
      }
      addMessageToConversation('assistant', `Error: ${error.message}`);
    }

    questionInput.focus();
  });

  function addMessageToConversation(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);
    if (content) {
      updateMessageContent(messageDiv, content);
    }
    conversationDiv.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
  }

  function updateMessageWithThinking(messageDiv, text) {
    messageDiv.innerHTML = `
      <div class="thinking-indicator">
        ${text}
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;
  }

  function removeThinking(messageDiv) {
    const thinkingIndicator = messageDiv.querySelector('.thinking-indicator');
    if (thinkingIndicator) {
      thinkingIndicator.remove();
    }
  }

  function updateMessageContent(messageDiv, content) {
    removeThinking(messageDiv);
    
    const lines = content.split('\n');
    let isCodeBlock = false;
    let codeBlockContent = '';
    
    messageDiv.innerHTML = '';

    lines.forEach(line => {
      if (line.trim().startsWith('```')) {
        if (isCodeBlock) {
          const codeElement = createCodeBlock(codeBlockContent);
          messageDiv.appendChild(codeElement);
          codeBlockContent = '';
        }
        isCodeBlock = !isCodeBlock;
      } else if (isCodeBlock) {
        codeBlockContent += line + '\n';
      } else {
        const p = document.createElement('p');
        p.textContent = line;
        messageDiv.appendChild(p);
      }
    });

    if (codeBlockContent) {
      const codeElement = createCodeBlock(codeBlockContent);
      messageDiv.appendChild(codeElement);
    }
  }

  function createCodeBlock(content) {
    const preElement = document.createElement('pre');
    const codeElement = document.createElement('code');
    codeElement.textContent = content.trim();
    preElement.appendChild(codeElement);

    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy';
    copyButton.classList.add('copy-button');
    copyButton.addEventListener('click', () => copyCodeToClipboard(content.trim(), copyButton));

    const wrapper = document.createElement('div');
    wrapper.classList.add('code-block-wrapper');
    wrapper.appendChild(preElement);
    wrapper.appendChild(copyButton);

    return wrapper;
  }

  function copyCodeToClipboard(code, button) {
    navigator.clipboard.writeText(code).then(() => {
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  }

  function scrollToBottom() {
    const conversationArea = document.getElementById('conversationArea');
    conversationArea.scrollTop = conversationArea.scrollHeight;
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
    try {
      return `chatHistory_${tabId}_${new URL(url).hostname}`;
    } catch (e) {
      return `chatHistory_${tabId}_unknown`;
    }
  }

  function saveChatHistory() {
    if (!currentTabId || !currentUrl) return;
    
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
        conversationDiv.innerHTML = '';
        messages.forEach(message => {
          addMessageToConversation(message.role, message.content);
        });
      } else {
        messages = [];
        conversationDiv.innerHTML = '';
      }
    });
  }

  function updateModelDisplay() {
    chrome.storage.sync.get(['selectedModel', 'fetchedModels'], function(data) {
      const modelsToUse = data.fetchedModels || CLAUDE_MODELS;
      const currentSelectedModel = data.selectedModel || selectedModel;
      
      const selectedModelInfo = modelsToUse.find(model => model.id === currentSelectedModel);
      currentModelSpan.textContent = selectedModelInfo ? selectedModelInfo.name : currentSelectedModel;
      selectedModel = currentSelectedModel;
    });
  }

  async function initializeSidebar() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    currentUrl = tab.url;
    
    loadChatHistory(currentTabId, currentUrl);
    loadTextFieldContent();
    updateModelDisplay();
    questionInput.focus();
  }

  function saveTextFieldContent() {
    if (!currentTabId || !currentUrl) return;
    
    const key = `textFieldContent_${currentTabId}_${getChatHistoryKey(currentTabId, currentUrl)}`;
    const content = questionInput.value;
    
    if (content) {
      chrome.storage.local.set({ [key]: content });
    } else {
      chrome.storage.local.remove(key);
    }
  }

  function loadTextFieldContent() {
    if (!currentTabId || !currentUrl) return;
    
    const key = `textFieldContent_${currentTabId}_${getChatHistoryKey(currentTabId, currentUrl)}`;
    chrome.storage.local.get(key, function(result) {
      if (result[key]) {
        questionInput.value = result[key];
        questionInput.style.height = 'auto';
        questionInput.style.height = Math.min(questionInput.scrollHeight, 120) + 'px';
      }
    });
  }

  // Listen for storage changes
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync' && (changes.selectedModel || changes.fetchedModels)) {
      updateModelDisplay();
    }
  });

  // Listen for tab updates (navigation within same tab)
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tabId === currentTabId) {
      currentUrl = tab.url;
      loadChatHistory(currentTabId, currentUrl);
      loadTextFieldContent();
    }
  });

  // Listen for tab activation (switching between tabs)
  chrome.tabs.onActivated.addListener(async function(activeInfo) {
    currentTabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(currentTabId);
    currentUrl = tab.url;
    
    // Clear page content so it gets fetched fresh for the new tab
    pageContent = '';
    
    loadChatHistory(currentTabId, currentUrl);
    loadTextFieldContent();
  });

  function clearCurrentTabHistory() {
    if (!currentTabId || !currentUrl) return;

    // Clear the current messages array
    messages = [];
    
    // Clear the conversation display
    conversationDiv.innerHTML = '';
    
    // Clear page content cache so it gets refetched
    pageContent = '';
    
    // Remove from storage
    const chatKey = getChatHistoryKey(currentTabId, currentUrl);
    const textKey = `textFieldContent_${currentTabId}_${getChatHistoryKey(currentTabId, currentUrl)}`;
    
    chrome.storage.local.remove([chatKey, textKey], function() {
      if (chrome.runtime.lastError) {
        console.error('Error clearing chat history:', chrome.runtime.lastError);
      }
    });
    
    // Clear and focus the input
    questionInput.value = '';
    questionInput.style.height = 'auto';
    questionInput.focus();
  }
});