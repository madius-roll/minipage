import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '../../types/cad';
import type { LoadedImage } from '../../utils/imageWarp';
import './PointStage.css';

interface PointStageProps {
  image: LoadedImage;
  /** 그림 위의 점들 (그림 px 좌표) */
  points: Point[];
  onChange: (points: Point[]) => void;
  /** 점들을 어떻게 이어 보여줄지 — 네 모서리는 닫힌 사각형, 두 점은 선분 */
  connect: 'polygon' | 'line';
  /** 각 점 옆에 붙일 짧은 이름표 */
  labels: string[];
}

/** 손잡이를 끄는 동안 띄우는 확대경의 지름(px)과 배율 — 손가락이 가린 지점을 크게 보여준다 */
const LOUPE_SIZE = 116;
const LOUPE_ZOOM = 3;
/** 그림 가장자리에 놓인 손잡이도 잡을 수 있도록 그림 둘레에 두는 여백(px) */
const STAGE_PADDING = 22;

/**
 * 그림 위에 점 손잡이를 올려 끌어서 맞추는 영역.
 * 터치로도 정확히 찍을 수 있도록, 손잡이를 끄는 동안 그 지점을 확대해 보여주는 확대경을 띄운다.
 */
export default function PointStage({ image, points, onChange, connect, labels }: PointStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  /** 지금 끌고 있는 손잡이 — 누른 직후(화면이 다시 그려지기 전)에 들어오는 움직임도 놓치지 않도록 ref로도 들고 있는다 */
  const dragRef = useRef<number | null>(null);

  const startDrag = (index: number) => {
    dragRef.current = index;
    setDragIndex(index);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragIndex(null);
  };

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 그림을 영역 안에 비율을 지켜 최대한 크게 넣는다
  const scale = Math.max(0.01, Math.min((frame.width - STAGE_PADDING * 2) / image.width, (frame.height - STAGE_PADDING * 2) / image.height));
  const shownW = image.width * scale;
  const shownH = image.height * scale;

  const toImagePoint = (e: ReactPointerEvent<HTMLElement>): Point | null => {
    const rect = frameRef.current?.querySelector('.point-stage-image')?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(image.width, Math.max(0, (e.clientX - rect.left) / scale)),
      y: Math.min(image.height, Math.max(0, (e.clientY - rect.top) / scale)),
    };
  };

  const handlePointerDown = (index: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startDrag(index);
  };

  const handlePointerMove = (index: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current !== index) return;
    const p = toImagePoint(e);
    if (p) onChange(points.map((prev, i) => (i === index ? p : prev)));
  };

  const dragged = dragIndex !== null ? points[dragIndex] : null;
  // 확대경은 손가락에 가리지 않게 손잡이 위쪽에 띄우되, 그림 위쪽 끝에서는 아래로 내린다
  const loupeBelow = dragged ? dragged.y * scale < LOUPE_SIZE + 24 : false;

  return (
    <div className="point-stage" ref={frameRef}>
      {frame.width > 0 && (
        <div className="point-stage-image" style={{ width: shownW, height: shownH }}>
          <img src={image.url} alt="" draggable={false} />
          <svg viewBox={`0 0 ${image.width} ${image.height}`} preserveAspectRatio="none" aria-hidden="true">
            {connect === 'polygon' ? (
              <polygon points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
            ) : (
              <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} />
            )}
          </svg>

          {points.map((p, i) => (
            <button
              key={i}
              type="button"
              className={`point-handle ${dragIndex === i ? 'is-dragging' : ''}`}
              style={{ left: p.x * scale, top: p.y * scale }}
              onPointerDown={handlePointerDown(i)}
              onPointerMove={handlePointerMove(i)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-label={`${labels[i]} 점`}
            >
              <span className="point-handle-dot" />
              <span className="point-handle-label">{labels[i]}</span>
            </button>
          ))}

          {dragged && (
            <div
              className="point-loupe"
              style={{
                width: LOUPE_SIZE,
                height: LOUPE_SIZE,
                left: Math.min(shownW - LOUPE_SIZE / 2, Math.max(LOUPE_SIZE / 2, dragged.x * scale)),
                top: dragged.y * scale + (loupeBelow ? LOUPE_SIZE / 2 + 30 : -(LOUPE_SIZE / 2 + 30)),
                backgroundImage: `url(${image.url})`,
                backgroundSize: `${shownW * LOUPE_ZOOM}px ${shownH * LOUPE_ZOOM}px`,
                backgroundPosition: `${LOUPE_SIZE / 2 - dragged.x * scale * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - dragged.y * scale * LOUPE_ZOOM}px`,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
