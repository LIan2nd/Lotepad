import {
  ArrowUpToLine,
  ArrowDownToLine,
  Copy,
  Group,
  RotateCw,
  Layers3,
  Lock,
  Unlock,
  FlipHorizontal,
  ArrowUp,
  ArrowDown,
  Ungroup,
  PaintBucket,
} from "lucide-react";
import { Menu } from "../../components/ui";
import type { ArrangeAction } from "./editorAdapter";
export function SelectionTools({
  count,
  onArrange,
  onRecolor,
}: {
  count: number;
  onArrange: (action: ArrangeAction) => void;
  onRecolor: () => void;
}) {
  return (
    <div
      className="selection-tools"
      role="toolbar"
      aria-label="Arrange creative elements"
    >
      <span>{count ? `${count} selected` : "Arrange"}</span>
      <button
        className="icon-button"
        title="Duplicate selection"
        aria-label="Duplicate selection"
        disabled={!count}
        onClick={() => onArrange("duplicate")}
      >
        <Copy size={16} />
      </button>
      <button
        className="icon-button"
        title="Rotate selection 5 degrees"
        aria-label="Rotate selection 5 degrees"
        disabled={!count}
        onClick={() => onArrange("rotate")}
      >
        <RotateCw size={16} />
      </button>
      <button
        className="icon-button"
        title="Group selection"
        aria-label="Group selection"
        disabled={count < 2}
        onClick={() => onArrange("group")}
      >
        <Group size={16} />
      </button>
      <button
        className="icon-button"
        title="Recolor selection"
        aria-label="Recolor selection"
        disabled={!count}
        onClick={onRecolor}
      >
        <PaintBucket size={16} />
      </button>
      <Menu
        label="Arrange options"
        items={[
          {
            label: "Bring to front",
            icon: <ArrowUpToLine size={15} />,
            disabled: !count,
            action: () => onArrange("front"),
          },
          {
            label: "Bring forward",
            icon: <ArrowUp size={15} />,
            disabled: !count,
            action: () => onArrange("forward"),
          },
          {
            label: "Send backward",
            icon: <ArrowDown size={15} />,
            disabled: !count,
            action: () => onArrange("backward"),
          },
          {
            label: "Send to back",
            icon: <ArrowDownToLine size={15} />,
            disabled: !count,
            action: () => onArrange("back"),
          },
          {
            label: "Ungroup",
            icon: <Ungroup size={15} />,
            disabled: !count,
            action: () => onArrange("ungroup"),
          },
          {
            label: "Flip image horizontally",
            icon: <FlipHorizontal size={15} />,
            disabled: !count,
            action: () => onArrange("flip"),
          },
          {
            label: "Lock selection",
            icon: <Lock size={15} />,
            disabled: !count,
            action: () => onArrange("lock"),
          },
          {
            label: "Unlock creative items",
            icon: <Unlock size={15} />,
            action: () => onArrange("unlock"),
          },
        ]}
      />
      <Layers3 className="selection-layer-icon" size={14} />
    </div>
  );
}
