import { useCallback } from 'react';

export default function useLog() {
  return useCallback(async (level: string, pkg: string, message: string) => {
    await fetch('http://localhost:8000/internal/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stack: 'frontend', level, package: pkg, message })
    });
  }, []);
}
