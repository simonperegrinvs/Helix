import type { AiRunState } from "./useAiRun";

const formatElapsed = (ms: number): string => {
  if (ms < 1000) {
    return "0.0s";
  }
  return `${(ms / 1000).toFixed(1)}s`;
};

export const AiProgressPanel = <TResult,>({
  title,
  run,
  elapsedMs,
  silenceMs = 0,
  onCancel,
}: {
  title: string;
  run: AiRunState<TResult>;
  elapsedMs: number;
  silenceMs?: number;
  onCancel?: () => void;
}) => {
  if (run.status === "idle") {
    return null;
  }

  return (
    <div className="card ai-progress-panel">
      <div className="split-row">
        <h4>{title}</h4>
        <span className={`status-badge ai-status ai-status-${run.status}`}>{run.status}</span>
      </div>

      <div className="split-row">
        <strong>{run.stageMessage || "Working..."}</strong>
        <span className="muted">{formatElapsed(elapsedMs)}</span>
      </div>

      <progress max={100} value={run.percent} />
      <p className="muted">{run.percent}% complete</p>

      {run.status === "running" && onCancel ? (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      ) : null}

      {run.error ? <p className="muted">{run.error}</p> : null}

      <div className="ai-token-preview">
        <strong>Live model output</strong>
        <pre>
          {run.tokenPreview ||
            (run.status === "running" && run.events.length > 0
              ? `Waiting for model tokens... still running (${formatElapsed(silenceMs)} since last update).`
              : "Waiting for tokens...")}
        </pre>
      </div>

      <div className="ai-event-log">
        {run.events.slice(-6).map((event, index) => (
          <p key={`${event.type}-${index}`} className="muted">
            {event.type === "stage"
              ? `${event.stage}: ${event.message}`
              : event.type === "token"
                ? `token: ${event.text.slice(0, 60)}`
                : event.type === "artifact"
                  ? `artifact: ${event.name}`
                  : event.type === "done"
                    ? "done"
                    : `error: ${event.error}`}
          </p>
        ))}
      </div>
    </div>
  );
};
