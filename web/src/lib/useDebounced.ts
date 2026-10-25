import { useEffect, useState } from 'react';

// The value as it was `ms` after the last change, so a request goes out when typing pauses.
export function useDebounced<T>(value: T, ms = 200): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(timer);
    }, [value, ms]);
    return debounced;
}
