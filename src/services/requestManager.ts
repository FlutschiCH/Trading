// Service for managing active fetch abort controllers and account generation IDs
let currentGeneration = 0;
let activeAbortControllers: Set<AbortController> = new Set();

export const cancelInFlightRequests = (): number => {
  currentGeneration += 1;
  console.log(`⚡ [RequestManager] Cancelling in-flight requests. Bumped generation to: ${currentGeneration}`);
  
  for (const controller of activeAbortControllers) {
    try {
      controller.abort('Account/Broker switched');
    } catch { }
  }
  activeAbortControllers.clear();
  return currentGeneration;
};

export const getCurrentGeneration = (): number => {
  return currentGeneration;
};

export const createManagedAbortSignal = (): { signal: AbortSignal; cleanup: () => void } => {
  const controller = new AbortController();
  activeAbortControllers.add(controller);

  const cleanup = () => {
    activeAbortControllers.delete(controller);
  };

  return { signal: controller.signal, cleanup };
};
