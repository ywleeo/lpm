import { useEffect, useRef, useState } from 'react'

/** 输入变化后防抖查询建议列表，并丢弃过期请求的结果（避免竞态覆盖最新输入） */
export function useSuggestions<T>(
  query: string,
  fetcher: (query: string) => Promise<T[]>,
  delayMs = 200
): T[] {
  const [suggestions, setSuggestions] = useState<T[]>([])
  const requestIdRef = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current
      fetcherRef
        .current(query)
        .then((result) => {
          if (requestIdRef.current === requestId) setSuggestions(result)
        })
        .catch((err: unknown) => {
          console.error('[useSuggestions] fetch failed:', err)
        })
    }, delayMs)
    return () => clearTimeout(timer)
  }, [query, delayMs])

  return suggestions
}
