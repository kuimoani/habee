const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("habee", {
  getState: () => ipcRenderer.invoke("habee:get-state"),
  saveSettings: (settings) => ipcRenderer.invoke("habee:save-settings", settings),
  loadConversation: (conversationId) => ipcRenderer.invoke("habee:load-conversation", conversationId),
  saveConversation: (conversation) => ipcRenderer.invoke("habee:save-conversation", conversation),
  deleteConversation: (conversationId) => ipcRenderer.invoke("habee:delete-conversation", conversationId),
  runAgreement: (payload) => ipcRenderer.invoke("habee:run-agreement", payload),
  continueAgreement: (payload) => ipcRenderer.invoke("habee:continue-agreement", payload),
  testProvider: (providerConfig) => ipcRenderer.invoke("habee:test-provider", providerConfig),
  evaluateConsensus: (payload) => ipcRenderer.invoke("habee:evaluate-consensus", payload),
  stopAgreement: (payload) => ipcRenderer.invoke("habee:stop-agreement", payload),
  onAgreementProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("habee:agreement-progress", listener);
    return () => ipcRenderer.removeListener("habee:agreement-progress", listener);
  }
});
