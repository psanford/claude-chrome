function clearAllChatHistoriesAndTextFields() {
  chrome.storage.local.get(null, function(items) {
    const keysToRemove = Object.keys(items).filter(key =>
      key.startsWith('chatHistory_') || key.startsWith('textFieldContent_')
    );
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove, function() {
        if (chrome.runtime.lastError) {
          console.error('Error clearing chat histories and text fields:', chrome.runtime.lastError);
        } else {
          console.log('All chat histories and text fields cleared');
        }
      });
    }
  });
}

chrome.runtime.onStartup.addListener(clearAllChatHistoriesAndTextFields);
