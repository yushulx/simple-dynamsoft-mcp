import assert from "node:assert/strict";
import test from "node:test";
import { createStartupTimingTracker } from "../../src/observability/startup-timing.js";

test("startup timing tracker emits stage durations and total elapsed", () => {
  const events = [];
  const nowSequence = [1000, 1015, 1055, 1100];
  let index = 0;

  const tracker = createStartupTimingTracker({
    now: () => {
      const value = nowSequence[index] ?? nowSequence[nowSequence.length - 1];
      index += 1;
      return value;
    },
    emit: (domain, event, payload) => {
      events.push({ domain, event, payload });
    }
  });

  tracker.mark("http_listener_ready");
  tracker.mark("data_ready", { mode: "custom" });
  tracker.complete({ transport: "http" });

  assert.deepEqual(events, [
    {
      domain: "startup",
      event: "stage",
      payload: {
        stage: "http_listener_ready",
        elapsed_ms: 15,
        since_boot_ms: 15
      }
    },
    {
      domain: "startup",
      event: "stage",
      payload: {
        stage: "data_ready",
        elapsed_ms: 40,
        since_boot_ms: 55,
        mode: "custom"
      }
    },
    {
      domain: "startup",
      event: "complete",
      payload: {
        total_ms: 100,
        transport: "http"
      }
    }
  ]);
});
