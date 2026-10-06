import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "./api";
export function useRemote<T>(path: string | null, interval = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    setData(null);
    setError(null);
    setLoading(Boolean(path));
    async function load() {
      if (!path || inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const result = await api<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setData(result.body);
          setError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error as ApiError);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, interval);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [path, interval, generation]);
  return { data, error, loading, refresh };
}
