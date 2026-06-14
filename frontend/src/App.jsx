import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import ProjectList   from './pages/ProjectList';
import ProjectDetail from './pages/ProjectDetail';
import ProjectGantt  from './pages/ProjectGantt';
import AlarmList            from './pages/AlarmList';
import AlertSettings        from './pages/AlertSettings';
import TrashList            from './pages/TrashList';
import ProcessPatternAdmin     from './pages/ProcessPatternAdmin';
import MilestonePatternAdmin  from './pages/MilestonePatternAdmin';

function NavBar() {
    return (
        <nav className="nav-bar">
            <NavLink to="/projects" className="nav-brand">工程管理</NavLink>
            <div className="nav-links">
                <NavLink
                    to="/projects"
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                    案件一覧
                </NavLink>
                <NavLink
                    to="/trash"
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                    ゴミ箱
                </NavLink>
                <NavLink
                    to="/gantt"
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                    プログラムガント
                </NavLink>
                <NavLink
                    to="/alerts"
                    end
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                    アラーム
                </NavLink>
                <NavLink
                    to="/alerts/settings"
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                    アラート設定
                </NavLink>
                <NavLink
                    to="/process-patterns"
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                    工程パターン
                </NavLink>
                <NavLink
                    to="/milestone-patterns"
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                    マイルストーンパターン
                </NavLink>
            </div>
        </nav>
    );
}

function UsernameGate({ children }) {
    const [name,  setName]  = useState(() => sessionStorage.getItem('userName') || '');
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
            <div className="modal" style={{ width: 380, textAlign: 'center' }}>
                <div style={{ marginBottom: 6, fontSize: 28 }}>🗓️</div>
                <h2 className="modal-title" style={{ marginBottom: 8, fontSize: 19 }}>工程管理システム</h2>
                <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                    編集ロック管理のためユーザー名を入力してください。
                </p>
                <form onSubmit={handleSave}>
                    <div className="form-group" style={{ textAlign: 'left' }}>
                        <label className="form-label">ユーザー名</label>
                        <input
                            className="form-control"
                            placeholder="例: 山田 太郎"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', height: 42, fontSize: 14 }} disabled={!input.trim()}>
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
                <NavBar />
                <Routes>
                    <Route path="/"                  element={<Navigate to="/projects" replace />} />
                    <Route path="/projects"          element={<ProjectList />} />
                    <Route path="/gantt"             element={<ProjectGantt />} />
                    <Route path="/projects/:id"      element={<ProjectDetail />} />
                    <Route path="/trash"              element={<TrashList />} />
                    <Route path="/alerts"            element={<AlarmList />} />
                    <Route path="/alerts/settings"   element={<AlertSettings />} />
                    <Route path="/process-patterns"    element={<ProcessPatternAdmin />} />
                    <Route path="/milestone-patterns" element={<MilestonePatternAdmin />} />
                </Routes>
            </UsernameGate>
        </BrowserRouter>
    );
}
