// @ts-nocheck
// Generic async data-fetching hook with loading/error/retry

const { useState, useEffect, useCallback, useRef } = React;

function useAsync(asyncFn, deps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const counterRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(() => {
    const id = ++counterRef.current;
    setLoading(true);
    setData(null);
    setError(null);

    Promise.resolve(asyncFn())
      .then(result => {
        if (mountedRef.current && id === counterRef.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mountedRef.current && id === counterRef.current) {
          setError(err?.message ?? "Unknown error");
          setLoading(false);
        }
      });
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  const retry = useCallback(() => {
    execute();
  }, [execute]);

  return { loading, data, error, retry };
}

Object.assign(window as any, { useAsync });
