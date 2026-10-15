import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  Download,
  FileImage,
  FileCode2,
  FileJson,
} from "lucide-react";

const formats = [
  {
    value: "png",
    label: "PNG image",
    description: "Ready to share",
    icon: FileImage,
  },
  {
    value: "svg",
    label: "SVG image",
    description: "Scalable vector",
    icon: FileCode2,
  },
  {
    value: "json",
    label: "Editable Excalidraw",
    description: "Keep every element editable",
    icon: FileJson,
  },
] as const;

export function ExportMenu({
  disabled,
  onExport,
}: {
  disabled: boolean;
  onExport: (format: "png" | "svg" | "json") => void;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        className="export-control"
        aria-label="Export page"
        disabled={disabled}
      >
        <Download size={16} />
        <span>Export</span>
        <ChevronDown className="export-chevron" size={14} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          className="export-menu"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <Dropdown.Label className="export-menu-label">
            Export page
          </Dropdown.Label>
          {formats.map((format) => (
            <Dropdown.Item
              key={format.value}
              className="export-menu-item"
              aria-label={format.label}
              onSelect={() => onExport(format.value)}
            >
              <span className="export-format-icon">
                <format.icon size={19} />
              </span>
              <span className="export-format-copy">
                <span>{format.label}</span>
                <small>{format.description}</small>
              </span>
              <span className="export-format-extension">
                {format.value === "json" ? ".excalidraw" : `.${format.value}`}
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
