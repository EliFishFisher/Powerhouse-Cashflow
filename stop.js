/**
 * Powerhouse CashFlow — Stop
 * Kills the data server and Next.js server started by launcher.js.
 */

const fs   = require("fs");
const path = require("path");

const PID_FILE = path.join(__dirname, "corneat-flow.pids");

if (!fs.existsSync(PID_FILE)) {
  console.log("No running instance found (no PID file).");
  process.exit(0);
}

try {
  const { data, app } = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));

  const kill = (pid, name) => {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Stopped ${name} (PID ${pid})`);
    } catch (e) {
      console.log(`${name} (PID ${pid}) was already stopped.`);
    }
  };

  if (data) kill(data, "data server");
  if (app)  kill(app,  "Next.js server");

  fs.unlinkSync(PID_FILE);
  console.log("Powerhouse CashFlow stopped.");
} catch (e) {
  console.error("Error stopping:", e.message);
}
