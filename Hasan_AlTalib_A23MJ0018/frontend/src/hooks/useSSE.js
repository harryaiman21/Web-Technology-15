// src/hooks/useSSE.js
import { useState, useEffect, useRef, useCallback } from 'react';

export default function useSSE(streamUrl) {
  const [events, setEvents] = useState([]);
  const [latestEvent, setLatestEvent] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [thinkingVersion, setThinkingVersion] = useState(0);
  const thinkingRef = useRef({});
  const rafRef = useRef(null);
  const esRef = useRef(null);
  const isCompleteRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const scheduleThinkingFlush = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setThinkingVersion((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    if (!streamUrl) return;

    setEvents([]);
    setLatestEvent(null);
    setIsComplete(false);
    isCompleteRef.current = false;
    setIsConnected(false);
    setError(null);
    setIsReconnecting(false);
    reconnectAttemptRef.current = 0;
    thinkingRef.current = {};
    setThinkingVersion(0);

    function connect() {
      const es = new EventSource(streamUrl, { withCredentials: true });
      esRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        setIsReconnecting(false);
        setError(null);
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.type === 'agent_thinking' && data.agentId && data.token) {
            thinkingRef.current = {
              ...thinkingRef.current,
              [data.agentId]: (thinkingRef.current[data.agentId] || '') + data.token,
            };
            scheduleThinkingFlush();
            return;
          }

          setEvents((prev) => [...prev, data]);
          setLatestEvent(data);
          if (data.type === 'pipeline_complete' || data.type === 'complete') {
            setIsComplete(true);
            isCompleteRef.current = true;
            setIsConnected(false);
            setIsReconnecting(false);
            es.close();
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();

        if (!isCompleteRef.current && reconnectAttemptRef.current < 5) {
          reconnectAttemptRef.current += 1;
          setIsReconnecting(true);
          reconnectTimerRef.current = window.setTimeout(() => {
            connect();
          }, 1000);
          return;
        }

        setIsReconnecting(false);
        setError('Connection error');
      };
    }

    connect();

    return () => {
      window.clearTimeout(reconnectTimerRef.current);
      const es = esRef.current;
      if (es && es.readyState !== 2) {
        es.close();
      }
    };
  }, [streamUrl]);

  return {
    events, latestEvent, isComplete, isConnected, error, isReconnecting,
    thinking: thinkingRef.current,
    thinkingVersion,
  };
}
