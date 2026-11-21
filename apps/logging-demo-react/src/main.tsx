import React from "react";
import { createRoot } from "react-dom/client";
import { createLogger, createMemoryTransport } from "@accelerate/logging-core";
import { LoggingProvider, useLogger } from "@accelerate/logging-react";
const memory = createMemoryTransport();
const logger = createLogger({ service: "logging-react-demo", level: "trace", transports: [memory] });
function Demo() {
  const log = useLogger("Demo");
  const [entries, setEntries] = React.useState<string[]>([]);
  function emit(level: "debug" | "info" | "warn" | "error") {
    log[level]("React logging demo event", { level, password: "hidden" });
    setEntries(memory.entries.map(e => JSON.stringify(e)));
  }
  return <main style={{fontFamily:"system-ui",maxWidth:900,margin:"3rem auto"}}>
    <h1>Accelerate Logging — React</h1>
    <p>Installed from npmjs.org. Generate structured, redacted events.</p>
    {(["debug","info","warn","error"] as const).map(level => <button key={level} onClick={() => emit(level)} style={{marginRight:8}}>{level}</button>)}
    <pre style={{whiteSpace:"pre-wrap"}}>{entries.join("\n")}</pre>
  </main>;
}
createRoot(document.getElementById("root")!).render(<LoggingProvider logger={logger}><Demo /></LoggingProvider>);
