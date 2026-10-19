import { loadDetailedModels } from '../three/detailed-models.js';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createWorkbench } from '../three/workbench';
export const WorkbenchViewport = forwardRef(function WorkbenchViewport(
  { assembly, held, tool, cable, inventory, catalogue, initialArea, onInteraction },
  ref,
) {
  const element = useRef(null),
    api = useRef(null),
    interaction = useRef(onInteraction);
  interaction.current = onInteraction;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const latest = useRef();
  latest.current = { assembly, held, tool, inventory, cable };
  useImperativeHandle(
    ref,
    () => ({
      view: (name) => api.current?.view(name),
      enterLook: () => api.current?.enterLook(),
      exitLook: () => api.current?.exitLook(),
      interact: () => api.current?.interact(),
      toggleScrewDirection: () => api.current?.toggleScrewDirection(),
      cameraStep: (direction) => api.current?.cameraStep(direction),
      moveHeld: (dx, dz) => api.current?.moveHeld(dx, dz),
      placeHeld: () => api.current?.placeHeld(),
    }),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    loadDetailedModels()
      .then(() => {
        if (cancelled) return;
        api.current = createWorkbench(
          element.current,
          (event) => interaction.current(event),
          catalogue,
        );
        const current = latest.current;
        api.current.update(
          current.assembly,
          current.held,
          current.tool,
          current.inventory,
          current.cable,
        );
        if (initialArea === 'shelves') api.current.view('shelves');
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setLoading(false);
        setError('3D 模型加载失败，请刷新重试，并确认浏览器已启用硬件加速。');
      });
    return () => {
      cancelled = true;
      api.current?.dispose();
      api.current = null;
    };
  }, [catalogue]);
  useEffect(() => {
    api.current?.update(assembly, held, tool, inventory, cable);
  }, [assembly, held, tool, inventory, catalogue, cable]);
  return (
    <div className="workbench-viewport" ref={element} aria-label="可交互的 3D 装机工作台">
      {loading && (
        <div className="workbench-error" role="status">
          正在加载装机模型…
        </div>
      )}
      {error && (
        <div className="workbench-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
});
