import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import electronCommand from "electron";

function pipe(child, name) {
  child.stdout.on("data", (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[${name}] ${data}`));
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

async function main() {
  const devServer = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
    shell: false,
    env: { ...process.env },
    cwd: process.cwd()
  });
  pipe(devServer, "dev");

  await waitForPort(5173);

  const electron = spawn(electronCommand, ["."], {
    shell: false,
    env: { ...process.env, HABEE_DEV_SERVER_URL: "http://127.0.0.1:5173" },
    cwd: process.cwd()
  });
  pipe(electron, "electron");

  const cleanup = () => {
    devServer.kill();
    electron.kill();
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  const [code] = await once(electron, "exit");
  cleanup();
  process.exit(code ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
