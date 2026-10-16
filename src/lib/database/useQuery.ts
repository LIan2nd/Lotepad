import { useEffect, useRef, useState, type DependencyList } from "react";
import { subscribeStorage } from "./repository";
import { useApp } from "../../stores/app";
export function useQuery<T>(
  load: () => Promise<T>,
  dependencies: DependencyList = [],
): T | undefined {
  const [value, setValue] = useState<T>();
  const latest = useRef(load);
  latest.current = load;
  const notify = useApp((s) => s.notify);
  useEffect(() => {
    let active = true,
      sequence = 0;
    const refresh = () => {
      const current = ++sequence;
      void latest
        .current()
        .then((result) => {
          if (active && current === sequence) setValue(result);
        })
        .catch((error) => {
          if (active) notify(String(error), true);
        });
    };
    refresh();
    const stop = subscribeStorage(refresh);
    return () => {
      active = false;
      stop();
    };
    // Callers explicitly declare the query's identity; latest keeps its closure current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, ...dependencies]);
  return value;
}
