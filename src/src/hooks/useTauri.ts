import { useState, useEffect } from 'react';

// Type definitions for Tauri
declare global {
    interface Window {
        __TAURI__?: {
            invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
            core?: {
                invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
            };
        };
    }
}

export function useTauri() {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const checkTauri = () => {
            if (window.__TAURI__) {
                setIsReady(true);
            } else {
                setTimeout(checkTauri, 50);
            }
        };
        checkTauri();
    }, []);

    const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
        if (!window.__TAURI__) {
            throw new Error('Tauri API not available');
        }
        const invoker = window.__TAURI__.invoke || window.__TAURI__.core?.invoke;
        if (!invoker) throw new Error('Tauri invoke not found');
        return invoker(cmd, args);
    };

    return { invoke, isReady };
}
