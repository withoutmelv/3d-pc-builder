import { packageNames, isPacked, packageItems } from '../../../shared/packages.js';
import { openPackage } from '../../../shared/unpacking.js';
import { withProductIdentity } from '../../../shared/product-identity.js';
import { COVER_KEYS, getSlotCovers } from '../../../shared/slot-covers.js';
import { STANDOFF_KEYS, getStandoffSlots } from '../../../shared/standoffs.js';
import {
  MOUNT_PARTS,
  getMounting,
  mountingSecure,
  changeMounting,
} from '../../../shared/cooler-mount.js';
import { CABLE_NAMES, getWiring, getCableConnections } from '../../../shared/power-wiring.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Hand, RotateCcw, RotateCw, X } from 'lucide-react';
import {
  getPartPose,
  getMemorySlot,
  getCooling,
  getCoolerFans,
  getFanConnections,
  getCoolerScrewDepths,
  getStorage,
  getGraphics,
  getPower,
  transitionAssembly,
  validateAssembly,
} from '../../../shared/assembly';
import { request } from '../api';
import { createRoomAssembly, changeStock, validateRoomSelection } from '../../../shared/room';
import { RoomStockPanel } from '../components/RoomStockPanel';
import { preset } from '../components/ui';
import { WorkbenchViewport } from '../components/WorkbenchViewport';
import '../styles/workshop.css';
import { createWorkshopAudio } from '../audio/workshop-audio';
const partNames = {
  ...packageNames,
  slotCover0: '下方槽位挡板',
  slotCover1: '上方槽位挡板',
  ...Object.fromEntries(STANDOFF_KEYS.map((key) => [key, '铜柱'])),
  ioShield: 'I/O 挡板',
  stockMount0: '上方原卡座',
  stockMount1: '下方原卡座',
  coolerMount0: '上方散热支架',
  coolerMount1: '下方散热支架',
  coolerFan0: '前侧散热风扇',
  coolerFan1: '中间散热风扇',
  storage: '磁盘',
  gpu: '显卡',
  psu: '电源',
  cooler: '散热器',
  board: '主板',
  cpu: 'CPU',
  memory0: '第一根内存',
  memory1: '第二根内存',
  panel: '机箱侧板',
  case: '机箱',
};
const wrapAngle = (angle) => ((angle % 360) + 360) % 360;
export default function Workshop({ initialArea = 'workbench' }) {
  const [stockOpen, setStockOpen] = useState(initialArea === 'shelves');
  const [stockPart, setStockPart] = useState(null);
  const [selection, setSelection] = useState({});
  const [catalogue, setCatalogue] = useState([]);
  const inventory = useMemo(
    () => catalogue.filter((part) => selection[part.category] === part.id),
    [catalogue, selection],
  );
  const { id } = useParams(),
    navigate = useNavigate(),
    scene = useRef(null);
  const [assembly, setAssembly] = useState(() => createRoomAssembly({}, { boxed: true })),
    [held, setHeld] = useState(null),
    [tool, setTool] = useState('hand'),
    [cable, setCable] = useState(null);
  const [loading, setLoading] = useState(Boolean(id)),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [look, setLook] = useState({ active: false, fallback: false }),
    [aim, setAim] = useState({ active: false, label: '' }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request('/parts', { signal: controller.signal })
      .then((parts) => setCatalogue(parts.map(withProductIdentity)))
      .catch((e) => {
        if (e.name !== 'AbortError') setError('配件目录加载失败，请重试');
      });
    return () => controller.abort();
  }, [retry]);
  const audio = useRef(null);
  const [operationFeedback, setOperationFeedback] = useState(null);
  useEffect(() => {
    audio.current = createWorkshopAudio();
    return () => audio.current?.dispose();
  }, []);
  useEffect(() => {
    if (!operationFeedback) return;
    const timer = setTimeout(() => setOperationFeedback(null), 1200);
    return () => clearTimeout(timer);
  }, [operationFeedback]);
  const current = useRef({ assembly, held, tool, cable, selection, catalogue });
  current.current = { assembly, held, tool, cable, selection, catalogue };
  useEffect(() => {
    if (!id) {
      setError('');
      setHeld(null);
      setCable(null);
      setTool('hand');
      setSelection({});
      setAssembly(createRoomAssembly({}, { boxed: true }));

      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    setHeld(null);
    setCable(null);
    request(`/builds/${id}`)
      .then((build) => {
        if (!build.assembly) build.assembly = createRoomAssembly(build.selection);
        validateAssembly(build.assembly);
        if (!active) return;
        setSelection(build.selection);
        setAssembly(build.assembly);
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  const interact = useCallback((event) => {
    const { assembly: s, held: h, tool: t, cable: c } = current.current;
    try {
      if (event.type === 'power-check') {
        const message =
          event.report.message +
          (event.report.warnings.length ? ' · ' + event.report.warnings.join('；') : '');
        setNotice(message);
        setOperationFeedback({ message, success: event.report.stage === 'ready' });
        return;
      }
      if (event.type === 'cable-pick') {
        if (h || c || t !== 'hand') throw new Error('请先放下手中的物品或线缆');
        if (!Object.hasOwn(CABLE_NAMES, event.cable)) throw new Error('供电线无效');
        if (
          (event.cable === 'frontPower' ? !s.layout?.case : !getPower(s).placed) ||
          !s.panelRemoved
        )
          throw new Error(
            event.cable === 'frontPower' ? '请先选择机箱并打开侧板' : '请先安装电源并打开机箱侧板',
          );
        if (getCableConnections(s)[event.cable]) throw new Error('这根供电线已连接，请先拔下');
        setCable(event.cable);
        setNotice('已拿起' + CABLE_NAMES[event.cable] + '线，对准对应接口左键连接');
        audio.current?.play('pick');
        return;
      }
      if (event.type === 'cable-cancel') {
        setCable(null);
        setNotice(c === 'frontPower' ? '开机键线头已放回机箱内' : '线头已放回电源旁');
        return;
      }
      if (event.type === 'cable-port')
        event = {
          type: 'action',
          action: c
            ? { type: 'cable-connect', cable: c, target: event.target }
            : { type: 'cable-disconnect', target: event.target },
        };
      if (
        c &&
        ['stock', 'pick', 'tool', 'action'].includes(event.type) &&
        event.action?.type !== 'cable-connect'
      )
        throw new Error('请先接上线缆，或左键空白处放回线头');
      if (event.type === 'stock') {
        setStockPart(event.part);
        setStockOpen(true);

        return;
      }
      if (event.type === 'hint') {
        setNotice(event.message);
        setOperationFeedback({ message: event.message, success: false });
        return;
      }
      if (event.type === 'look') {
        setLook({ active: event.active, fallback: Boolean(event.fallback) });
        return;
      }
      if (event.type === 'aim') {
        setAim({ active: Boolean(event.active), label: event.label || '' });
        setOperationFeedback((feedback) => (feedback?.success ? feedback : null));
        return;
      }
      if (event.type === 'camera') {
        return;
      }
      if (event.type === 'height') {
        setHeld((h) =>
          h ? { ...h, height: Math.max(20, Math.min(420, h.height + event.delta)) } : null,
        );
        return;
      }
      if (event.type === 'tool') {
        if (h) throw new Error('请先放下或放回拿着的零件，再切换工具。');
        setTool(event.tool);
        audio.current?.play(event.tool === 'hand' ? 'place' : 'pick');
        return;
      }
      if (event.type === 'package-pick') {
        if (h || c || t !== 'hand') throw new Error('请先放下手中的物品');
        if (
          s.packages?.[event.category] !== 'open' ||
          !packageItems(s, event.category).includes(event.part)
        )
          throw new Error('该配件不在打开的盒内');
        setHeld({
          part: event.part,
          rotation: ['cpu', 'memory0', 'memory1', 'cooler', 'coolerFan0', 'coolerFan1'].includes(
            event.part,
          )
            ? 180
            : 0,
          height: event.part === 'case' ? 200 : 100,
          fromPackage: event.category,
        });
        audio.current?.play('pick');
        setNotice(`已拿起${partNames[event.part]}，左键放下或安装`);
        return;
      }
      if (event.type === 'package-open') {
        if (h || c || t !== 'hand') throw new Error('请先放下手中的物品');
        const next = openPackage(s, event.category);
        validateRoomSelection(next, current.current.selection, current.current.catalogue);
        setAssembly(next);
        setNotice('包装盒已打开，对准盒内具体配件左键拿起');
        audio.current?.play('place');
        return;
      }
      if (event.type === 'pick') {
        if (!partNames[event.part]) return;
        if (isPacked(s, event.part)) throw new Error('请先开盒取出配件');
        if (t !== 'hand') throw new Error('先切换到手，再拿取零件。');
        if (h) throw new Error('手里已有零件，请先点击左键放下。');
        const part = event.part;
        if (s.frontPower && (part === 'board' || (part === 'case' && s.board !== 'case')))
          throw new Error('请先拔下 POWER SW 开机键线');
        if (
          STANDOFF_KEYS.includes(part) &&
          getStandoffSlots(s)[STANDOFF_KEYS.indexOf(part)] !== null
        ) {
          if (!s.panelRemoved) throw new Error('请先打开机箱侧板');
          if (s.board === 'case') throw new Error('主板遮挡铜柱，请先取出主板');
        }
        if (COVER_KEYS.includes(part)) {
          const status = getSlotCovers(s)[COVER_KEYS.indexOf(part)];
          if (status === 'locked') throw new Error('请先松开槽位挡板螺丝');
          if (status !== 'tray' && !s.panelRemoved) throw new Error('请先打开机箱侧板');
        }
        if (part === 'case' && getSlotCovers(s).includes('seated'))
          throw new Error('槽位挡板尚未固定，请先拧紧或取下');
        if (part === 'ioShield' && s.ioShield === 'installed') {
          if (!s.panelRemoved) throw new Error('请先打开机箱侧板');
          if (s.board === 'case') throw new Error('主板接口挡住了挡板，请先取出主板');
        }
        if (MOUNT_PARTS[part]) {
          const { kind, index } = MOUNT_PARTS[part];
          if (getMounting(s)[kind][index]) changeMounting(s, { type: 'mount-remove', part });
        }
        if ((part === 'board' || (part === 'case' && s.board === 'case')) && !mountingSecure(s))
          throw new Error('支架尚未固定，请拧紧或取下后再搬动');
        if (part.startsWith('coolerFan')) {
          if (getFanConnections(s)[Number(part.at(-1))]) throw new Error('请先拔下这只风扇的线');
          if (getCoolerFans(s)[Number(part.at(-1))] === 'locked')
            throw new Error('请先松开风扇钢丝扣');
          if (getCooling(s).placed && s.board === 'case' && !s.panelRemoved)
            throw new Error('请先打开机箱侧板');
        }
        if (
          (part === 'cooler' ||
            ((part === 'board' || (part === 'case' && s.board === 'case')) &&
              getCooling(s).placed)) &&
          getCoolerFans(s).includes('seated')
        )
          throw new Error('风扇尚未扣紧，请先固定或取下风扇');
        if (part === 'cpu' && s.cpu !== 'tray' && !s.socketOpen)
          throw new Error('请先释放压杆并打开压盖，再取出 CPU');
        const wiring = getWiring(s);
        if ((part === 'board' || part === 'psu') && Object.values(wiring).some(Boolean))
          throw new Error('请先拔下主板、CPU 和显卡供电线');
        if (part === 'gpu' && wiring.gpu) throw new Error('请先拔下显卡供电线');
        const power = getPower(s);
        if (part === 'psu' && power.placed) {
          if (!s.panelRemoved) throw new Error('请先打开机箱侧板');
          if (power.screws.some(Boolean)) throw new Error('请先松开全部电源固定螺丝');
        }
        if (part === 'case' && power.placed && !power.screws.every(Boolean))
          throw new Error('电源尚未固定，请先拧紧全部螺丝或取下电源');
        const graphics = getGraphics(s);
        if (part === 'gpu' && graphics.placed) {
          if (s.board === 'case' && !s.panelRemoved) throw new Error('请先打开机箱侧板');
          if (graphics.screwed) throw new Error('请先松开显卡挡板螺丝');
          if (!graphics.latchOpen) throw new Error('请先打开 PCIe 卡扣');
        }
        if (
          (part === 'board' || (part === 'case' && s.board === 'case')) &&
          graphics.placed &&
          graphics.latchOpen
        )
          throw new Error('显卡卡扣尚未锁定，请先关闭卡扣或取下显卡');
        if (part === 'board' && graphics.screwed) throw new Error('请先松开显卡挡板螺丝');
        if (part === 'storage' && getStorage(s) === 'locked')
          throw new Error('请先松开 M.2 固定螺丝');
        if (
          (part === 'board' || (part === 'case' && s.board === 'case')) &&
          getStorage(s) === 'seated'
        )
          throw new Error('磁盘尚未固定，请先拧紧 M.2 螺丝或取下磁盘');
        if (part === 'cooler' && getCooling(s).placed) {
          if (s.board === 'case' && !s.panelRemoved) throw new Error('请先打开机箱侧板');
          if (getCooling(s).fanConnected) throw new Error('请先拔下散热器风扇线');
          if (getCoolerScrewDepths(s).some(Boolean)) throw new Error('请先松开散热器固定螺丝');
        }
        if (
          (part === 'board' || (part === 'case' && s.board === 'case')) &&
          getCooling(s).placed &&
          !getCooling(s).screws.every(Boolean)
        )
          throw new Error('散热器尚未固定，请先固定或取下');
        if (part === 'board') {
          if (s.board === 'case' && !s.panelRemoved)
            throw new Error('侧板挡住了主板，请先移开侧板。');
          if (s.screws.some(Boolean)) throw new Error('主板仍被螺丝固定，请先松开固定点。');
          if (s.cpu === 'seated' || s.memory.includes('seated'))
            throw new Error('主板上有未锁定的零件，请先锁定或取下，避免移动时脱落。');
        }
        if (part === 'case' && s.board === 'case' && !s.screws.every(Boolean))
          throw new Error('机箱内的主板尚未固定，请先固定或取出主板再移动机箱。');
        if (
          part === 'case' &&
          s.board === 'case' &&
          (s.cpu === 'seated' || s.memory.includes('seated'))
        )
          throw new Error('机箱内有未锁定的零件，请先锁定或取出，避免移动时脱落。');
        const mountPart = MOUNT_PARTS[part];
        const attached = mountPart
          ? getMounting(s)[mountPart.kind][mountPart.index]
            ? 'seated'
            : 'tray'
          : part.startsWith('coolerFan')
            ? getCoolerFans(s)[Number(part.at(-1))]
            : part === 'gpu' && graphics.placed
              ? 'seated'
              : part === 'cpu'
                ? s.cpu
                : part === 'storage'
                  ? getStorage(s)
                  : part.startsWith('memory')
                    ? s.memory[Number(part.at(-1))]
                    : null;
        if (attached === 'locked') throw new Error('零件仍被扣具固定，请先解锁。');
        if (
          attached === 'seated' &&
          s.board === 'case' &&
          !s.panelRemoved &&
          (!part.startsWith('coolerFan') || getCooling(s).placed)
        )
          throw new Error('请先移开机箱侧板，才能取出里面的零件。');
        const pose = getPartPose(
          s,
          part.startsWith('coolerFan') && attached !== 'tray'
            ? getCooling(s).placed
              ? 'board'
              : 'cooler'
            : (STANDOFF_KEYS.includes(part) &&
                  getStandoffSlots(s)[STANDOFF_KEYS.indexOf(part)] !== null) ||
                (COVER_KEYS.includes(part) &&
                  getSlotCovers(s)[COVER_KEYS.indexOf(part)] !== 'tray') ||
                (part === 'ioShield' && s.ioShield === 'installed') ||
                (part === 'panel' && !s.panelRemoved) ||
                (part === 'psu' && power.placed)
              ? 'case'
              : attached === 'seated' || (part === 'cooler' && getCooling(s).placed)
                ? 'board'
                : part,
        );
        setHeld({ part, rotation: pose.rotation, height: part === 'case' ? 200 : 100 });
        audio.current?.play('pick');
        setOperationFeedback(null);
        setNotice(`已拿起${partNames[part]} · 左键放下 / R 旋转`);
        return;
      }
      let action;
      if (event.type === 'place') {
        if (!h) throw new Error('先拿起一个零件，再选择放置位置。');
        const target = event.target;
        if (target === 'table') action = { type: 'table-place', part: h.part, pose: event.pose };
        else if (target === 'bench' && h.part === 'board') action = { type: 'board-to-bench' };
        else {
          const receiverRotation = getPartPose(
            s,
            ['case', 'panel', 'psu', 'ioShield', ...STANDOFF_KEYS, ...COVER_KEYS].includes(target)
              ? 'case'
              : 'board',
          ).rotation;
          const angle = wrapAngle(event.rotation ?? h.rotation - receiverRotation);
          if (!STANDOFF_KEYS.includes(h.part) && Math.min(angle, 360 - angle) > 45)
            throw new Error('安装方向未对齐，请旋转零件，使角标、缺口或安装孔与轮廓一致。');
          if (COVER_KEYS.includes(h.part) && target === h.part) {
            const index = COVER_KEYS.indexOf(h.part);
            if (getSlotCovers(s)[index] !== 'tray') {
              setHeld(null);
              return;
            }
            action = { type: 'slot-cover-place', index };
          } else if (STANDOFF_KEYS.includes(h.part) && STANDOFF_KEYS.includes(target)) {
            const partIndex = STANDOFF_KEYS.indexOf(h.part),
              index = STANDOFF_KEYS.indexOf(target);
            if (getStandoffSlots(s)[partIndex] === index) {
              setHeld(null);
              return;
            }
            action = { type: 'standoff-install', index, partIndex };
          } else if (h.part === 'ioShield' && target === 'ioShield') {
            if (s.ioShield === 'installed') {
              setHeld(null);
              return;
            }
            action = { type: 'io-shield-install' };
          } else if (MOUNT_PARTS[h.part] && target === h.part) {
            const { kind, index } = MOUNT_PARTS[h.part];
            if (getMounting(s)[kind][index]) {
              setHeld(null);
              return;
            }
            action = { type: 'mount-place', part: h.part };
          } else if (h.part === 'psu' && target === 'psu') {
            if (getPower(s).placed) {
              setHeld(null);
              setCable(null);
              return;
            }
            action = { type: 'psu-place' };
          } else if (h.part.startsWith('coolerFan') && target === h.part) {
            const index = Number(h.part.at(-1));
            if (getCoolerFans(s)[index] === 'seated') {
              setHeld(null);
              return;
            }
            action = { type: 'cooler-fan-place', index };
          } else if (h.part === 'gpu' && target === 'gpu') {
            action = { type: 'gpu-place' };
          } else if (h.part === 'storage' && target === 'storage') {
            if (getStorage(s) === 'seated') {
              setHeld(null);
              setCable(null);
              return;
            }
            action = { type: 'storage-place' };
          } else if (h.part === 'cooler' && target === 'cooler') {
            if (getCooling(s).placed) {
              setHeld(null);
              setCable(null);
              return;
            }
            action = { type: 'cooler-place' };
          } else if (h.part === 'board' && target === 'case') {
            if (s.board === 'case') {
              setHeld(null);
              setCable(null);
              return;
            }
            action = { type: 'board-to-case' };
          } else if (h.part === 'panel' && target === 'panel') {
            if (!s.panelRemoved) {
              setHeld(null);
              setCable(null);
              return;
            }
            action = { type: 'panel-close' };
          } else if (h.part === 'cpu' && target === 'socket') {
            if (s.cpu === 'seated') {
              setHeld(null);
              setCable(null);
              return;
            }
            action = { type: 'cpu-place' };
          } else if (h.part.startsWith('memory') && target.startsWith('memory')) {
            const index = Number(target.at(-1));
            const partIndex = Number(h.part.at(-1));
            if (s.memory[partIndex] === 'seated' && getMemorySlot(s, partIndex) === index) {
              setHeld(null);
              setCable(null);
              return;
            }
            action = { type: 'memory-place', index, partIndex };
          } else throw new Error('这个零件与此安装口不匹配。可以自由放下，或对准对应安装口。');
        }
      } else if (event.type === 'action') {
        action = event.action;
        if (h) throw new Error('请先点击左键放下零件，再操作扣具。');
        if (
          [
            'screw',
            'unscrew',
            'cooler-screw',
            'cooler-screw-step',
            'mount-screw',
            'mount-unscrew',
            'slot-cover-screw',
            'slot-cover-unscrew',
            'cooler-unscrew',
            'storage-screw',
            'storage-unscrew',
            'gpu-screw',
            'gpu-unscrew',
            'psu-screw',
            'psu-unscrew',
          ].includes(action.type) &&
          t !== 'driver'
        )
          throw new Error('请拿起螺丝刀后操作固定点。');
        if (action.type === 'paste-apply' && t !== 'paste') throw new Error('请先拿起硅脂管');
        if (
          ![
            'screw',
            'unscrew',
            'cooler-screw',
            'cooler-screw-step',
            'mount-screw',
            'mount-unscrew',
            'slot-cover-screw',
            'slot-cover-unscrew',
            'cooler-unscrew',
            'storage-screw',
            'storage-unscrew',
            'gpu-screw',
            'gpu-unscrew',
            'psu-screw',
            'psu-unscrew',
            'paste-apply',
          ].includes(action.type) &&
          t !== 'hand'
        )
          throw new Error('这个动作需要用手，请放下螺丝刀。');
      }
      if (!action) return;
      const next = transitionAssembly(s, h?.fromPackage ? { ...action, unpack: h.part } : action);
      validateRoomSelection(next, current.current.selection, current.current.catalogue);
      setAssembly(next);
      setHeld(null);
      setCable(null);
      const feedback = {
        'io-shield-install': 'I/O 挡板已扣入机箱开口，可以安装主板',
        'cable-connect': CABLE_NAMES[action.target] + '线已连接',
        'cable-disconnect':
          CABLE_NAMES[action.target] +
          (action.target === 'frontPower'
            ? '线已拔下，线头放回机箱内'
            : '供电线已拔下，线头放回电源旁'),
        'psu-place': '电源已落位，请固定后部四颗螺丝',
        'standoff-install': '铜柱已旋入固定孔',
        'standoff-remove': '铜柱已拆下',
        'psu-screw': '电源固定点已拧紧',
        'psu-unscrew': '电源固定点已松开',
        'gpu-place': '显卡已插入，PCIe 卡扣已锁定；入箱后固定挡板螺丝',
        'gpu-open': 'PCIe 卡扣已打开',
        'gpu-close': 'PCIe 卡扣已关闭',
        'gpu-screw': next.screws.every(Boolean)
          ? '显卡挡板已固定'
          : '显卡挡板已固定，主板仍有螺丝未拧紧',
        'gpu-unscrew': '挡板螺丝已松开，打开 PCIe 卡扣后即可取出显卡',
        'slot-cover-place': '槽位挡板已放回，请用螺丝刀固定',
        'slot-cover-screw': '槽位挡板已固定',
        'slot-cover-unscrew': '螺丝已松开，放下螺丝刀即可拿走挡板',
        'storage-place': '磁盘已斜插，对准末端左键压平，再用螺丝刀固定',
        'storage-press': 'M.2 已压平，可以拿起螺丝刀固定末端',
        'storage-lift': 'M.2 末端已抬起，可重新压平或取出',
        'storage-screw': 'M.2 磁盘已固定',
        'storage-unscrew': 'M.2 螺丝已松开，可以取出磁盘',
        'paste-apply': '硅脂已涂好，可以安装散热器',
        'mount-place': '支架已落位，请固定两端螺丝',
        'mount-screw': '支架固定点已拧紧',
        'mount-unscrew': '支架螺丝已松开，两端全部松开后可拿走',
        'cooler-film-remove': '底座保护膜已撕下',
        'cooler-place': next.coolerFilm
          ? '底座保护膜还没撕，请取下散热器移除保护膜'
          : '散热器已落位，建议两侧交替拧紧',
        'cooler-screw-step': `此侧拧入 ${getCoolerScrewDepths(next)[action.index]}/3 · ${getCooling(next).screws.every(Boolean) ? '两侧已固定' : '建议换另一侧均匀拧紧'}`,
        'cooler-screw': '散热器固定点已拧紧',
        'cooler-unscrew': '散热器固定点已松开',
        'fan-connect': next.coolerFilm
          ? '风扇线已连接，但底座保护膜未撕，会影响散热'
          : `${action.index === 0 ? '左侧' : action.index === 1 ? '右侧' : ''}风扇线已连接`,
        'cooler-fan-place': '风扇已贴合，点击顶部钢丝扣固定',
        'cooler-fan-clip': '风扇钢丝扣已扣紧',
        'cooler-fan-unclip': '钢丝扣已松开，可从风扇侧面拿起',
        'fan-disconnect': '风扇线已拔下',
        'table-place': '已放下，位置和角度会随进度保存',
        'board-to-bench': '主板已放到操作垫',
        'socket-open': '压杆已释放，可以放入或取出 CPU',
        'socket-lever-open': '压杆已释放，左键点击压盖将其打开',
        'socket-cover-open': '压盖已打开，可以放入或取出 CPU',
        'socket-cover-close': '压盖已合上，还需左键锁住压杆',
        'socket-lever-lock': 'CPU 压杆已扣紧',
        'cpu-place':
          current.current.catalogue.find(
            (part) => part.id === current.current.selection.motherboard,
          )?.specs.socket === 'AM4'
            ? 'CPU 已落位，请锁住压杆'
            : 'CPU 已落位，请合上压盖后锁住压杆',
        'cpu-lock': 'CPU 压杆已扣紧',
        'memory-open': '内存卡扣已打开',
        'memory-place': '内存已对齐，左键点击顶部压紧；侧面可拿起',
        'memory-press': '内存已压紧，卡扣自动闭合',
        'memory-lock': '卡扣已关闭',
        'panel-remove': '侧板已打开，可以拿起并重新摆放',
        'panel-close': '侧板已盖回',
        'board-to-case':
          next.ioShield === 'tray'
            ? '主板已落位；独立 I/O 挡板尚未安装，补装时需先取出主板'
            : '主板已落位，可继续安装部件或固定螺丝',
        screw: '固定点已拧紧',
        unscrew: '固定点已松开',
        'board-remove': '主板已取回，已安装部件一同移动',
      };
      if (
        ['board-to-case', 'cooler-place'].includes(action.type) &&
        next.board === 'case' &&
        getCooling(next).placed
      ) {
        const chosen = current.current.selection;
        const parts = current.current.catalogue;
        const coolerHeight = parts.find((part) => part.id === chosen.cooler)?.specs.height;
        const limit = parts.find((part) => part.id === chosen.case)?.specs.maxCoolerHeight;
        if (coolerHeight > limit)
          feedback[action.type] =
            `已落位；散热器高 ${coolerHeight}mm，超过机箱限高 ${limit}mm，侧板需保持打开`;
      }
      setNotice(feedback[action.type] || '装配状态已更新');
      setOperationFeedback({ message: feedback[action.type] || '装配状态已更新', success: true });
      const installed = [
        'cable-connect',
        'psu-place',
        'gpu-place',
        'storage-place',
        'cpu-place',
        'memory-place',
        'board-to-case',
        'panel-close',
        'cooler-place',
      ].includes(action.type);
      audio.current?.play(
        installed
          ? 'install'
          : [
                'screw',
                'unscrew',
                'cooler-screw',
                'cooler-screw-step',
                'mount-screw',
                'mount-unscrew',
                'slot-cover-screw',
                'slot-cover-unscrew',
                'cooler-unscrew',
                'storage-screw',
                'storage-unscrew',
                'gpu-screw',
                'gpu-unscrew',
                'psu-screw',
                'psu-unscrew',
              ].includes(action.type)
            ? 'screw'
            : [
                  'socket-open',
                  'socket-lever-open',
                  'socket-cover-open',
                  'socket-cover-close',
                  'socket-lever-lock',
                  'cpu-lock',
                  'memory-open',
                  'memory-press',
                  'cooler-fan-clip',
                  'cooler-fan-unclip',
                  'memory-lock',
                  'gpu-open',
                  'gpu-close',
                ].includes(action.type)
              ? 'latch'
              : 'place',
      );
    } catch (e) {
      setNotice(e.message);
      setOperationFeedback({ message: e.message, success: false });
    }
  }, []);
  function rotate(delta = 90) {
    setHeld((h) => (h ? { ...h, rotation: wrapAngle(h.rotation + delta) } : null));
  }
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)
        return;
      if (e.key === 'Escape') {
        scene.current?.exitLook();
      }
      if (
        e.key.toLowerCase() === 'r' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.repeat &&
        (current.current.held || current.current.tool === 'driver')
      ) {
        e.preventDefault();
        if (!current.current.held) {
          scene.current?.toggleScrewDirection();
          return;
        }
        setHeld((h) =>
          h ? { ...h, rotation: wrapAngle(h.rotation + (e.shiftKey ? -90 : 90)) } : null,
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  function goArea(next) {
    setStockOpen(next === 'shelves');

    scene.current?.view(next === 'workbench' ? 'overview' : next);
  }
  function chooseStock(part, remove = false) {
    if (held || cable || tool !== 'hand') {
      setNotice('请先放下手中的物品，再挑选配件');
      return;
    }
    try {
      const next = changeStock(assembly, selection, part.category, remove ? null : part.id);
      validateRoomSelection(next.assembly, next.selection, catalogue);
      setAssembly(next.assembly);
      setSelection(next.selection);
      setNotice(remove ? '配件已从推车移除' : '包装盒已放入推车，可自行拿到工作台');
      audio.current?.play('place');
    } catch (e) {
      setNotice(e.message);
    }
  }
  function fillStock() {
    if (held || cable || tool !== 'hand') return;
    try {
      let next = { assembly, selection };
      for (const [category, id] of Object.entries(preset))
        if (!next.selection[category])
          next = changeStock(next.assembly, next.selection, category, id);
      validateRoomSelection(next.assembly, next.selection, catalogue);
      setAssembly(next.assembly);
      setSelection(next.selection);
      setNotice('推荐配件已补充到推车');
    } catch (e) {
      setNotice(e.message);
    }
  }
  return (
    <div
      className={`workshop ${look.active ? 'is-playing' : ''} ${look.fallback ? 'look-fallback' : ''}`}
    >
      {loading ? (
        <div className="workshop-loading">
          <span className="spinner" />
          正在还原工作台…
        </div>
      ) : error ? (
        <div className="workshop-loading" role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>重试</button>
          <button onClick={() => navigate('/workbench')}>新建工作台</button>
        </div>
      ) : (
        <>
          <WorkbenchViewport
            ref={scene}
            inventory={inventory}
            catalogue={catalogue}
            initialArea={initialArea}
            assembly={assembly}
            held={held}
            tool={tool}
            cable={cable}
            onInteraction={interact}
          />
          {stockOpen && !look.active && (
            <RoomStockPanel
              catalogue={catalogue}
              selection={selection}
              assembly={assembly}
              inspected={stockPart}
              busy={!!held || !!cable || tool !== 'hand'}
              onChoose={chooseStock}
              onClose={() => setStockOpen(false)}
              onCategory={(category) => scene.current?.view(`shelf:${category}`)}
              onCart={() => goArea('cart')}
              onRecommend={fillStock}
            />
          )}
          {!look.active && (
            <div className="fps-controls">
              <p>点击场景进入操作</p>
            </div>
          )}
          {look.active && (
            <>
              <div
                className={`fps-reticle ${aim.active ? 'can-interact' : ''}`}
                aria-hidden="true"
              />
              <div className="fps-controls">
                <div className="fps-controls-keys">
                  <span>
                    <kbd>左键</kbd> 拿放 / 交互
                  </span>
                  <span>
                    <kbd>按住左键</kbd> 拧螺丝
                  </span>
                  <span>
                    <kbd>R</kbd> 旋转
                  </span>
                  <span>
                    <kbd>WASD</kbd> 移动 · Shift 加速
                  </span>
                  <span>
                    <kbd>Q / E</kbd> 下降 / 上升
                  </span>
                  <span>
                    <kbd>Esc</kbd> 释放鼠标
                  </span>
                </div>
                {(operationFeedback?.message || aim.label) && (
                  <p
                    className={`fps-target ${(operationFeedback ? operationFeedback.success : aim.active) ? '' : 'is-blocked'}`}
                    role="status"
                  >
                    {operationFeedback?.message || aim.label}
                  </p>
                )}
              </div>
            </>
          )}
          {held && !look.active && (
            <div className="holding-bar">
              <Hand size={19} />
              <span>
                拿着{partNames[held.part]}
                <small>角度 {Math.round(held.rotation)}° · R 旋转 / Shift + R 反向</small>
              </span>
              <button aria-label="逆时针旋转零件" onClick={() => rotate(-90)}>
                <RotateCcw size={15} />
                −90°
              </button>
              <button aria-label="顺时针旋转零件" onClick={() => rotate(90)}>
                <RotateCw size={15} />
                +90° <kbd>R</kbd>
              </button>
              <button aria-label="放下手中物品" onClick={() => scene.current?.placeHeld()}>
                <Check size={15} />
                放下 <kbd>左键</kbd>
              </button>
              <button
                onClick={() => {
                  setHeld(null);
                  setCable(null);
                  setNotice('零件已放回拿取前的位置');
                }}
              >
                <X size={15} />
                放回原位
              </button>
            </div>
          )}
        </>
      )}
      {notice && !look.active && (
        <div className="workshop-notice" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
