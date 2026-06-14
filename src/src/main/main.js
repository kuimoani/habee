import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./storage.js";
import { ProviderRegistry } from "./providers/registry.js";

const isDev = Boolean(process.env.HABEE_DEV_SERVER_URL);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let store;
let providers;
const runControllers = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    title: "Habee",
    backgroundColor: "#f7f7f4",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.HABEE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

function registerIpc() {
  ipcMain.handle("habee:get-state", async () => {
    return {
      settings: await store.getSettings(),
      conversations: await store.listConversations()
    };
  });

  ipcMain.handle("habee:save-settings", async (_event, settings) => {
    return store.saveSettings(settings);
  });

  ipcMain.handle("habee:delete-conversation", async (_event, conversationId) => {
    await store.deleteConversation(conversationId);
    return store.listConversations();
  });

  ipcMain.handle("habee:load-conversation", async (_event, conversationId) => {
    return store.loadConversation(conversationId);
  });

  ipcMain.handle("habee:save-conversation", async (_event, conversation) => {
    return store.saveConversation(conversation);
  });

  ipcMain.handle("habee:run-agreement", async (event, payload) => {
    const progressId = payload.progressId;
    const controller = createRunController(progressId);
    try {
      const conversation = await providers.runAgreement(payload, {
        signal: controller.signal,
        onProgress: (progress) => {
          event.sender.send("habee:agreement-progress", {
            progressId,
            ...progress
          });
        }
      });
      await store.saveConversation(conversation);
      return conversation;
    } finally {
      if (runControllers.get(progressId) === controller) {
        runControllers.delete(progressId);
      }
    }
  });

  ipcMain.handle("habee:continue-agreement", async (event, payload) => {
    const progressId = payload.progressId;
    const controller = getOrCreateRunController(progressId);
    try {
      const conversation = await providers.continueAgreement(payload, {
        signal: controller.signal,
        onProgress: (progress) => {
          event.sender.send("habee:agreement-progress", {
            progressId,
            ...progress
          });
        }
      });
      await store.saveConversation(conversation);
      return conversation;
    } finally {
      if (!payload.keepController && runControllers.get(progressId) === controller) {
        runControllers.delete(progressId);
      }
    }
  });

  ipcMain.handle("habee:test-provider", async (event, payload) => {
    const progressId = payload.progressId;
    return providers.testProvider(payload.providerConfig, {
      onProgress: (progress) => {
        event.sender.send("habee:agreement-progress", {
          progressId,
          ...progress
        });
      }
    });
  });

  ipcMain.handle("habee:evaluate-consensus", async (event, payload) => {
    const progressId = payload.progressId;
    const controller = getOrCreateRunController(progressId);
    return providers.evaluateConsensus(payload, {
      signal: controller.signal,
      onProgress: (progress) => {
        event.sender.send("habee:agreement-progress", {
          progressId,
          ...progress
        });
      }
    });
  });

  ipcMain.handle("habee:stop-agreement", async (_event, payload) => {
    const controller = runControllers.get(payload.progressId);
    if (controller) {
      controller.abort();
      runControllers.delete(payload.progressId);
    }
    return { ok: true };
  });
}

function createRunController(progressId) {
  const existing = runControllers.get(progressId);
  if (existing) existing.abort();
  const controller = new AbortController();
  runControllers.set(progressId, controller);
  return controller;
}

function getOrCreateRunController(progressId) {
  const existing = runControllers.get(progressId);
  if (existing) return existing;
  return createRunController(progressId);
}

app.whenReady().then(async () => {
  store = new JsonStore(app.getPath("userData"));
  await store.ensureReady();
  providers = new ProviderRegistry();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
