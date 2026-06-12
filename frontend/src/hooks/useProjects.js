import { useState, useEffect, useCallback } from 'react';
import { fetchProjects, fetchProject, createProject, updateProject, deleteProject } from '../api/projects';

export function useProjects(params = {}) {
    const [data, setData]       = useState([]);
    const [total, setTotal]     = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchProjects(params);
            setData(res.data);
            setTotal(res.total);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(params)]);

    useEffect(() => { load(); }, [load]);

    return { data, total, loading, error, reload: load };
}

export function useProject(id) {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            setData(await fetchProject(id));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    return { data, loading, error, reload: load };
}

export function useProjectMutations(onSuccess) {
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
        create: (body)     => run(() => createProject(body)),
        update: (id, body) => run(() => updateProject(id, body)),
        remove: (id)       => run(() => deleteProject(id)),
    };
}
