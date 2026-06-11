import { useState, useEffect, useCallback } from 'react';
import { fetchAlerts, resolveAlert, fetchAlertSummary } from '../api/alerts';

export function useAlerts(projectId, params = {}) {
    const [data, setData]       = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        setError(null);
        try {
            setData(await fetchAlerts(projectId, params));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, JSON.stringify(params)]);

    useEffect(() => { load(); }, [load]);

    const resolve = useCallback(async (alertId) => {
        await resolveAlert(projectId, alertId);
        load();
    }, [projectId, load]);

    return { data, loading, error, reload: load, resolve };
}

export function useAlertSummary() {
    const [data, setData]       = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await fetchAlertSummary());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return { data, loading, error, reload: load };
}
