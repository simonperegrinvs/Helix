import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiStreamEvent } from "../../lib/api";

const MAX_EVENTS = 50;
const MAX_TOKEN_PREVIEW = 1200;

export type AiRunStatus = "idle" | "running" | "succeeded" | "failed" | "canceled";

export interface AiRunState<TResult> {
  status: AiRunStatus;
  startedAt: number | null;
  finishedAt: number | null;
  percent: number;
  latestStage: string;
  stageMessage: string;
  tokenPreview: string;
  events: AiStreamEvent<TResult>[];
  result: TResult | null;
  error: string;
}

const initialRunState = <TResult,>(): AiRunState<TResult> => ({
  status: "idle",
  startedAt: null,
  finishedAt: null,
  percent: 0,
  latestStage: "",
  stageMessage: "",
  tokenPreview: "",
  events: [],
  result: null,
  error: "",
});

export const useAiRun = <TResult,>() => {
  const [run, setRun] = useState<AiRunState<TResult>>(initialRunState<TResult>());
  const [tick, setTick] = useState(0);
  const runCounter = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (run.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => setTick((value) => value + 1), 500);
    return () => window.clearInterval(timer);
  }, [run.status]);

  const elapsedMs = useMemo(() => {
    if (!run.startedAt) {
      return 0;
    }
    const end = run.finishedAt ?? Date.now();
    return Math.max(0, end - run.startedAt);
  }, [run.startedAt, run.finishedAt, tick]);

  const handleEvent = useCallback((runId: number, event: AiStreamEvent<TResult>) => {
    setRun((current) => {
      if (runId !== runCounter.current) {
        return current;
      }

      const nextEvents = [...current.events, event].slice(-MAX_EVENTS);
      const next = {
        ...current,
        events: nextEvents,
      };

      if (event.type === "stage") {
        return {
          ...next,
          percent: event.percent,
          latestStage: event.stage,
          stageMessage: event.message,
        };
      }

      if (event.type === "token") {
        return {
          ...next,
          tokenPreview: `${current.tokenPreview}${event.text}`.slice(-MAX_TOKEN_PREVIEW),
        };
      }

      if (event.type === "done") {
        return {
          ...next,
          status: "succeeded",
          percent: 100,
          latestStage: "done",
          stageMessage: "Completed",
          finishedAt: Date.now(),
          result: event.result,
        };
      }

      if (event.type === "error") {
        return {
          ...next,
          status: "failed",
          error: event.error,
          finishedAt: Date.now(),
        };
      }

      return next;
    });
  }, []);

  const start = useCallback(
    async (
      runner: (
        onEvent: (event: AiStreamEvent<TResult>) => void,
        signal: AbortSignal,
      ) => Promise<TResult>,
    ): Promise<TResult | null> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      runCounter.current += 1;
      const runId = runCounter.current;

      setRun({
        status: "running",
        startedAt: Date.now(),
        finishedAt: null,
        percent: 0,
        latestStage: "queued",
        stageMessage: "Queued",
        tokenPreview: "",
        events: [],
        result: null,
        error: "",
      });

      try {
        const result = await runner((event) => handleEvent(runId, event), controller.signal);
        setRun((current) => {
          if (runId !== runCounter.current || current.status !== "running") {
            return current;
          }
          return {
            ...current,
            status: "succeeded",
            percent: 100,
            latestStage: "done",
            stageMessage: "Completed",
            finishedAt: Date.now(),
            result,
          };
        });
        return result;
      } catch (error) {
        setRun((current) => {
          if (runId !== runCounter.current) {
            return current;
          }
          if (controller.signal.aborted) {
            return {
              ...current,
              status: "canceled",
              stageMessage: "Canceled",
              finishedAt: Date.now(),
            };
          }
          return {
            ...current,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            finishedAt: Date.now(),
          };
        });
        return null;
      }
    },
    [handleEvent],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return {
    run,
    elapsedMs,
    start,
    cancel,
  };
};
