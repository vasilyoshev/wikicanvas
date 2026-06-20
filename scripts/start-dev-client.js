const { spawn } = require("node:child_process");
const path = require("node:path");

const { getMetroPort } = require("./lib/ports");

const expoArgs = process.argv.slice(2);
const expoCliPath = path.join(process.cwd(), "node_modules", "expo", "bin", "cli");
const args = [expoCliPath, "start", "--dev-client", ...expoArgs];

// getMetroPort is read so a future native-dev helper can reuse the resolved port;
// logging it keeps the import meaningful and the value observable in dev output.
const metroPort = getMetroPort(expoArgs);
console.log(`[dev] starting Expo dev client (metro port ${metroPort})`);

const child = spawn(process.execPath, args, {
  env: { ...process.env, EXPO_NO_DOTENV: "1" },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
