import { useState, type FormEvent } from 'react';
import Button from '../ui/Button';
import { IconCheck, IconEye, IconEyeOff, IconLayers, IconMerge, IconPencil, IconPlus, IconTrash } from '../ui/Icon';
import type { Layer, LayerCategory } from '../../types/cad';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, MAX_LAYERS } from '../../data/layerMeta';
import './panels.css';
import './LayerPanel.css';

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string;
  onSelectActiveLayer: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  onDeleteLayer: (id: string) => void;
  onAddLayer: (name: string, category: LayerCategory) => void;
  mergeMode: boolean;
  mergeSelection: string[];
  onEnterMergeMode: () => void;
  onCancelMerge: () => void;
  onToggleMergeSelect: (id: string) => void;
  onConfirmMerge: () => void;
}

/** 좌측 하단: 레이어 표시/숨김, 이름 변경, 추가·삭제(최대 6개), 병합 */
export default function LayerPanel({
  layers,
  activeLayerId,
  onSelectActiveLayer,
  onToggleVisible,
  onRenameLayer,
  onDeleteLayer,
  onAddLayer,
  mergeMode,
  mergeSelection,
  onEnterMergeMode,
  onCancelMerge,
  onToggleMergeSelect,
  onConfirmMerge,
}: LayerPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<LayerCategory>('etc');

  const startEdit = (layer: Layer) => {
    setEditingId(layer.id);
    setEditingName(layer.name);
  };

  const commitEdit = () => {
    if (editingId && editingName.trim()) {
      onRenameLayer(editingId, editingName.trim());
    }
    setEditingId(null);
  };

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim() || CATEGORY_LABELS[newCategory];
    onAddLayer(name, newCategory);
    setNewName('');
    setNewCategory('etc');
    setAdding(false);
  };

  return (
    <section className="panel layer-panel">
      <h2 className="panel-title">
        <IconLayers className="panel-title-icon" /> 레이어 ({layers.length}/{MAX_LAYERS})
      </h2>

      {mergeMode && (
        <p className="layer-merge-hint">
          병합할 레이어 2개를 선택하세요 ({mergeSelection.length}/2) — 먼저 선택한 레이어 이름이 유지됩니다.
        </p>
      )}

      <ul className="layer-list">
        {layers.map((layer) => {
          const isSelected = mergeSelection.includes(layer.id);
          const isEditing = editingId === layer.id;
          const isNameLocked = layer.category === 'wall';
          const isActive = !mergeMode && layer.id === activeLayerId;

          return (
            <li
              key={layer.id}
              className={[
                'layer-row',
                mergeMode ? 'layer-row-mergeable' : 'layer-row-selectable',
                isSelected ? 'layer-row-selected' : '',
                isActive ? 'layer-row-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={
                isEditing
                  ? undefined
                  : mergeMode
                    ? () => onToggleMergeSelect(layer.id)
                    : () => onSelectActiveLayer(layer.id)
              }
              aria-label={isActive ? `${layer.name} (그리기 대상 레이어)` : `${layer.name} 선택`}
            >
              <span className="layer-dot" style={{ background: layer.color }} />

              {isEditing ? (
                <input
                  className="layer-name-input"
                  value={editingName}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <span className="layer-name">
                  {layer.name}
                  {layer.name !== CATEGORY_LABELS[layer.category] && (
                    <span className="layer-category-tag">{CATEGORY_LABELS[layer.category]}</span>
                  )}
                  {isActive && <span className="layer-active-badge">그리는 중</span>}
                </span>
              )}

              {mergeMode ? (
                <span className={`layer-merge-checkbox ${isSelected ? 'checked' : ''}`}>
                  {isSelected && <IconCheck />}
                </span>
              ) : (
                !isEditing && (
                  <div className="layer-row-actions">
                    {!isNameLocked && (
                      <button type="button" className="layer-icon-btn" onClick={(e) => { e.stopPropagation(); startEdit(layer); }} aria-label={`${layer.name} 이름 변경`}>
                        <IconPencil />
                      </button>
                    )}
                    <button type="button" className="layer-icon-btn" onClick={(e) => { e.stopPropagation(); onDeleteLayer(layer.id); }} aria-label={`${layer.name} 삭제`}>
                      <IconTrash />
                    </button>
                    <button
                      type="button"
                      className="layer-icon-btn"
                      onClick={(e) => { e.stopPropagation(); onToggleVisible(layer.id); }}
                      aria-label={layer.visible ? `${layer.name} 숨기기` : `${layer.name} 표시`}
                    >
                      {layer.visible ? <IconEye /> : <IconEyeOff className="layer-hidden-icon" />}
                    </button>
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>

      {!mergeMode && (
        adding ? (
          <form className="layer-add-form" onSubmit={handleAddSubmit}>
            <input
              className="layer-add-name"
              placeholder="레이어 이름"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as LayerCategory)}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <div className="layer-add-actions">
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>취소</Button>
              <Button type="submit" size="sm">추가</Button>
            </div>
          </form>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            icon={<IconPlus />}
            onClick={() => setAdding(true)}
            disabled={layers.length >= MAX_LAYERS}
            className="layer-add-btn"
          >
            {layers.length >= MAX_LAYERS ? '최대 6개까지 추가 가능' : '레이어 추가'}
          </Button>
        )
      )}

      {mergeMode ? (
        <div className="layer-merge-actions">
          <Button size="sm" variant="ghost" onClick={onCancelMerge}>취소</Button>
          <Button size="sm" onClick={onConfirmMerge} disabled={mergeSelection.length !== 2}>병합 실행</Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon={<IconMerge />}
          onClick={onEnterMergeMode}
          disabled={layers.length < 2}
          className="layer-merge-btn"
        >
          레이어 병합
        </Button>
      )}
    </section>
  );
}
