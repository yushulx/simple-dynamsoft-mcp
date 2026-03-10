import { logEvent } from "./logging.js";

function createStartupTimingTracker({ now = Date.now, emit } = {}) {
  const emitEvent =
    typeof emit === "function"
      ? emit
      : (component, event, payload) => {
          logEvent(component, event, payload);
        };

  const startedAt = now();
  let previousAt = startedAt;

  function mark(stage, fields = {}) {
    const currentAt = now();
    emitEvent("startup", "stage", {
      stage,
      elapsed_ms: currentAt - previousAt,
      since_boot_ms: currentAt - startedAt,
      ...fields
    });
    previousAt = currentAt;
  }

  function complete(fields = {}) {
    const currentAt = now();
    emitEvent("startup", "complete", {
      total_ms: currentAt - startedAt,
      ...fields
    });
  }

  return {
    mark,
    complete
  };
}

export {
  createStartupTimingTracker
};
