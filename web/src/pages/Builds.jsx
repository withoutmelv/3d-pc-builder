import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Box, Copy, Plus, Trash2 } from 'lucide-react';
import { request, send } from '../api';
import { Brand } from '../components/ui';
export default function Builds() {
  const navigate = useNavigate();
  const [builds, setBuilds] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      setBuilds(await request('/builds'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function remove(build) {
    if (!window.confirm(`删除“${build.name}”？此操作无法撤销。`)) return;
    setBusy(true);
    try {
      await request(`/builds/${build.id}`, { method: 'DELETE' });
      setBuilds((list) => list.filter((b) => b.id !== build.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(build) {
    setBusy(true);
    try {
      const b = await send('/builds', 'POST', {
        name: `${build.name.slice(0, 74)} · 副本`,
        selection: build.selection,
        assembly: build.assembly ?? null,
      });
      navigate(`/${b.assembly ? 'workbench' : 'builder'}/${b.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="library">
      <header className="topbar">
        <Brand />
        <button onClick={() => navigate('/workbench')}>
          <ArrowLeft size={16} />
          返回工作台
        </button>
      </header>
      <main className="library-main">
        <span className="eyebrow">YOUR COLLECTION</span>
        <div className="library-heading">
          <div>
            <h1>
              我的配置<span>{builds.length.toString().padStart(2, '0')}</span>
            </h1>
            <p>保存每一次灵感，继续下一次搭建。</p>
          </div>
          <button className="primary" onClick={() => navigate('/workbench')}>
            <Plus size={17} />
            新建配置
          </button>
        </div>
        {error && (
          <div className="inline-error" role="alert">
            {error}
            <button onClick={load}>重试</button>
          </div>
        )}
        {loading ? (
          <p>正在读取配置…</p>
        ) : !builds.length ? (
          <div className="library-empty">
            <Box size={46} />
            <h2>你的装机故事，从这里开始。</h2>
            <p>在工作台保存的配置会出现在这里。</p>
            <button className="primary" onClick={() => navigate('/workbench')}>
              开始装机
              <ArrowUpRight size={17} />
            </button>
          </div>
        ) : (
          <div className="build-list">
            {builds.map((b, i) => (
              <article className="build-item" key={b.id}>
                <span className="build-index">{String(i + 1).padStart(2, '0')}</span>
                <Box size={32} strokeWidth={1} />
                <div>
                  <h2>{b.name}</h2>
                  <p>
                    {b.assembly
                      ? `装配进度 · ${b.assembly.screws.filter(Boolean).length} / 4 固定点`
                      : `${Object.keys(b.selection).length} / 8 类配件`}
                    <span>·</span>
                    {new Date(b.updatedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <button
                  className="open-build"
                  onClick={() => navigate(`/${b.assembly ? 'workbench' : 'builder'}/${b.id}`)}
                >
                  继续搭建
                  <ArrowUpRight size={17} />
                </button>
                <button
                  className="icon-button"
                  disabled={busy}
                  title="复制配置"
                  aria-label={`复制${b.name}`}
                  onClick={() => copy(b)}
                >
                  <Copy size={17} />
                </button>
                <button
                  className="icon-button"
                  disabled={busy}
                  title="删除配置"
                  aria-label={`删除${b.name}`}
                  onClick={() => remove(b)}
                >
                  <Trash2 size={17} />
                </button>
              </article>
            ))}
          </div>
        )}
        <p className="library-footnote">配置保存在本机 SQLite 数据库中 · 单用户工作空间</p>
      </main>
    </div>
  );
}
