function clearAllChatHistories() {
  chrome.storage.local.get(null, function(items) {
    const chatHistoryKeys = Object.keys(items).filter(key => key.startsWith('chatHistory_'));
    if (chatHistoryKeys.length > 0) {
      chrome.storage.local.remove(chatHistoryKeys, function() {
        if (chrome.runtime.lastError) {
          console.error('Error clearing chat histories:', chrome.runtime.lastError);
        } else {
          console.log('All chat histories cleared');
        }
      });
    }
  });
}

chrome.runtime.onStartup.addListener(clearAllChatHistories);
