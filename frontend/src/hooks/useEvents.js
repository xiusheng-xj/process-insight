import { useState, useEffect, useCallback } from 'react';
import { fetchEvents, createEvent, updateEvent, deleteEvent } from '../api/events';

export function useEvents(projectId, params = {}) {
    const [data, setData]       = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        setError(null);
        try {
            setData(await fetchEvents(projectId, params));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, JSON.stringify(params)]);

    useEffect(() => { load(); }, [load]);

    return { data, loading, error, reload: load };
}

export function useEventMutations(projectId, onSuccess) {
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    const run = async (fn) => {
        setLoading(true);
        setError(null);
        try {
            const result = await fn();
            onSuccess?.();
            return result;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        error,
        create: (body)          => run(() => createEvent(projectId, body)),
        update: (eventId, body) => run(() => updateEvent(projectId, eventId, body)),
        remove: (eventId)       => run(() => deleteEvent(projectId, eventId)),
    };
}
