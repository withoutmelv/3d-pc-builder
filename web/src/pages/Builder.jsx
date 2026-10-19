import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Layers,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { request, send } from '../api';
import { categories, money, preset, Brand, PartArt } from '../components/ui';
import { Dialog } from '../components/Dialog';
import { Viewport } from '../components/Viewport';
import '../styles/immersive.css';
const specLabels = {
  socket: 'CPU 插槽',
  memoryType: '内存代际',
  formFactor: '主板规格',
  formFactors: '支持主板',
  maxGpuLength: '显卡限长',
  maxCoolerHeight: '散热限高',
  height: '散热器高度',
  length: '显卡长度',
  cores: '核心数量',
  capacity: '容量',
  vram: '显存',
  interface: '接口',
  wattage: '额定功率',
};
export default function Builder() {
  const { id } = useParams(),
    navigate = useNavigate(),
    viewport = useRef(null);
  const [catalog, setCatalog] = useState([]),
    [selection, setSelection] = useState({}),
    [name, setName] = useState('我的第一台主机');
  const [panel, setPanel] = useState(null);
  const [zen, setZen] = useState(false);
  function selectCategory(category) {
    setSelected(category);
    setPanel('detail');
  }
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setZen(false);
        setPanel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [selected, setSelected] = useState('gpu'),
    [glass, setGlass] = useState(false),
    [view, setView] = useState('perspective');
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [check, setCheck] = useState(null),
    [checkError, setCheckError] = useState('');
  const [picker, setPicker] = useState(false),
    [query, setQuery] = useState(''),
    [rules, setRules] = useState(false),
    [newDialog, setNewDialog] = useState(false);
  const [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [savedSnapshot, setSavedSnapshot] = useState(null);
  const [retry, setRetry] = useState(0);
  const skipReload = useRef(null);
  const snapshot = JSON.stringify({ name, selection }),
    dirty = savedSnapshot !== snapshot;
  const parts = Object.fromEntries(
    Object.entries(selection)
      .map(([c, pid]) => [c, catalog.find((p) => p.id === pid)])
      .filter(([, p]) => p),
  );
  const part = parts[selected],
    category = categories.find((c) => c.id === selected);
  useEffect(() => {
    if ((skipReload.current === id && id) || (skipReload.current === 'new' && !id)) {
      skipReload.current = null;
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError('');
    setSavedSnapshot(null);
    Promise.all([request('/parts'), id ? request(`/builds/${id}`) : Promise.resolve(null)])
      .then(([all, build]) => {
        if (!active) return;
        setCatalog(all);
        setSelection(build?.selection || preset);
        setName(build?.name || '我的第一台主机');
        setSavedSnapshot(
          build ? JSON.stringify({ name: build.name, selection: build.selection }) : null,
        );
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setLoadError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  useEffect(() => {
    if (loading || loadError) return;
    const controller = new AbortController();
    setCheck(null);
    setCheckError('');
    request('/builds/check', {
      method: 'POST',
      body: JSON.stringify({ selection }),
      signal: controller.signal,
    })
      .then(setCheck)
      .catch((e) => {
        if (e.name !== 'AbortError') setCheckError(e.message);
      });
    return () => controller.abort();
  }, [selection, loading, loadError]);
  useEffect(() => {
    const fn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  function replace(pid) {
    setSelection((s) => ({ ...s, [selected]: pid }));
    setPicker(false);
    setNotice('配件已安装');
  }
  function remove() {
    setSelection((s) => {
      const next = { ...s };
      delete next[selected];
      return next;
    });
  }
  async function save() {
    if (!name.trim()) {
      setError('请填写配置名称');
      return;
    }
    setSaving(true);
    setError('');
    const payload = { name: name.trim(), selection };
    try {
      const build = await send(id ? `/builds/${id}` : '/builds', id ? 'PUT' : 'POST', payload);
      setName((current) => (current === name ? build.name : current));
      setSavedSnapshot(JSON.stringify(payload));
      if (!id) {
        skipReload.current = build.id;
        navigate(`/builder/${build.id}`, { replace: true });
      }
      setNotice('配置已保存');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  function openBuilds() {
    if (!dirty || window.confirm('当前修改尚未保存，仍要离开吗？')) navigate('/builds');
  }
  function newBuild(empty) {
    setNewDialog(false);
    setSelection(empty ? {} : preset);
    setName(empty ? '未命名配置' : '我的第一台主机');
    setSavedSnapshot(null);
    if (id) {
      skipReload.current = 'new';
      navigate('/builder');
    }
    setNotice(empty ? '已创建空白配置' : '已载入示例整机');
  }
  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }
  function exportList() {
    const text = [
      name,
      '演示配置 · 价格仅供演示',
      '',
      ...categories.map(
        (c) =>
          `${c.label}：${parts[c.id]?.name || '未选择'}${parts[c.id] ? ` / ${money(parts[c.id].price)}` : ''}`,
      ),
      '',
      `参考总价：${money(Object.values(parts).reduce((n, p) => n + p.price, 0))}`,
      '基础校验不代表完整装配保证。',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    download(url, `${name}.txt`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function screenshot() {
    const url = viewport.current?.screenshot();
    if (url) download(url, `${name}.png`);
    else setError('当前 3D 视图不可用，无法导出截图');
  }
  const total = Object.values(parts).reduce((n, p) => n + p.price, 0);
  const candidates = catalog.filter(
    (p) =>
      p.category === selected &&
      `${p.name} ${p.summary}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={`app-shell immersive ${zen ? 'zen' : ''}`}>
      <header className="topbar">
        <Brand />
        <span className="top-divider" />
        <span className="workspace-label">
          3D 装机工作室 <span className="beta">BETA</span>
        </span>
        <nav>
          <button
            onClick={() => {
              if (!dirty || window.confirm('当前修改尚未保存，仍要离开吗？'))
                navigate('/workbench');
            }}
          >
            装机工作台
          </button>
          <button className="zen-toggle" aria-pressed={zen} onClick={() => setZen((v) => !v)}>
            {zen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {zen ? '退出纯净视图' : '纯净视图'}
          </button>
          <button disabled={saving} onClick={openBuilds}>
            <FolderOpen size={16} />
            我的配置
          </button>
          <button disabled={saving} onClick={() => setNewDialog(true)}>
            <Plus size={16} />
            新建
          </button>
          <button className="primary" disabled={loading || !!loadError || saving} onClick={save}>
            <Save size={15} />
            {saving ? '保存中…' : '保存配置'}
          </button>
        </nav>
      </header>
      {loading ? (
        <div className="full-state">
          <span className="spinner" />
          正在准备工作台…
        </div>
      ) : loadError ? (
        <div className="full-state">
          <TriangleAlert />
          <p>{loadError}</p>
          <button className="primary" onClick={() => setRetry((n) => n + 1)}>
            重新加载
          </button>
          <button onClick={() => navigate('/builder')}>返回新建配置</button>
        </div>
      ) : (
        <>
          <div className="projectbar">
            <div>
              <span className="eyebrow">BUILD STUDIO / 01</span>
              <div className="project-name">
                <input
                  aria-label="配置名称"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className={`save-indicator ${dirty ? '' : 'saved'}`}>
                  {dirty ? '未保存的修改' : '已保存'}
                </span>
              </div>
            </div>
            <button
              className="parts-toggle"
              aria-expanded={panel === 'parts'}
              aria-controls="parts-panel"
              onClick={() => setPanel(panel === 'parts' ? null : 'parts')}
            >
              <Layers size={16} /> 配件清单
              <span>{Object.keys(selection).length} / 8</span>
              <ChevronRight size={14} />
            </button>
          </div>
          <main className="workspace">
            {panel === 'parts' && (
              <aside className="parts-sidebar" id="parts-panel" aria-label="配件清单">
                <div className="section-heading">
                  <h2>配件清单</h2>
                  <span>
                    {Object.keys(selection).length}
                    <small> / 8</small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label="收起配件清单"
                    onClick={() => setPanel(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="parts-list">
                  {categories.map(({ id: cat, label, Icon }, i) => {
                    const p = parts[cat];
                    return (
                      <button
                        key={cat}
                        className={`part-row ${selected === cat ? 'active' : ''}`}
                        onClick={() => selectCategory(cat)}
                      >
                        <span className="part-number">0{i + 1}</span>
                        <Icon className="part-icon" size={20} />
                        <span className="part-row-info">
                          <span className="part-label">
                            {label}
                            {p && <Check size={11} />}
                          </span>
                          <strong>{p?.name || '选择配件'}</strong>
                          <small>{p ? money(p.price) : '尚未安装'}</small>
                        </span>
                        <ChevronRight className="row-chevron" size={14} />
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}
            <section className="scene-panel">
              <div className="stage-caption">
                <span>AIR / 01</span>
                <p>3D 装机工作室</p>
              </div>
              <Viewport
                ref={viewport}
                parts={parts}
                selected={selected}
                glass={glass}
                onSelect={selectCategory}
              />
              {!Object.keys(parts).length && (
                <div className="empty-scene">
                  <Box size={36} />
                  <h2>从一个机箱开始</h2>
                  <p>在左侧选择配件，构建你的第一台主机。</p>
                  <button
                    className="primary"
                    onClick={() => {
                      setSelected('case');
                      setQuery('');
                      setPicker(true);
                    }}
                  >
                    选择机箱 <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <div className="scene-side-tools">
                <button
                  className={glass ? 'selected' : ''}
                  aria-label={glass ? '隐藏侧板' : '显示侧板'}
                  title={glass ? '隐藏侧板' : '显示侧板'}
                  onClick={() => setGlass((v) => !v)}
                >
                  {glass ? <Eye size={19} /> : <EyeOff size={19} />}
                </button>
                <button
                  aria-label="重置视角"
                  title="重置视角"
                  onClick={() => {
                    viewport.current?.view('perspective');
                    setView('perspective');
                  }}
                >
                  <RotateCcw size={18} />
                </button>
                <button aria-label="导出整机截图" title="导出整机截图" onClick={screenshot}>
                  <Download size={18} />
                </button>
              </div>
              <div className="scene-bottom">
                <div className="view-switch">
                  {[
                    ['perspective', '透视'],
                    ['side', '侧面'],
                    ['front', '正面'],
                    ['top', '顶部'],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={view === v ? 'active' : ''}
                      onClick={() => {
                        setView(v);
                        viewport.current?.view(v);
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <span className="orbit-hint">
                  拖动旋转<span>·</span>滚轮缩放<span>·</span>点击配件查看详情
                </span>
              </div>
            </section>
            {panel === 'detail' && (
              <aside className="inspector" aria-label="配件详情">
                <div className="section-heading">
                  <h2>配件详情</h2>
                  <button
                    className="icon-button"
                    aria-label="收起配件详情"
                    onClick={() => setPanel(null)}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="inspector-body">
                  <span className="eyebrow">{category.en}</span>
                  <h1>{part?.name || `选择${category.label}`}</h1>
                  <p className="description">
                    {part?.description || `为你的主机挑选一款${category.label}，预览安装效果。`}
                  </p>
                  {part && (
                    <>
                      <div className="price-label">
                        参考价格<strong>{money(part.price)}</strong>
                      </div>
                      <dl className="specs">
                        {Object.entries(part.specs).map(([k, v]) => (
                          <div key={k}>
                            <dt>{specLabels[k] || k}</dt>
                            <dd>
                              {Array.isArray(v)
                                ? v.join(' / ')
                                : `${v}${['length', 'height', 'maxGpuLength', 'maxCoolerHeight'].includes(k) ? ' mm' : k === 'wattage' ? ' W' : ''}`}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  )}
                  <button
                    className="primary full"
                    onClick={() => {
                      setQuery('');
                      setPicker(true);
                    }}
                  >
                    {part ? '更换配件' : '选择配件'}
                    <ArrowRight size={16} />
                  </button>
                  {part && (
                    <button className="remove-button" onClick={remove}>
                      <Trash2 size={13} />
                      移除配件
                    </button>
                  )}
                  <div className="model-note">
                    <span className="tiny-label">模型说明</span>
                    <p>基础几何体模拟外观与尺寸。配件名称、规格及价格均为演示数据。</p>
                  </div>
                </div>
              </aside>
            )}
            <nav className="component-dock" aria-label="快速选择配件">
              {categories.map(({ id: cat, label, Icon }) => (
                <button
                  key={cat}
                  title={label}
                  aria-label={`查看${label}`}
                  aria-pressed={panel === 'detail' && selected === cat}
                  className={panel === 'detail' && selected === cat ? 'active' : ''}
                  onClick={() => {
                    if (selected === cat && panel === 'detail') setPanel(null);
                    else selectCategory(cat);
                  }}
                >
                  <Icon size={21} strokeWidth={1.4} />
                  <span>{label}</span>
                  <i className={parts[cat] ? 'installed' : ''} />
                </button>
              ))}
            </nav>
          </main>
          <footer className="statusbar">
            <button
              className={`compat-status ${check?.conflicts ? 'warning' : ''}`}
              onClick={() => setRules(true)}
            >
              {check?.conflicts ? <TriangleAlert size={20} /> : <ShieldCheck size={21} />}
              <span>
                {checkError
                  ? '兼容性检查失败'
                  : !check
                    ? '正在检查…'
                    : check.conflicts
                      ? `${check.conflicts} 项规格冲突`
                      : '基础兼容性检查'}
                <small>
                  {checkError
                    ? '点击查看详情'
                    : check
                      ? `${check.checks.filter((c) => c.status === 'pass').length} 项通过 · ${check.unchecked} 项待检查`
                      : '正在读取配件规格'}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
            <div className="status-price">
              <span>
                参考总价 <small>不含外设</small>
              </span>
              <strong>{money(total)}</strong>
              <button className="export-button" onClick={exportList}>
                导出清单
                <Download size={15} />
              </button>
            </div>
          </footer>
        </>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      {error && (
        <div className="toast error" role="alert">
          {error}
          <button aria-label="关闭错误提示" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {picker && (
        <Dialog title={`选择${category.label}`} close={() => setPicker(false)} wide>
          <p className="dialog-subtitle">选择后会自动安装到对应位置；兼容性结果将在底栏更新。</p>
          <label className="search">
            <Search size={18} />
            <input
              autoFocus
              placeholder="搜索配件名称或规格"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="candidate-list">
            {candidates.map((p) => (
              <button
                className={`candidate ${selection[selected] === p.id ? 'chosen' : ''}`}
                key={p.id}
                onClick={() => replace(p.id)}
              >
                <PartArt category={p.category} />
                <span className="candidate-info">
                  <small>{p.brand}</small>
                  <strong>{p.name}</strong>
                  <span>{p.summary}</span>
                </span>
                <span className="candidate-price">
                  {money(p.price)}
                  <small>
                    {selection[selected] === p.id ? '已安装' : '选择安装'}{' '}
                    {selection[selected] === p.id ? <Check size={13} /> : <Plus size={13} />}
                  </small>
                </span>
              </button>
            ))}
            {!candidates.length && (
              <p className="empty-list">没有找到匹配的配件，试试其他关键词。</p>
            )}
          </div>
          <p className="muted-note">演示目录 · 不代表真实商品报价</p>
        </Dialog>
      )}
      {rules && (
        <Dialog title="兼容性检查" close={() => setRules(false)}>
          <p className="dialog-subtitle">依据配件规格进行基础检查，可保存未完成或有冲突的草稿。</p>
          {checkError ? (
            <p role="alert">{checkError}</p>
          ) : !check ? (
            <p>正在检查…</p>
          ) : (
            <>
              <div className="rule-list">
                {check.checks.map((r) => (
                  <div className={`rule ${r.status}`} key={r.code}>
                    {r.status === 'pass' ? (
                      <CheckCircle2 size={19} />
                    ) : r.status === 'conflict' ? (
                      <TriangleAlert size={19} />
                    ) : (
                      <Circle size={19} />
                    )}
                    <div>
                      <strong>
                        {r.title}
                        <span>
                          {r.status === 'pass'
                            ? '通过'
                            : r.status === 'conflict'
                              ? '冲突'
                              : '未校验'}
                        </span>
                      </strong>
                      <p>{r.message}</p>
                      {r.status === 'conflict' && (
                        <button
                          onClick={() => {
                            setSelected(r.categories[0]);
                            setRules(false);
                            setQuery('');
                            setPicker(true);
                          }}
                        >
                          更换{categories.find((c) => c.id === r.categories[0]).label}
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="limits">
                暂未校验：{check.limitations.join('、')}。基础检查通过不代表完整装配保证。
              </p>
            </>
          )}
        </Dialog>
      )}
      {newDialog && (
        <Dialog title="开始一套新配置" close={() => setNewDialog(false)}>
          <p className="dialog-subtitle">
            {dirty ? '当前有未保存的修改，新建后将被替换。' : '选择你的起点。'}
          </p>
          <button className="new-option" onClick={() => newBuild(false)}>
            <Box />
            <span>
              <strong>载入示例整机</strong>
              <small>完整的 8 类配件，从替换开始</small>
            </span>
            <ArrowRight size={18} />
          </button>
          <button className="new-option" onClick={() => newBuild(true)}>
            <Plus />
            <span>
              <strong>从空白开始</strong>
              <small>逐件挑选，搭建自己的配置</small>
            </span>
            <ArrowRight size={18} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
