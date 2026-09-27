import { useCallback, useEffect, useState } from "react";
import { ApiStatus } from "../constants/constants";
import api from "../utils/backendApi";

/**
 * GETs an endpoint on mount and whenever reload() is called.
 * Keeps the last good data while reloading, so lists don't flash empty.
 */
export default function useApiData(endpoint) {
  const [state, setState] = useState({ data: null, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get(endpoint).then((result) => {
      if (!isCurrent) return;
      setState((previous) =>
        result.status === ApiStatus.SUCCESS
          ? { data: result.data, error: null }
          : { data: previous.data, error: result.message },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [endpoint, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { data: state.data, error: state.error, isLoading: state.data === null && state.error === null, reload };
}
