import { catalogueTotal } from '../../../shared/compatibility';
import { isStockAvailable } from '../../../shared/stock-catalogue.js';
import { useEffect, useState } from 'react';
import { X, Check, ArrowRight } from 'lucide-react';
import { categories, money } from './ui';
import { canChangeStock } from '../../../shared/room';
import { request } from '../api';
import '../styles/room-stock.css';
export function RoomStockPanel({
  catalogue,
  selection,
  assembly,
  inspected,
  busy,
  onChoose,
  onClose,
  onCategory,
  onCart,
  onRecommend,
}) {
  const [category, setCategory] = useState(inspected?.category || 'cpu');
  const [detail, setDetail] = useState(inspected),
    [check, setCheck] = useState(null);
  useEffect(() => {
    if (inspected) {
      setDetail(inspected);
      setCategory(inspected.category);
    }
  }, [inspected]);
  useEffect(() => {
    const controller = new AbortController();
    request('/builds/check', {
      method: 'POST',
      body: JSON.stringify({ selection }),
      signal: controller.signal,
    })
      .then(setCheck)
      .catch(() => setCheck(null));
    return () => controller.abort();
  }, [selection]);
  const selected = catalogue.filter((p) => selection[p.category] === p.id);
  const editable = canChangeStock(assembly, category) && !busy;
  return (
    <aside className="room-stock-panel" aria-label="货架选件">
      <header>
        <div>
          <small>房间 / 配件货架</small>
          <h2>挑选配件</h2>
        </div>
        <button aria-label="关闭货架选件" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <nav aria-label="货架分类">
        {categories.map((c) => (
          <button
            key={c.id}
            className={category === c.id ? 'active' : ''}
            onClick={() => {
              setCategory(c.id);
              setDetail(null);
              onCategory(c.id);
            }}
          >
            {c.label}
            {selection[c.id] && <Check size={11} />}
          </button>
        ))}
      </nav>
      <div className="room-stock-options">
        {catalogue
          .filter((p) => p.category === category && isStockAvailable(p))
          .map((p) => (
            <button
              key={p.id}
              className={detail?.id === p.id ? 'inspected' : ''}
              onClick={() => setDetail(p)}
            >
              <strong>{p.name}</strong>
              <span>{p.summary}</span>
              <small>
                {money(p.price)}
                {selection[category] === p.id ? ' · 已选' : ''}
              </small>
            </button>
          ))}
      </div>
      {detail && (
        <section className="room-stock-detail">
          <h3>{detail.name}</h3>
          <p>{detail.description}</p>
          <p>{detail.summary}</p>
          <button
            className="room-stock-primary"
            disabled={!editable}
            onClick={() => onChoose(detail, selection[category] === detail.id)}
          >
            {selection[category] === detail.id
              ? '从推车移除'
              : selection[category]
                ? '更换推车中的配件'
                : '加入推车'}
          </button>
          {!editable && <p>请先放下手中物品；更换前需拆下原配件并放回推车。</p>}
        </section>
      )}
      {check?.conflicts > 0 && (
        <div className="room-stock-conflicts">
          {check.checks
            .filter((c) => c.status === 'conflict')
            .map((c) => (
              <p key={c.code}>{c.message}</p>
            ))}
          <small>可以继续选件，实际安装时检查匹配情况。</small>
        </div>
      )}
      <section className="room-stock-chosen">
        <h3>本机配件 · {selected.length} / 8</h3>
        {selected.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setCategory(p.category);
              setDetail(p);
              onCategory(p.category);
            }}
          >
            <span>{p.name}</span>
            <small>{canChangeStock(assembly, p.category) ? '在推车' : '已取出'}</small>
          </button>
        ))}
      </section>
      <footer>
        <strong>{money(catalogueTotal(selected))}</strong>
        <button disabled={busy} onClick={onRecommend}>
          补齐推荐配件
        </button>
        <button className="room-stock-primary" onClick={onCart}>
          前往推车
          <ArrowRight size={15} />
        </button>
      </footer>
    </aside>
  );
}
