import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logsDirectory = resolve(projectRoot, "logs", "tests");
const historyDirectory = resolve(logsDirectory, "history");
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const latestLogPath = resolve(logsDirectory, "latest.log");
const historyLogPath = resolve(historyDirectory, timestamp + ".log");

await mkdir(historyDirectory, { recursive: true });

const header = [
  "SupportAI test run",
  "Started: " + new Date().toISOString(),
  "Command: npm run test --workspaces --if-present",
  "------------------------------------------------------------",
  "",
].join("\n");

const latestLog = createWriteStream(latestLogPath, { flags: "w" });
const historyLog = createWriteStream(historyLogPath, { flags: "w" });
latestLog.write(header);
historyLog.write(header);

console.log("Running workspace tests...");
console.log("Saving complete output to: " + latestLogPath);
console.log("Archiving this run to: " + historyLogPath);
console.log("");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const testProcess = spawn(npmCommand, ["run", "test", "--workspaces", "--if-present"], {
  cwd: projectRoot,
  stdio: ["inherit", "pipe", "pipe"],
});

function writeOutput(chunk, destination) {
  process[destination].write(chunk);
  latestLog.write(chunk);
  historyLog.write(chunk);
}

testProcess.stdout.on("data", (chunk) => writeOutput(chunk, "stdout"));
testProcess.stderr.on("data", (chunk) => writeOutput(chunk, "stderr"));

testProcess.on("error", (error) => {
  const message = "\nFailed to start test process: " + error.message + "\n";
  process.stderr.write(message);
  latestLog.write(message);
  historyLog.write(message);
});

testProcess.on("close", async (code, signal) => {
  const result = signal
    ? "Test process stopped by signal: " + signal
    : "Test process exited with code: " + code;
  const footer = [
    "",
    "------------------------------------------------------------",
    result,
    "Finished: " + new Date().toISOString(),
    "",
  ].join("\n");

  latestLog.end(footer);
  historyLog.end(footer);
  await Promise.all([
    new Promise((resolveWrite) => latestLog.on("finish", resolveWrite)),
    new Promise((resolveWrite) => historyLog.on("finish", resolveWrite)),
  ]);

  console.log("");
  console.log(result);
  console.log("Full report: " + latestLogPath);
  process.exitCode = code === 0 ? 0 : 1;
});
