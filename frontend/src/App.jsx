import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProjectList from './pages/ProjectList';
import ProjectDetail from './pages/ProjectDetail';

function UsernameGate({ children }) {
    const [name, setName] = useState(() => sessionStorage.getItem('userName') || '');
    const [input, setInput] = useState('');

    if (name) return children;

    const handleSave = (e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed) return;
        sessionStorage.setItem('userName', trimmed);
        setName(trimmed);
    };

    return (
        <div className="overlay">
            <div className="modal" style={{ width: 360, textAlign: 'center' }}>
                <h2 className="modal-title" style={{ marginBottom: 8 }}>工程管理システム</h2>
                <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
                    編集ロック管理のためユーザー名を入力してください。
                </p>
                <form onSubmit={handleSave}>
                    <div className="form-group">
                        <input
                            className="form-control"
                            placeholder="例: 山田太郎"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={!input.trim()}>
                        開始する
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <UsernameGate>
                <Routes>
                    <Route path="/" element={<Navigate to="/projects" replace />} />
                    <Route path="/projects" element={<ProjectList />} />
                    <Route path="/projects/:id" element={<ProjectDetail />} />
                </Routes>
            </UsernameGate>
        </BrowserRouter>
    );
}
