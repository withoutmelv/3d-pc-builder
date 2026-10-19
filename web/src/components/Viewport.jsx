import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { createScene } from '../three/scene';
export const Viewport = forwardRef(function Viewport({ parts, selected, glass, onSelect }, ref) {
  const container = useRef(null),
    api = useRef(null),
    onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [error, setError] = useState('');
  useImperativeHandle(
    ref,
    () => ({
      view: (name) => api.current?.view(name),
      screenshot: () => api.current?.screenshot(),
    }),
    [],
  );
  useEffect(() => {
    try {
      api.current = createScene(container.current, (category) => onSelectRef.current(category));
    } catch {
      setError('无法启动 3D 视图，请使用支持 WebGL 的浏览器并开启硬件加速。');
    }
    return () => {
      api.current?.dispose();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    api.current?.update(parts, selected, glass);
  }, [parts, selected, glass]);
  return (
    <div className="viewport" ref={container} aria-label="3D 整机预览">
      {error && <div className="scene-error">{error}</div>}
    </div>
  );
});
